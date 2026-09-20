import { describe, expect, it, vi } from "vitest";
import type { ApiOptions } from "@/lib/web/api";
import type { ImportBatchDto, ImportItemUploadDto } from "../../shared/memories-contract";
import {
  availableTasteSources,
  commitSelection,
  confirmedStop,
  momentGroups,
} from "@/components/memories/memory-model";
import {
  prepareImage,
  uploadImage,
  type ImportTransport,
  type PendingImage,
} from "@/components/memories/import-upload";
import { readImageMetadata } from "@/components/memories/photo-metadata";
import {
  contributionDraftSchema,
  submitContribution,
  type ContributionProgress,
} from "@/components/memories/contribution-state";
import {
  importItemCreateSchema,
  memoryMomentCreateSchema,
  momentTagCreateSchema,
} from "@/lib/contracts/memories";
import { editionId, placeId, requestId, snapshot, userId, otherPlaceId } from "./fixtures";
import {
  albumId,
  batchId,
  friendId,
  item,
  itemId,
  moment,
  momentId,
  stop,
} from "./memory-fixtures";

function transport(
  read: (path: string, options?: ApiOptions) => Promise<unknown>,
  upload = vi.fn(async () => {}),
): ImportTransport {
  return {
    userId,
    request: async <T>(path: string, options?: ApiOptions) => (await read(path, options)) as T,
    upload,
  };
}
const pending: PendingImage = {
  file: new Blob(["fixture"], { type: "image/png" }),
  registration: {
    requestId,
    sha256: item.sha256,
    fileName: item.fileName,
    contentType: item.contentType,
    sizeBytes: item.sizeBytes,
    metadata: item.metadata,
  },
};
const fresh = (state = item.state): ImportBatchDto => ({
  id: batchId,
  title: "Test batch",
  state: "open",
  version: 2,
  items: [{ ...item, state }],
  createdAt: item.createdAt,
  updatedAt: item.updatedAt,
});
const uploadResponse: ImportItemUploadDto = {
  item: { ...item, state: "pending_upload" },
  upload: {
    uploaded: false,
    bucket: "captures",
    path: `${userId}/${requestId}.png`,
    token: "synthetic-token",
    signedUrl: "https://example.test/signed",
  },
};

describe("explicit import and visit safety", () => {
  it("keeps unconfirmed photos usable as memories without inventing a visit", () => {
    expect(commitSelection([item], [itemId], [])).toEqual([
      { itemId, createVisit: false, note: null },
    ]);
    expect(() => commitSelection([item], [itemId], [itemId])).toThrow("Confirm the place");
    expect(
      commitSelection([{ ...item, confirmedStop: stop }], [itemId], [itemId])[0].createVisit,
    ).toBe(true);
  });
  it.each(["duplicate", "processing", "failed", "pending_upload", "committed"] as const)(
    "refuses a %s item even if its identifier was selected earlier",
    (state) => {
      expect(() => commitSelection([{ ...item, state }], [itemId], [])).toThrow(
        "uploaded or ready",
      );
    },
  );
  it("rejects vanished and duplicate selections rather than silently saving a different set", () => {
    expect(() => commitSelection([item], [itemId, momentId], [])).toThrow("Refresh");
    expect(() => commitSelection([item], [itemId, itemId], [])).toThrow("Refresh");
  });
  it("requires an explicit historical place, offset, real date and IANA timezone", () => {
    expect(() => confirmedStop("", "2026-09-20T12:00:00Z", "UTC")).toThrow("Choose");
    expect(() => confirmedStop(placeId, "2026-09-20T12:00", "Europe/Paris")).toThrow("offset");
    expect(() => confirmedStop(placeId, "2026-02-30T12:00:00Z", "UTC")).toThrow(
      "valid capture date",
    );
    expect(() => confirmedStop(placeId, "2026-09-20T12:00:00Z", "Not/AZone")).toThrow("IANA");
    expect(confirmedStop(placeId, "2026-09-20T14:30+02:00", "Europe/Paris")).toEqual({
      placeId,
      capturedAt: "2026-09-20T12:30:00.000Z",
      timezone: "Europe/Paris",
    });
  });
  it("groups by confirmed local day and place, respects splits, and isolates unknown stops", () => {
    const groups = momentGroups([
      moment,
      { ...moment, id: itemId },
      { ...moment, id: friendId, groupKey: "second visit" },
      { ...moment, id: albumId, confirmedStop: { ...stop, placeId: otherPlaceId } },
      { ...moment, id: editionId, confirmedStop: null },
      { ...moment, id: requestId, confirmedStop: null },
    ]);
    expect(groups).toHaveLength(5);
    expect(groups.find((group) => group.items.length === 2)?.day).toBe("2026-09-19");
    expect(groups.filter((group) => !group.placeId)).toHaveLength(2);
  });
  it("only offers the actor's own saves and distinguishes visits from want-to-try inputs", () => {
    const data = {
      ...snapshot,
      wishlists: [
        {
          id: albumId,
          ownerId: friendId,
          name: "Shared list",
          isShared: true,
          isDefault: false,
          memberIds: [userId, friendId],
          entries: [
            { placeId, saverIds: [friendId], completedBy: [] },
            { placeId: otherPlaceId, saverIds: [userId], completedBy: [] },
          ],
        },
      ],
    };
    expect(availableTasteSources(data).map((choice) => choice.source)).toEqual([
      { kind: "edition", id: editionId },
      { kind: "saved_place", id: otherPlaceId },
    ]);
  });
});

describe("bounded selected-file upload", () => {
  it("hashes synthetic bytes and keeps the strict API registration separate from the file", async () => {
    const selected = await prepareImage(
      new File(["synthetic bytes"], "fixture.png", { type: "image/png" }),
    );
    expect(selected.registration.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(importItemCreateSchema.safeParse(selected.registration).success).toBe(true);
    expect(selected.registration.metadata.origin).toBe("unknown");
    expect(selected.file).toBeInstanceOf(Blob);
  });
  it("rejects unsupported types, oversized files, and invalid file names before upload", async () => {
    await expect(prepareImage(new File(["x"], "x.heic", { type: "image/heic" }))).rejects.toThrow();
    await expect(
      prepareImage(
        new File([new Uint8Array(10 * 1024 * 1024 + 1)], "x.png", { type: "image/png" }),
      ),
    ).rejects.toThrow("10");
    await expect(
      prepareImage(new File(["x"], "bad/name.png", { type: "image/png" })),
    ).rejects.toThrow("Rename");
  });
  it("never uploads duplicate references or completes them as new bytes", async () => {
    const upload = vi.fn(async () => {});
    const read = vi.fn(async () => ({ item: { ...item, state: "duplicate" }, upload: null }));
    const result = await uploadImage(batchId, pending, transport(read, upload));
    expect(result.state).toBe("duplicate");
    expect(read).toHaveBeenCalledTimes(1);
    expect(upload).not.toHaveBeenCalled();
  });
  it("refuses credentials pointing outside the authenticated owner's storage prefix", async () => {
    const upload = vi.fn(async () => {});
    const read = vi.fn(async () => ({
      ...uploadResponse,
      upload: { ...uploadResponse.upload!, path: `${friendId}/stolen.png` },
    }));
    await expect(uploadImage(batchId, pending, transport(read, upload))).rejects.toThrow(
      "your account",
    );
    expect(upload).not.toHaveBeenCalled();
  });
  it("replays the same registration after upload failure and completes only the current version", async () => {
    const calls: { path: string; body: unknown }[] = [];
    const read = async (path: string, options?: ApiOptions) => {
      calls.push({ path, body: options?.body });
      if (path.endsWith("/items")) return uploadResponse;
      if (path.endsWith("/complete")) return item;
      return {
        ...fresh("pending_upload"),
        items: [{ ...item, state: "pending_upload", version: 7 }],
      };
    };
    const upload = vi
      .fn()
      .mockRejectedValueOnce(new Error("Interrupted"))
      .mockResolvedValue(undefined);
    await expect(uploadImage(batchId, pending, transport(read, upload))).rejects.toThrow(
      "Interrupted",
    );
    expect(calls).toHaveLength(1);
    await uploadImage(batchId, pending, transport(read, upload));
    expect(calls.filter(({ path }) => path.endsWith("/items")).map(({ body }) => body)).toEqual([
      pending.registration,
      pending.registration,
    ]);
    expect(calls.at(-1)?.body).toEqual({ expectedVersion: 7 });
  });
  it("does not repeat completion after a response was lost but the server already completed it", async () => {
    const read = vi.fn(async (path: string) =>
      path.endsWith("/items")
        ? {
            ...uploadResponse,
            upload: {
              uploaded: true,
              bucket: "captures",
              path: `${userId}/${requestId}.png`,
              token: null,
              signedUrl: null,
            },
          }
        : fresh(),
    );
    const upload = vi.fn(async () => {});
    expect(await uploadImage(batchId, pending, transport(read, upload))).toEqual(item);
    expect(upload).not.toHaveBeenCalled();
    expect(read).toHaveBeenCalledTimes(2);
  });
});

describe("resumable explicit moment sharing", () => {
  const progress: ContributionProgress = {
    request: {
      requestId,
      source: { kind: "edition", id: editionId },
      target: { kind: "album", albumId, confirmShare: true },
      note: "Explicit sharing note",
    },
    tags: [{ userId: friendId, requestId: itemId }],
    momentId: null,
    completedTagUsers: [],
  };
  it("resumes interrupted tags without recreating the moment or inventing a personal visit", async () => {
    let persisted = progress;
    const calls: { path: string; body: unknown }[] = [];
    let fail = true;
    const api = {
      request: async <T>(path: string, options: ApiOptions): Promise<T> => {
        calls.push({ path, body: options.body });
        if (path === "/api/moments") {
          expect(memoryMomentCreateSchema.safeParse(options.body).success).toBe(true);
          return moment as T;
        }
        expect(momentTagCreateSchema.safeParse(options.body).success).toBe(true);
        if (fail) {
          fail = false;
          throw new Error("Lost tag response");
        }
        return {} as T;
      },
    };
    await expect(
      submitContribution(progress, api, (next) => {
        persisted = next;
      }),
    ).rejects.toThrow("Lost");
    expect(persisted.momentId).toBe(momentId);
    expect(
      await submitContribution(persisted, api, (next) => {
        persisted = next;
      }),
    ).toBe(momentId);
    expect(calls.filter((call) => call.path === "/api/moments")).toHaveLength(1);
    expect(calls.filter((call) => call.path.endsWith("/tags")).map((call) => call.body)).toEqual([
      { requestId: itemId, userId: friendId, confirmShare: true },
      { requestId: itemId, userId: friendId, confirmShare: true },
    ]);
    expect(calls.some((call) => call.path.includes("editions"))).toBe(false);
    expect(persisted.completedTagUsers).toEqual([friendId]);
  });
  it("does not send anything if durable progress cannot be saved first", async () => {
    const request = vi.fn();
    await expect(
      submitContribution(progress, { request }, () => {
        throw new Error("Storage full");
      }),
    ).rejects.toThrow("Storage full");
    expect(request).not.toHaveBeenCalled();
  });
  it("replays the frozen create after its response is lost", async () => {
    const bodies: unknown[] = [];
    const initial = { ...progress, tags: [] };
    let failed = false;
    const request = async <T>(path: string, options: ApiOptions): Promise<T> => {
      bodies.push(options.body);
      if (!failed) {
        failed = true;
        throw new Error("Lost create response");
      }
      return moment as T;
    };
    await expect(submitContribution(initial, { request }, () => {})).rejects.toThrow("Lost");
    await submitContribution(initial, { request }, () => {});
    expect(bodies).toEqual([initial.request, initial.request]);
  });
  it("rejects corrupted local drafts and does not persist signed media responses", () => {
    const draft = {
      version: 1,
      editionId,
      albumId,
      friendIds: [friendId],
      note: "",
      pending: progress,
      completedMomentId: null,
    };
    expect(contributionDraftSchema.safeParse(draft).success).toBe(true);
    expect(
      contributionDraftSchema.safeParse({ ...draft, signedUrl: "https://example.test/private" })
        .success,
    ).toBe(false);
    expect(contributionDraftSchema.safeParse({ ...draft, friendIds: ["not-an-id"] }).success).toBe(
      false,
    );
  });
});

function metadataFixture({ offset = "+02:00", date = "2026:09:20 14:30:00" } = {}) {
  const tiff = new Uint8Array(150);
  const view = new DataView(tiff.buffer);
  const writeText = (at: number, text: string) =>
    tiff.set(new TextEncoder().encode(`${text}\0`), at);
  view.setUint16(0, 0x4949);
  view.setUint16(2, 42, true);
  view.setUint32(4, 8, true);
  view.setUint16(8, 1, true);
  view.setUint16(10, 0x8769, true);
  view.setUint16(12, 4, true);
  view.setUint32(14, 1, true);
  view.setUint32(18, 30, true);
  view.setUint16(30, 2, true);
  view.setUint16(32, 0x9003, true);
  view.setUint16(34, 2, true);
  view.setUint32(36, 20, true);
  view.setUint32(40, 70, true);
  view.setUint16(44, 0x9011, true);
  view.setUint16(46, 2, true);
  view.setUint32(48, 7, true);
  view.setUint32(52, 100, true);
  writeText(70, date);
  writeText(100, offset);
  const png = new Uint8Array(tiff.length + 20);
  png.set([137, 80, 78, 71, 13, 10, 26, 10]);
  new DataView(png.buffer).setUint32(8, tiff.length);
  png.set(new TextEncoder().encode("eXIf"), 12);
  png.set(tiff, 16);
  return png.buffer;
}

describe("separate bounded metadata suggestions", () => {
  it("reads offset-qualified EXIF instants without pretending that an offset is an IANA timezone", () => {
    expect(readImageMetadata(metadataFixture(), "image/png")).toEqual({
      capturedAt: "2026-09-20T12:30:00.000Z",
      timezone: null,
      latitude: null,
      longitude: null,
      accuracyM: null,
      origin: "exif",
    });
  });
  it("keeps offset-less dates unknown rather than using the device's present timezone", () => {
    expect(readImageMetadata(metadataFixture({ offset: "" }), "image/png").capturedAt).toBeNull();
  });
  it("does not normalize impossible EXIF dates into a different day", () => {
    expect(
      readImageMetadata(metadataFixture({ date: "2026:02:30 14:30:00" }), "image/png").capturedAt,
    ).toBeNull();
  });
  it.each(["image/jpeg", "image/png", "image/webp"] as const)(
    "handles malformed %s bytes without inventing GPS",
    (type) => {
      for (const buffer of [
        new ArrayBuffer(0),
        new Uint8Array([0xff, 0xd8, 0xff]).buffer,
        new Uint8Array(200).fill(255).buffer,
      ]) {
        expect(readImageMetadata(buffer, type)).toEqual(item.metadata);
      }
    },
  );
});

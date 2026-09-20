import { describe, expect, it, vi } from "vitest";
import type { PhotoUploadDto } from "../../shared/api-contract";
import { editionCreateSchema } from "@/lib/contracts/api";
import {
  capturePhotoPath,
  commitCapture,
  photoMetadata,
  type CaptureDraft,
} from "@/lib/web/capture";
import type { ApiOptions } from "@/lib/web/api";
import { edition, placeId, requestId, userId } from "./fixtures";

const photo = new Blob(["private image"], { type: "image/jpeg" });
const photoPath = `${userId}/${requestId}.jpg`;
const draft: CaptureDraft = {
  requestId,
  placeId,
  capturedAt: edition.capturedAt,
  timezone: edition.timezone,
  note: "A moment",
  companions: "Taylor",
  outingId: null,
  photo,
  photoName: "moment.jpg",
  completedEditionId: null,
  submission: {
    requestId,
    placeId,
    capturedAt: edition.capturedAt,
    timezone: edition.timezone,
    photoPath,
    note: "A moment",
    companions: ["Taylor"],
    variant: "standard",
    origin: "capture",
    outingId: null,
  },
};
const newUpload: PhotoUploadDto = {
  uploaded: false,
  bucket: "captures",
  path: photoPath,
  token: "single-object-token",
  signedUrl: "https://example.test/upload",
};

function transport(
  request: (path: string, options: ApiOptions) => Promise<unknown>,
  upload: Parameters<typeof commitCapture>[1]["upload"],
): Parameters<typeof commitCapture>[1] {
  return {
    request: async <T>(path: string, options: ApiOptions) => (await request(path, options)) as T,
    upload,
  };
}

describe("capture retries", () => {
  it("accepts the frozen request with the prepared strict contract", () => {
    expect(editionCreateSchema.safeParse(draft.submission).success).toBe(true);
    expect(capturePhotoPath(userId, requestId, photo)).toBe(photoPath);
  });

  it("keeps the same request and photo path after a lost create response", async () => {
    const bodies: unknown[] = [];
    let first = true;
    const request = vi.fn(async <T>(path: string, options: ApiOptions): Promise<T> => {
      if (path === "/api/capture/upload") {
        return (
          first ? newUpload : { ...newUpload, uploaded: true, token: null, signedUrl: null }
        ) as T;
      }
      bodies.push(options.body);
      if (first) {
        first = false;
        throw new Error("Response lost after commit");
      }
      return edition as T;
    });
    const upload = vi.fn(async () => undefined);
    await expect(commitCapture(draft, transport(request, upload))).rejects.toThrow("Response lost");
    expect(await commitCapture(draft, transport(request, upload))).toEqual(edition);
    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload.mock.calls[0]).toEqual([newUpload, await photo.arrayBuffer(), "image/jpeg"]);
    expect(bodies).toEqual([draft.submission, draft.submission]);
    expect(draft.completedEditionId).toBeNull();
    expect(draft.photo).toBe(photo);
    expect(
      request.mock.calls
        .filter(([path]) => path === "/api/capture/upload")
        .map(([, options]) => options.body),
    ).toEqual([
      { requestId, contentType: "image/jpeg", size: photo.size },
      { requestId, contentType: "image/jpeg", size: photo.size },
    ]);
  });

  it("does not create an edition after a failed upload", async () => {
    const request = vi.fn(async <T>(): Promise<T> => newUpload as T);
    const upload = vi.fn(async () => {
      throw new Error("Upload failed");
    });
    await expect(commitCapture(draft, transport(request, upload))).rejects.toThrow("Upload failed");
    expect(request).toHaveBeenCalledTimes(1);
    expect(draft.submission?.photoPath).toBe(photoPath);
  });

  it("rejects a photo path for another account before uploading", async () => {
    const request = vi.fn(
      async <T>(): Promise<T> => ({ ...newUpload, path: `another-owner/${requestId}.jpg` }) as T,
    );
    const upload = vi.fn(async () => undefined);
    await expect(commitCapture(draft, transport(request, upload))).rejects.toThrow("photo path");
    expect(upload).not.toHaveBeenCalled();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("allows optional photos and gives independent revisits their own request", async () => {
    const nextRequest = crypto.randomUUID();
    const revisit = {
      ...draft,
      requestId: nextRequest,
      photo: null,
      photoName: null,
      submission: {
        ...draft.submission!,
        requestId: nextRequest,
        photoPath: null,
        variant: "revisit" as const,
      },
    };
    const request = vi.fn(async <T>(): Promise<T> => edition as T);
    const upload = vi.fn(async () => undefined);
    await commitCapture(revisit, transport(request, upload));
    expect(request).toHaveBeenCalledWith("/api/editions", {
      method: "POST",
      body: revisit.submission,
    });
    expect(request).toHaveBeenCalledTimes(1);
    expect(upload).not.toHaveBeenCalled();
    expect(revisit.submission.requestId).not.toBe(draft.submission?.requestId);
    expect(editionCreateSchema.safeParse(revisit.submission).success).toBe(true);
  });

  it("requires a confirmed payload before any network operation", async () => {
    const request = vi.fn(async <T>(): Promise<T> => edition as T);
    await expect(
      commitCapture(
        { ...draft, submission: null },
        transport(request, async () => undefined),
      ),
    ).rejects.toThrow("Confirm");
    expect(request).not.toHaveBeenCalled();
  });

  it("validates size and MIME before issuing an upload request", () => {
    expect(() => photoMetadata(new Blob(["bad"], { type: "image/gif" }))).toThrow("JPEG");
    expect(() => photoMetadata(new Blob([], { type: "image/jpeg" }))).toThrow("10 MiB");
    expect(() =>
      photoMetadata(new Blob([new Uint8Array(10 * 1024 * 1024 + 1)], { type: "image/png" })),
    ).toThrow("10 MiB");
    expect(capturePhotoPath(userId, requestId, new Blob(["x"], { type: "image/webp" }))).toBe(
      `${userId}/${requestId}.webp`,
    );
  });
});

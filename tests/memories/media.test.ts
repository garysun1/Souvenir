import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import {
  downloadImportBytes,
  exifMetadata,
  inspectImportBytes,
  UNKNOWN_METADATA,
} from "@/lib/server/memory-import-media";

const storage = vi.hoisted(() => ({
  createClient: vi.fn(),
  from: vi.fn(),
  info: vi.fn(),
  download: vi.fn(),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: storage.createClient }));

const auth = {
  userId: "11111111-1111-4111-8111-111111111111",
  email: null,
  mode: "bearer" as const,
};
const path = `${auth.userId}/22222222-2222-4222-8222-222222222222.jpg`;
const expected = (
  bytes: Buffer,
  contentType: "image/jpeg" | "image/png" | "image/webp" = "image/png",
) => ({
  sha256: createHash("sha256").update(bytes).digest("hex"),
  sizeBytes: bytes.length,
  contentType,
});
const synthetic = () =>
  sharp({ create: { width: 8, height: 8, channels: 3, background: "#4a9b50" } });

describe("bounded image inspection", () => {
  it("decodes supported synthetic bytes and leaves missing metadata unknown", async () => {
    for (const format of ["png", "jpeg", "webp"] as const) {
      const bytes = await synthetic()[format]().toBuffer();
      expect(await inspectImportBytes(bytes, expected(bytes, `image/${format}`))).toEqual(
        UNKNOWN_METADATA,
      );
    }
  });
  it("rejects false MIME, wrong size, wrong hash, truncation and unsupported files", async () => {
    const bytes = await synthetic().png().toBuffer();
    await expect(inspectImportBytes(bytes, expected(bytes, "image/jpeg"))).rejects.toMatchObject({
      status: 400,
    });
    await expect(
      inspectImportBytes(bytes, { ...expected(bytes), sizeBytes: 1 }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      inspectImportBytes(bytes, { ...expected(bytes), sha256: "a".repeat(64) }),
    ).rejects.toMatchObject({ status: 400 });
    for (const bad of [Buffer.from("<svg></svg>"), bytes.subarray(0, 40)]) {
      await expect(inspectImportBytes(bad, expected(bad))).rejects.toMatchObject({ status: 400 });
    }
  });
  it("rejects oversized encoded content and a valid over-limit decoded image", async () => {
    const huge = Buffer.alloc(10 * 1024 * 1024 + 1);
    await expect(inspectImportBytes(huge, expected(huge))).rejects.toMatchObject({ status: 400 });
    const pixels = await sharp({
      create: { width: 6500, height: 6500, channels: 3, background: "#000" },
    })
      .png()
      .toBuffer();
    await expect(inspectImportBytes(pixels, expected(pixels))).rejects.toMatchObject({
      status: 400,
    });
  });
  it("extracts real synthetic JPEG EXIF while keeping dates without offsets unknown", async () => {
    const bytes = await synthetic()
      .withExif({ IFD2: { DateTimeOriginal: "2026:09:20 10:30:00", OffsetTimeOriginal: "+02:00" } })
      .jpeg()
      .toBuffer();
    expect(await inspectImportBytes(bytes, expected(bytes, "image/jpeg"))).toMatchObject({
      capturedAt: "2026-09-20T08:30:00.000Z",
      timezone: null,
      origin: "exif",
    });
    const noOffset = await synthetic()
      .withExif({ IFD2: { DateTimeOriginal: "2026:09:20 10:30:00" } })
      .jpeg()
      .toBuffer();
    expect(
      (await inspectImportBytes(noOffset, expected(noOffset, "image/jpeg"))).capturedAt,
    ).toBeNull();
  });
});

describe("EXIF suggestions", () => {
  it.each([
    null,
    {},
    { DateTimeOriginal: "2026:02:30 10:00:00", OffsetTimeOriginal: "+00:00" },
    { DateTimeOriginal: "2026:09:20 10:00:00" },
    { DateTimeOriginal: "2026:09:20 30:00:00", OffsetTimeOriginal: "+02:00" },
  ])("does not invent or normalize invalid dates: %j", (input) => {
    expect(exifMetadata(input)).toEqual(UNKNOWN_METADATA);
  });
  it("preserves explicit GPS without inventing timezone or confirming a place", () => {
    expect(exifMetadata({ latitude: 34, longitude: -118, GPSHPositioningError: 30 })).toEqual({
      ...UNKNOWN_METADATA,
      latitude: 34,
      longitude: -118,
      accuracyM: 30,
      origin: "exif",
    });
    expect(exifMetadata({ latitude: 34 }).latitude).toBeNull();
  });
});

describe("server-authorized downloads", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://storage.example.test");
    vi.stubEnv("SUPABASE_SECRET_KEY", "synthetic-test-key");
    storage.createClient.mockReturnValue({ storage: { from: storage.from } });
    storage.from.mockReturnValue(storage);
    storage.info.mockResolvedValue({ data: { size: 3 }, error: null });
    storage.download.mockResolvedValue({ data: new Blob(["abc"]), error: null });
  });
  afterEach(() => vi.unstubAllEnvs());
  it.each([
    "https://evil.test/image.png",
    "../secret",
    path.replace(auth.userId, "33333333-3333-4333-8333-333333333333"),
  ])("rejects arbitrary URLs and other accounts before storage access", async (invalid) => {
    await expect(downloadImportBytes(auth, invalid)).rejects.toMatchObject({ status: 400 });
    expect(storage.createClient).not.toHaveBeenCalled();
  });
  it("downloads only from the captures bucket and handles missing objects safely", async () => {
    expect(await downloadImportBytes(auth, path)).toEqual(Buffer.from("abc"));
    expect(storage.from).toHaveBeenCalledWith("captures");
    expect(storage.download).toHaveBeenCalledWith(path);
    storage.info.mockResolvedValue({ data: null, error: new Error("upstream private detail") });
    await expect(downloadImportBytes(auth, path)).rejects.toMatchObject({
      code: "photo_not_uploaded",
      message: "Upload the image first.",
    });
  });
});

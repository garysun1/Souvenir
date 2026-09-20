import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
import { createPublicDerivative, placeImageStorage } from "@/lib/server/place-image-storage";
import type { AuthContext } from "../../shared/api-contract";

const mocks = vi.hoisted(() => ({
  getBucket: vi.fn(),
  from: vi.fn(),
  info: vi.fn(),
  download: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  getPublicUrl: vi.fn(),
}));
vi.mock("@/lib/env", () => ({
  env: {
    NEXT_PUBLIC_SUPABASE_URL: "https://storage.test",
    SUPABASE_SECRET_KEY: "test-only-placeholder",
  },
}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ storage: { getBucket: mocks.getBucket, from: mocks.from } }),
}));

const auth: AuthContext = {
  userId: "11111111-1111-4111-8111-111111111111",
  email: null,
  mode: "bearer",
};
const captureId = "22222222-2222-4222-8222-222222222222";
const promotionId = "33333333-3333-4333-8333-333333333333";
const capturePath = `${auth.userId}/${captureId}.jpg`;
const publicPath = `place-images/${auth.userId}/${promotionId}.webp`;
let original: Buffer;

beforeEach(async () => {
  vi.resetAllMocks();
  original = await sharp({ create: { width: 1800, height: 300, channels: 3, background: "red" } })
    .jpeg()
    .withExif({ IFD0: { Artist: "Private Author", ImageDescription: "Private location" } })
    .toBuffer();
  mocks.getBucket.mockImplementation(async (name: string) => ({
    data: { public: name === "place-images" },
    error: null,
  }));
  mocks.from.mockImplementation((name: string) =>
    name === "captures"
      ? { info: mocks.info, download: mocks.download }
      : { upload: mocks.upload, remove: mocks.remove, getPublicUrl: mocks.getPublicUrl },
  );
  mocks.info.mockResolvedValue({
    data: { size: original.length, contentType: "image/jpeg" },
    error: null,
  });
  mocks.download.mockResolvedValue({ data: new Blob([Uint8Array.from(original)]), error: null });
  mocks.upload.mockResolvedValue({ data: {}, error: null });
  mocks.remove.mockResolvedValue({ error: null });
  mocks.getPublicUrl.mockReturnValue({
    data: { publicUrl: "https://storage.test/place-images/public.webp" },
  });
});

describe("separate public image storage", () => {
  it("strips EXIF, resizes and encodes fresh WebP bytes", async () => {
    expect((await sharp(original).metadata()).exif).toBeDefined();
    const derivative = await createPublicDerivative(original);
    const metadata = await sharp(derivative.data).metadata();
    expect(metadata).toMatchObject({ format: "webp", width: 1600 });
    expect(metadata.exif).toBeUndefined();
    expect(metadata.icc).toBeUndefined();
    expect(derivative.data.equals(original)).toBe(false);
  });

  it("downloads only owned private captures and writes/deletes only in the public bucket", async () => {
    const result = await placeImageStorage.promote(auth, capturePath, captureId, publicPath);
    expect(result).toMatchObject({
      width: 1600,
      url: "https://storage.test/place-images/public.webp",
    });
    expect(mocks.download).toHaveBeenCalledWith(capturePath);
    expect(mocks.upload).toHaveBeenCalledWith(
      `${auth.userId}/${promotionId}.webp`,
      expect.any(Buffer),
      { contentType: "image/webp", cacheControl: "0", upsert: true },
    );
    expect(mocks.getPublicUrl).toHaveBeenCalledWith(`${auth.userId}/${promotionId}.webp`);
    await placeImageStorage.remove(publicPath);
    expect(mocks.remove).toHaveBeenCalledWith([`${auth.userId}/${promotionId}.webp`]);
    expect(mocks.from.mock.calls.map(([name]) => name)).toEqual([
      "captures",
      "captures",
      "place-images",
      "place-images",
    ]);
  });

  it("refuses insecure bucket configuration, foreign owners and remote capture URLs", async () => {
    mocks.getBucket.mockResolvedValueOnce({ data: { public: true }, error: null });
    await expect(
      placeImageStorage.promote(auth, capturePath, captureId, publicPath),
    ).rejects.toMatchObject({ status: 503 });
    for (const path of [
      "https://internal.test/private.jpg",
      `${promotionId}/${captureId}.jpg`,
      `${auth.userId}/../secret.jpg`,
    ]) {
      await expect(
        placeImageStorage.promote(auth, path, captureId, publicPath),
      ).rejects.toMatchObject({ status: 403 });
    }
    await expect(
      placeImageStorage.promote(
        auth,
        capturePath,
        captureId,
        `place-images/${promotionId}/${captureId}.webp`,
      ),
    ).rejects.toMatchObject({ status: 503 });
    await expect(placeImageStorage.remove(`captures/${capturePath}`)).rejects.toMatchObject({
      status: 503,
    });
    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });

  it("rejects invalid, oversized and mislabeled source files and surfaces storage failures", async () => {
    await expect(createPublicDerivative(Buffer.from("<svg></svg>"))).rejects.toMatchObject({
      status: 422,
    });
    await expect(createPublicDerivative(Buffer.alloc(10 * 1024 * 1024 + 1))).rejects.toMatchObject({
      status: 422,
    });
    mocks.info.mockResolvedValueOnce({
      data: { size: original.length, contentType: "text/html" },
      error: null,
    });
    await expect(
      placeImageStorage.promote(auth, capturePath, captureId, publicPath),
    ).rejects.toMatchObject({ status: 422 });
    mocks.upload.mockResolvedValueOnce({ error: new Error("private internal details") });
    await expect(
      placeImageStorage.promote(auth, capturePath, captureId, publicPath),
    ).rejects.toMatchObject({
      status: 503,
      message: expect.not.stringContaining("internal details"),
    });
    mocks.remove.mockResolvedValueOnce({ error: new Error("private internal details") });
    await expect(placeImageStorage.remove(publicPath)).rejects.toMatchObject({ status: 503 });
  });
});

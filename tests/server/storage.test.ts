import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createCaptureUpload,
  deleteCapturePhoto,
  signCapturePhoto,
  verifyCapturePhoto,
} from "@/lib/auth/storage";
import type { AuthContext } from "../../shared/api-contract";

const mocks = vi.hoisted(() => ({
  list: vi.fn<() => Promise<{ data: { name: string }[]; error: Error | null }>>(),
  info: vi.fn<
    () => Promise<{ data: { size: number; contentType: string } | null; error: Error | null }>
  >(),
  createSignedUploadUrl:
    vi.fn<
      () => Promise<{ data: { token: string; signedUrl: string } | null; error: Error | null }>
    >(),
  createSignedUrl:
    vi.fn<() => Promise<{ data: { signedUrl: string } | null; error: Error | null }>>(),
  remove: vi.fn<() => Promise<{ error: Error | null }>>(),
  from: vi.fn(),
  env: {
    NEXT_PUBLIC_SUPABASE_URL: "https://storage.test",
    SUPABASE_SECRET_KEY: "test-server-only-key",
  },
}));

vi.mock("@/lib/env", () => ({ env: mocks.env }));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ storage: { from: mocks.from } }),
}));

const auth: AuthContext = {
  userId: "11111111-1111-4111-8111-111111111111",
  email: null,
  mode: "bearer",
};
const requestId = "22222222-2222-4222-8222-222222222222";
const filename = `${requestId}.jpg`;
const path = `${auth.userId}/${filename}`;
const input = { requestId, contentType: "image/jpeg" as const, size: 1024 };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.env.NEXT_PUBLIC_SUPABASE_URL = "https://storage.test";
  mocks.env.SUPABASE_SECRET_KEY = "test-server-only-key";
  mocks.from.mockReturnValue(mocks);
  mocks.list.mockResolvedValue({ data: [], error: null });
  mocks.info.mockResolvedValue({ data: { size: 1024, contentType: "image/jpeg" }, error: null });
  mocks.createSignedUploadUrl.mockResolvedValue({
    data: { token: "one-object-token", signedUrl: "https://storage.test/private-upload" },
    error: null,
  });
  mocks.createSignedUrl.mockResolvedValue({
    data: { signedUrl: "https://storage.test/private-read" },
    error: null,
  });
  mocks.remove.mockResolvedValue({ error: null });
});

describe("private capture storage boundary", () => {
  it("constructs a single owned path and requests an immutable signed upload", async () => {
    const result = await createCaptureUpload(auth, input);
    expect(result).toMatchObject({
      bucket: "captures",
      path,
      uploaded: false,
      token: "one-object-token",
    });
    expect(mocks.from).toHaveBeenCalledWith("captures");
    expect(mocks.list).toHaveBeenCalledWith(auth.userId, { search: requestId, limit: 10 });
    expect(mocks.createSignedUploadUrl).toHaveBeenCalledWith(path, { upsert: false });
  });

  it("reuses an already uploaded object only when its path, actual MIME and size match", async () => {
    mocks.list.mockResolvedValue({ data: [{ name: filename }], error: null });
    expect(await createCaptureUpload(auth, input)).toEqual({
      bucket: "captures",
      path,
      uploaded: true,
      token: null,
      signedUrl: null,
    });
    expect(mocks.createSignedUploadUrl).not.toHaveBeenCalled();
    mocks.info.mockResolvedValueOnce({
      data: { size: 500, contentType: "image/jpeg" },
      error: null,
    });
    await expect(createCaptureUpload(auth, input)).rejects.toMatchObject({ status: 409 });
    mocks.list.mockResolvedValueOnce({ data: [{ name: `${requestId}.png` }], error: null });
    await expect(createCaptureUpload(auth, input)).rejects.toMatchObject({ status: 409 });
  });

  it("rejects foreign owners, traversal, arbitrary URLs and another draft before touching Storage", async () => {
    for (const invalid of [
      `33333333-3333-4333-8333-333333333333/${filename}`,
      `${auth.userId}/../${filename}`,
      `https://example.test/${path}`,
      `${path}/extra`,
      `${auth.userId}/33333333-3333-4333-8333-333333333333.jpg`,
    ]) {
      await expect(verifyCapturePhoto(auth, requestId, invalid)).rejects.toMatchObject({
        status: 400,
      });
    }
    await expect(signCapturePhoto(auth, `foreign/${filename}`)).rejects.toMatchObject({
      status: 400,
    });
    await expect(deleteCapturePhoto(auth, `foreign/${filename}`)).rejects.toMatchObject({
      status: 400,
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("rejects missing uploads, conflicting objects, invalid content and excessive actual size", async () => {
    await expect(verifyCapturePhoto(auth, requestId, path)).rejects.toMatchObject({ status: 422 });
    mocks.list.mockResolvedValueOnce({
      data: [{ name: filename }, { name: `${requestId}.png` }],
      error: null,
    });
    await expect(verifyCapturePhoto(auth, requestId, path)).rejects.toMatchObject({ status: 409 });
    mocks.list.mockResolvedValue({ data: [{ name: filename }], error: null });
    for (const contentType of ["application/pdf", "image/png"]) {
      mocks.info.mockResolvedValueOnce({ data: { size: 1024, contentType }, error: null });
      await expect(verifyCapturePhoto(auth, requestId, path)).rejects.toMatchObject({
        status: 422,
      });
    }
    mocks.info.mockResolvedValueOnce({
      data: { size: 10 * 1024 * 1024 + 1, contentType: "image/jpeg" },
      error: null,
    });
    await expect(verifyCapturePhoto(auth, requestId, path)).rejects.toMatchObject({ status: 413 });
    mocks.info.mockResolvedValueOnce({ data: { size: 0, contentType: "image/jpeg" }, error: null });
    await expect(verifyCapturePhoto(auth, requestId, path)).rejects.toMatchObject({ status: 422 });
  });

  it("issues five-minute read URLs and deletes only the authorized object", async () => {
    const now = Date.now();
    const signed = await signCapturePhoto(auth, path);
    expect(signed).toMatchObject({ path, url: "https://storage.test/private-read" });
    expect(Date.parse(signed.expiresAt)).toBeGreaterThanOrEqual(now + 300_000);
    expect(Date.parse(signed.expiresAt)).toBeLessThanOrEqual(Date.now() + 300_000);
    expect(mocks.createSignedUrl).toHaveBeenCalledWith(path, 300);
    await deleteCapturePhoto(auth, path);
    expect(mocks.remove).toHaveBeenCalledWith([path]);
  });

  it("surfaces failures without provider details or false upload/read/delete success", async () => {
    const error = new Error("sensitive provider detail");
    mocks.list.mockResolvedValueOnce({ data: [], error });
    await expect(createCaptureUpload(auth, input)).rejects.toMatchObject({
      status: 503,
      message: expect.not.stringContaining("sensitive"),
    });
    mocks.createSignedUploadUrl.mockResolvedValueOnce({ data: null, error });
    await expect(createCaptureUpload(auth, input)).rejects.toMatchObject({ status: 503 });
    mocks.createSignedUrl.mockResolvedValueOnce({ data: null, error });
    await expect(signCapturePhoto(auth, path)).rejects.toMatchObject({ status: 503 });
    mocks.remove.mockResolvedValueOnce({ error });
    await expect(deleteCapturePhoto(auth, path)).rejects.toMatchObject({ status: 503 });
    mocks.env.SUPABASE_SECRET_KEY = "";
    await expect(createCaptureUpload(auth, input)).rejects.toMatchObject({ status: 503 });
  });
});

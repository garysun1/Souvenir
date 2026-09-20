import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { AuthContext } from "../../shared/api-contract";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  from: vi.fn(),
  info: vi.fn(),
  createSignedUploadUrl: vi.fn(),
  createSignedUrl: vi.fn(),
  remove: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
import {
  createCaptureUpload,
  deleteCapturePhoto,
  signCapturePhoto,
  validateCapturePhoto,
} from "@/lib/auth/storage";

const auth: AuthContext = {
  userId: "11111111-1111-4111-8111-111111111111",
  email: "person@example.com",
  mode: "bearer",
};
const requestId = "22222222-2222-4222-8222-222222222222";
const foreignId = "33333333-3333-4333-8333-333333333333";
const path = `${auth.userId}/${requestId}.jpg`;
const input = { requestId, contentType: "image/jpeg" as const, size: 1234 };
const notFound = {
  data: null,
  error: Object.assign(new Error("Object not found"), { status: 404 }),
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  vi.stubEnv("SUPABASE_SECRET_KEY", "server-secret");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  mocks.createClient.mockReturnValue({ storage: { from: mocks.from } });
  mocks.from.mockReturnValue(mocks);
  mocks.info.mockResolvedValue(notFound);
  mocks.createSignedUploadUrl.mockResolvedValue({
    data: { path, signedUrl: "https://example.supabase.co/upload?token=test", token: "test" },
    error: null,
  });
  mocks.createSignedUrl.mockResolvedValue({
    data: { signedUrl: "https://example.supabase.co/read?token=test" },
    error: null,
  });
  mocks.remove.mockResolvedValue({ data: [], error: null });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

it("constructs an owned path and issues a non-upsert signed upload", async () => {
  expect(await createCaptureUpload(auth, input)).toEqual({
    bucket: "captures",
    path,
    uploaded: false,
    token: "test",
    signedUrl: "https://example.supabase.co/upload?token=test",
  });
  expect(mocks.createSignedUploadUrl).toHaveBeenCalledWith(path, { upsert: false });
  expect(mocks.from).toHaveBeenCalledWith("captures");
  expect(mocks.createClient).toHaveBeenCalledWith("https://example.supabase.co", "server-secret", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
});

it("reuses a completed exact upload without issuing another token", async () => {
  mocks.info.mockResolvedValueOnce({
    data: { contentType: "image/jpeg", size: 1234 },
    error: null,
  });
  expect(await createCaptureUpload(auth, input)).toEqual({
    bucket: "captures",
    path,
    uploaded: true,
    token: null,
    signedUrl: null,
  });
  expect(mocks.createSignedUploadUrl).not.toHaveBeenCalled();
});

it.each([
  { contentType: "image/jpeg", size: 999 },
  { contentType: "image/png", size: 1234 },
])("rejects changed MIME or size on a completed request", async (metadata) => {
  mocks.info.mockResolvedValueOnce({ data: metadata, error: null });
  await expect(createCaptureUpload(auth, input)).rejects.toMatchObject({
    status: 409,
    code: "idempotency_conflict",
  });
  expect(mocks.createSignedUploadUrl).not.toHaveBeenCalled();
});

it("detects reuse of the same request ID with another extension", async () => {
  mocks.info
    .mockResolvedValueOnce(notFound)
    .mockResolvedValueOnce({ data: { contentType: "image/png", size: 1234 }, error: null });
  await expect(createCaptureUpload(auth, input)).rejects.toMatchObject({ status: 409 });
});

it.each([0, -1, 1.5, NaN])("rejects invalid size %s before using credentials", async (size) => {
  await expect(createCaptureUpload(auth, { ...input, size })).rejects.toMatchObject({
    status: 400,
  });
  expect(mocks.createClient).not.toHaveBeenCalled();
});

it("rejects oversized uploads", async () => {
  await expect(
    createCaptureUpload(auth, { ...input, size: 10 * 1024 * 1024 + 1 }),
  ).rejects.toMatchObject({ status: 413 });
  expect(mocks.createClient).not.toHaveBeenCalled();
});

it("validates runtime MIME and UUID input even from an untyped caller", async () => {
  const invalid = JSON.parse(JSON.stringify({ ...input, contentType: "image/svg+xml" }));
  await expect(createCaptureUpload(auth, invalid)).rejects.toMatchObject({ status: 400 });
  await expect(
    createCaptureUpload(auth, { ...input, requestId: "../../other" }),
  ).rejects.toMatchObject({ status: 400 });
  expect(mocks.createClient).not.toHaveBeenCalled();
});

it.each([
  `${foreignId}/${requestId}.jpg`,
  `${auth.userId}/../${foreignId}/${requestId}.jpg`,
  `${auth.userId}/${requestId}.svg`,
  `https://example.com/${path}`,
  `${auth.userId}/not-a-uuid.jpg`,
  `${path}?token=evil`,
])("rejects foreign or malformed path %s for reads/deletes/validation", async (invalidPath) => {
  await expect(signCapturePhoto(auth, invalidPath)).rejects.toMatchObject({ status: 403 });
  await expect(deleteCapturePhoto(auth, invalidPath)).rejects.toMatchObject({ status: 403 });
  await expect(validateCapturePhoto(auth, invalidPath, requestId)).rejects.toMatchObject({
    status: 403,
  });
  expect(mocks.createClient).not.toHaveBeenCalled();
});

it("requires the exact edition requestId and a completed object", async () => {
  await expect(validateCapturePhoto(auth, path, foreignId)).rejects.toMatchObject({ status: 403 });
  await expect(validateCapturePhoto(auth, path, requestId)).rejects.toMatchObject({
    status: 422,
    code: "photo_not_uploaded",
  });
  mocks.info.mockResolvedValue({ data: { contentType: "image/jpeg", size: 1234 }, error: null });
  await expect(validateCapturePhoto(auth, path, requestId)).resolves.toBeUndefined();
});

it.each([
  { size: 0, contentType: "image/jpeg" },
  { size: 11 * 1024 * 1024, contentType: "image/jpeg" },
  { size: 1234, contentType: "application/pdf" },
  { size: 1.5, contentType: "image/jpeg" },
])("checks actual storage metadata before an edition can reference it", async (metadata) => {
  mocks.info.mockResolvedValue({ data: metadata, error: null });
  await expect(validateCapturePhoto(auth, path, requestId)).rejects.toMatchObject({ status: 422 });
});

it("returns a five minute private read URL", async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-20T12:00:00Z"));
  mocks.info.mockResolvedValue({ data: { contentType: "image/jpeg", size: 1234 }, error: null });
  expect(await signCapturePhoto(auth, path)).toEqual({
    path,
    url: "https://example.supabase.co/read?token=test",
    expiresAt: "2026-09-20T12:05:00.000Z",
  });
  expect(mocks.createSignedUrl).toHaveBeenCalledWith(path, 300);
});

it("returns not found for missing media and never signs it", async () => {
  await expect(signCapturePhoto(auth, path)).rejects.toMatchObject({ status: 404 });
  expect(mocks.createSignedUrl).not.toHaveBeenCalled();
});

it("deletes only the owned object and propagates safe cleanup failures", async () => {
  await expect(deleteCapturePhoto(auth, path)).resolves.toBeUndefined();
  expect(mocks.remove).toHaveBeenCalledWith([path]);
  mocks.remove.mockResolvedValue({ error: new Error("sensitive upstream info") });
  await expect(deleteCapturePhoto(auth, path)).rejects.toMatchObject({
    status: 503,
    message: "Photo storage is unavailable. Please retry.",
  });
});

it("distinguishes provider failures from a missing object", async () => {
  mocks.info.mockResolvedValue({
    data: null,
    error: Object.assign(new Error("Bucket not found"), { status: 400 }),
  });
  await expect(createCaptureUpload(auth, input)).rejects.toMatchObject({ status: 503 });
  expect(mocks.createSignedUploadUrl).not.toHaveBeenCalled();
});

it("supports legacy object-not-found errors without ignoring authorization errors", async () => {
  mocks.info.mockResolvedValue({
    data: null,
    error: Object.assign(new Error("Object not found"), { status: 400 }),
  });
  await expect(createCaptureUpload(auth, input)).resolves.toMatchObject({ uploaded: false });
  mocks.info.mockResolvedValue({
    data: null,
    error: Object.assign(new Error("Not authorized"), { status: 403 }),
  });
  await expect(createCaptureUpload(auth, input)).rejects.toMatchObject({ status: 503 });
});

it("fails safely without server credentials and supports a service-role fallback", async () => {
  vi.stubEnv("SUPABASE_SECRET_KEY", "");
  await expect(createCaptureUpload(auth, input)).rejects.toMatchObject({ status: 503 });
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "legacy-role");
  await expect(createCaptureUpload(auth, input)).resolves.toMatchObject({ uploaded: false });
  expect(mocks.createClient).toHaveBeenCalledWith(
    "https://example.supabase.co",
    "legacy-role",
    expect.objectContaining({ auth: expect.objectContaining({ persistSession: false }) }),
  );
});

import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { photoUploadSchema, uuidSchema } from "@/lib/contracts/api";
import type {
  AuthContext,
  ErrorCode,
  PhotoUploadDto,
  PhotoUploadRequest,
  SignedPhotoDto,
} from "../../../shared/api-contract";

const bucketName = "captures";
const maxSize = 10 * 1024 * 1024;
const readLifetime = 300;
const extensions = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
type ContentType = keyof typeof extensions;

export class CaptureStorageError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CaptureStorageError";
  }
}

function unavailable(): CaptureStorageError {
  return new CaptureStorageError(
    503,
    "service_unavailable",
    "Photo storage is unavailable. Please retry.",
  );
}

function storageBucket() {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw unavailable();
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }).storage.from(bucketName);
}

function ownedPhoto(
  auth: AuthContext,
  path: string,
  requestId?: string,
): { contentType: ContentType } {
  const parts = path.split("/");
  const [owner, filename] = parts;
  const match = /^([0-9a-f-]{36})\.(jpg|png|webp)$/.exec(filename ?? "");
  if (
    parts.length !== 2 ||
    !uuidSchema.safeParse(auth.userId).success ||
    owner !== auth.userId.toLowerCase() ||
    !match ||
    !uuidSchema.safeParse(match[1]).success ||
    (requestId !== undefined &&
      (!uuidSchema.safeParse(requestId).success || match[1] !== requestId.toLowerCase()))
  ) {
    throw new CaptureStorageError(403, "forbidden", "This photo does not belong to your capture.");
  }
  const contentType =
    match[2] === "jpg" ? "image/jpeg" : match[2] === "png" ? "image/png" : "image/webp";
  return { contentType };
}

async function objectInfo(bucket: ReturnType<typeof storageBucket>, path: string) {
  const { data, error } = await bucket.info(path);
  if (error) {
    if (
      "status" in error &&
      (error.status === 404 ||
        (error.status === 400 &&
          /^(object not found|the resource was not found)\.?$/i.test(error.message)))
    ) {
      return null;
    }
    throw unavailable();
  }
  if (!data) throw unavailable();
  return data;
}

export async function createCaptureUpload(
  auth: AuthContext,
  input: PhotoUploadRequest,
): Promise<PhotoUploadDto> {
  if (input.size > maxSize)
    throw new CaptureStorageError(413, "payload_too_large", "Photos must be 10 MiB or smaller.");
  const parsed = photoUploadSchema.safeParse(input);
  if (!parsed.success || !uuidSchema.safeParse(auth.userId).success) {
    throw new CaptureStorageError(
      400,
      "invalid_request",
      "Use a JPEG, PNG or WebP image with a valid size and capture ID.",
    );
  }
  const base = `${auth.userId.toLowerCase()}/${parsed.data.requestId.toLowerCase()}`;
  const path = `${base}.${extensions[parsed.data.contentType]}`;
  const bucket = storageBucket();
  let uploaded = false;
  for (const extension of Object.values(extensions)) {
    const candidate = `${base}.${extension}`;
    const existing = await objectInfo(bucket, candidate);
    if (!existing) continue;
    if (
      candidate !== path ||
      existing.contentType !== parsed.data.contentType ||
      existing.size !== parsed.data.size
    ) {
      throw new CaptureStorageError(
        409,
        "idempotency_conflict",
        "This capture ID already has a different photo. Start a new capture.",
      );
    }
    uploaded = true;
  }
  if (uploaded) return { bucket: bucketName, path, uploaded: true, token: null, signedUrl: null };
  const { data, error } = await bucket.createSignedUploadUrl(path, { upsert: false });
  if (error || !data) throw unavailable();
  return {
    bucket: bucketName,
    path,
    uploaded: false,
    token: data.token,
    signedUrl: data.signedUrl,
  };
}

export async function validateCapturePhoto(
  auth: AuthContext,
  path: string,
  requestId: string,
): Promise<void> {
  const expected = ownedPhoto(auth, path, requestId);
  const info = await objectInfo(storageBucket(), path);
  if (!info)
    throw new CaptureStorageError(
      422,
      "photo_not_uploaded",
      "Upload your photo before saving this capture.",
    );
  if (
    !Number.isInteger(info.size) ||
    !info.size ||
    info.size < 1 ||
    info.size > maxSize ||
    info.contentType !== expected.contentType
  ) {
    throw new CaptureStorageError(
      422,
      "photo_not_uploaded",
      "The uploaded photo has an invalid size or image type.",
    );
  }
}

export async function signCapturePhoto(auth: AuthContext, path: string): Promise<SignedPhotoDto> {
  ownedPhoto(auth, path);
  const bucket = storageBucket();
  if (!(await objectInfo(bucket, path)))
    throw new CaptureStorageError(404, "not_found", "This photo is unavailable.");
  const { data, error } = await bucket.createSignedUrl(path, readLifetime);
  if (error || !data) throw unavailable();
  return {
    path,
    url: data.signedUrl,
    expiresAt: new Date(Date.now() + readLifetime * 1000).toISOString(),
  };
}

export async function deleteCapturePhoto(auth: AuthContext, path: string): Promise<void> {
  ownedPhoto(auth, path);
  const { error } = await storageBucket().remove([path]);
  if (error) throw unavailable();
}

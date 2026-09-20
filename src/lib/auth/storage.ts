import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import { photoUploadSchema, uuidSchema } from "@/lib/contracts/api";
import { ApiError, invalidRequest } from "@/lib/server/errors";
import type {
  AuthContext,
  PhotoUploadDto,
  PhotoUploadRequest,
  SignedPhotoDto,
} from "../../../shared/api-contract";

const extensions = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;
const maxSize = 10 * 1024 * 1024;

function storage() {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
    throw new ApiError(503, "service_unavailable", "Private photo storage is not configured.");
  }
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }).storage.from("captures");
}

function validatePath(auth: AuthContext, path: string, requestId?: string): void {
  const [owner, filename, extra] = path.split("/");
  const match = filename?.match(/^([0-9a-f-]{36})\.(jpg|png|webp)$/);
  if (
    owner !== auth.userId ||
    extra !== undefined ||
    !match ||
    !uuidSchema.safeParse(match[1]).success ||
    (requestId !== undefined && match[1] !== requestId)
  ) {
    invalidRequest("Use the private photo uploaded for this capture.");
  }
}

function unavailable(): never {
  throw new ApiError(503, "service_unavailable", "Private photos are unavailable. Please retry.");
}

async function uploadedPhotos(auth: AuthContext, requestId: string) {
  const { data, error } = await storage().list(auth.userId, { search: requestId, limit: 10 });
  if (error || !data) unavailable();
  return data.filter((object) =>
    Object.values(extensions).some((extension) => object.name === `${requestId}.${extension}`),
  );
}

export async function verifyCapturePhoto(
  auth: AuthContext,
  requestId: string,
  path: string,
): Promise<{ size: number; contentType: PhotoUploadRequest["contentType"] }> {
  validatePath(auth, path, requestId);
  const files = await uploadedPhotos(auth, requestId);
  if (!files.some((file) => `${auth.userId}/${file.name}` === path)) {
    throw new ApiError(422, "photo_not_uploaded", "Upload the photo before saving this visit.");
  }
  if (files.length !== 1) {
    throw new ApiError(409, "conflict", "This capture has conflicting photos. Start a new draft.");
  }
  const { data, error } = await storage().info(path);
  if (error || !data) unavailable();
  const { size, contentType } = data;
  if (
    (contentType !== "image/jpeg" && contentType !== "image/png" && contentType !== "image/webp") ||
    !path.endsWith(`.${extensions[contentType]}`) ||
    typeof size !== "number" ||
    !Number.isInteger(size) ||
    size <= 0
  ) {
    throw new ApiError(422, "photo_not_uploaded", "Upload a valid JPEG, PNG, or WebP photo.");
  }
  if (size > maxSize)
    throw new ApiError(413, "payload_too_large", "Photos must be at most 10 MiB.");
  return { size, contentType };
}

export async function createCaptureUpload(
  auth: AuthContext,
  input: PhotoUploadRequest,
): Promise<PhotoUploadDto> {
  if (!photoUploadSchema.safeParse(input).success) invalidRequest("Invalid photo upload.");
  const path = `${auth.userId}/${input.requestId}.${extensions[input.contentType]}`;
  validatePath(auth, path, input.requestId);
  const files = await uploadedPhotos(auth, input.requestId);
  if (files.length) {
    if (files.length !== 1 || `${auth.userId}/${files[0].name}` !== path) {
      throw new ApiError(409, "conflict", "Keep the original photo when retrying a capture.");
    }
    const object = await verifyCapturePhoto(auth, input.requestId, path);
    if (object.size !== input.size || object.contentType !== input.contentType) {
      throw new ApiError(409, "conflict", "Keep the original photo when retrying a capture.");
    }
    return { bucket: "captures", path, uploaded: true, token: null, signedUrl: null };
  }
  const { data, error } = await storage().createSignedUploadUrl(path, { upsert: false });
  if (error || !data) unavailable();
  return {
    bucket: "captures",
    path,
    uploaded: false,
    token: data.token,
    signedUrl: data.signedUrl,
  };
}

export async function signCapturePhoto(auth: AuthContext, path: string): Promise<SignedPhotoDto> {
  validatePath(auth, path);
  const expiresAt = new Date(Date.now() + 300_000).toISOString();
  const { data, error } = await storage().createSignedUrl(path, 300);
  if (error || !data) unavailable();
  return { path, url: data.signedUrl, expiresAt };
}

export async function deleteCapturePhoto(auth: AuthContext, path: string): Promise<void> {
  validatePath(auth, path);
  const { error } = await storage().remove([path]);
  if (error) unavailable();
}

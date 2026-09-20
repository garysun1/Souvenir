import "server-only";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { env } from "@/lib/env";
import { validateCapturePhoto } from "@/lib/auth/storage";
import { uuidSchema } from "@/lib/contracts/api";
import type { AuthContext } from "../../../shared/api-contract";
import { ApiError } from "./errors";

export interface PublicImageCopy {
  url: string;
  width: number;
  height: number;
}

export interface PlaceImageStorage {
  promote(
    auth: AuthContext,
    capturePath: string,
    captureRequestId: string,
    storagePath: string,
  ): Promise<PublicImageCopy>;
  remove(storagePath: string): Promise<void>;
}

function unavailable(): ApiError {
  return new ApiError(
    503,
    "service_unavailable",
    "Public image storage is unavailable. Please retry.",
  );
}

function storage() {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw unavailable();
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }).storage;
}

function objectPath(path: string): string {
  const [bucket, owner, file, extra] = path.split("/");
  if (
    bucket !== "place-images" ||
    !uuidSchema.safeParse(owner).success ||
    !file?.endsWith(".webp") ||
    !uuidSchema.safeParse(file.slice(0, -5)).success ||
    extra !== undefined
  )
    throw unavailable();
  return `${owner}/${file}`;
}

export async function createPublicDerivative(
  bytes: Buffer,
): Promise<{ data: Buffer; width: number; height: number }> {
  if (!bytes.length || bytes.length > 10 * 1024 * 1024)
    throw new ApiError(422, "photo_not_uploaded", "The photo is invalid.");
  try {
    const image = sharp(bytes, {
      limitInputPixels: 40_000_000,
      animated: false,
      failOn: "warning",
    });
    const metadata = await image.metadata();
    if (!["jpeg", "png", "webp"].includes(metadata.format ?? "") || (metadata.pages ?? 1) > 1)
      throw new Error();
    const { data, info } = await image
      .rotate()
      .resize({
        width: 1600,
        height: 1600,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 80 })
      .toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height };
  } catch {
    throw new ApiError(422, "photo_not_uploaded", "Use a valid, still JPEG, PNG or WebP photo.");
  }
}

export const placeImageStorage: PlaceImageStorage = {
  async promote(auth, capturePath, captureRequestId, storagePath) {
    const path = objectPath(storagePath);
    if (!path.startsWith(`${auth.userId}/`)) throw unavailable();
    const client = storage();
    const [privateBucket, publicBucket] = await Promise.all([
      client.getBucket("captures"),
      client.getBucket("place-images"),
    ]);
    if (
      privateBucket.error ||
      publicBucket.error ||
      privateBucket.data.public ||
      !publicBucket.data.public
    )
      throw unavailable();
    await validateCapturePhoto(auth, capturePath, captureRequestId);
    const { data: original, error } = await client.from("captures").download(capturePath);
    if (error || !original || original.size > 10 * 1024 * 1024) throw unavailable();
    const derivative = await createPublicDerivative(Buffer.from(await original.arrayBuffer()));
    const bucket = client.from("place-images");
    const uploaded = await bucket.upload(path, derivative.data, {
      contentType: "image/webp",
      cacheControl: "0",
      upsert: true,
    });
    if (uploaded.error) throw unavailable();
    return {
      url: bucket.getPublicUrl(path).data.publicUrl,
      width: derivative.width,
      height: derivative.height,
    };
  },
  async remove(storagePath) {
    const { error } = await storage()
      .from("place-images")
      .remove([objectPath(storagePath)]);
    if (error) throw unavailable();
  },
};

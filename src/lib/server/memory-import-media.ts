import "server-only";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import exifr from "exifr";
import sharp from "sharp";
import { z } from "zod";
import { env } from "@/lib/env";
import { uuidSchema } from "@/lib/contracts/primitives";
import { ApiError, invalidRequest } from "./errors";
import type { AuthContext } from "../../../shared/api-contract";
import type { ImportMetadata, MemoryMimeType } from "../../../shared/memories-contract";

export const UNKNOWN_METADATA: ImportMetadata = {
  capturedAt: null,
  timezone: null,
  latitude: null,
  longitude: null,
  accuracyM: null,
  origin: "unknown",
};
const tagsSchema = z.object({
  DateTimeOriginal: z.string().optional(),
  OffsetTimeOriginal: z.string().optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  GPSHPositioningError: z.number().min(0).max(20_000_000).optional(),
});

export function exifMetadata(input: unknown): ImportMetadata {
  const parsed = tagsSchema.safeParse(input);
  if (!parsed.success) return { ...UNKNOWN_METADATA };
  const tags = parsed.data;
  let capturedAt: string | null = null;
  const date = tags.DateTimeOriginal;
  const offset = tags.OffsetTimeOriginal;
  if (
    date &&
    /^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}$/.test(date) &&
    offset &&
    /^[+-](?:(?:0\d|1[0-3]):[0-5]\d|14:00)$/.test(offset)
  ) {
    const local = `${date.slice(0, 10).replaceAll(":", "-")}T${date.slice(11)}`;
    const instant = new Date(`${local}${offset}`);
    const calendar = new Date(`${local}Z`);
    if (
      Number.isFinite(instant.getTime()) &&
      Number.isFinite(calendar.getTime()) &&
      calendar.toISOString().slice(0, 19) === local
    )
      capturedAt = instant.toISOString();
  }
  const hasGps = tags.latitude !== undefined && tags.longitude !== undefined;
  return {
    capturedAt,
    timezone: null,
    latitude: hasGps ? tags.latitude! : null,
    longitude: hasGps ? tags.longitude! : null,
    accuracyM: hasGps ? (tags.GPSHPositioningError ?? null) : null,
    origin: capturedAt || hasGps ? "exif" : "unknown",
  };
}

export async function inspectImportBytes(
  bytes: Buffer,
  expected: { sizeBytes: number; sha256: string; contentType: MemoryMimeType },
): Promise<ImportMetadata> {
  if (bytes.length !== expected.sizeBytes || bytes.length > 10 * 1024 * 1024)
    invalidRequest("The uploaded size does not match this image.");
  if (createHash("sha256").update(bytes).digest("hex") !== expected.sha256)
    invalidRequest("The uploaded image hash does not match. Start a new item.");
  try {
    const image = sharp(bytes, { limitInputPixels: 40_000_000, failOn: "warning", animated: true });
    const metadata = await image.metadata();
    const format = { "image/jpeg": "jpeg", "image/png": "png", "image/webp": "webp" }[
      expected.contentType
    ];
    if (
      metadata.format !== format ||
      !metadata.width ||
      !metadata.height ||
      (metadata.pages ?? 1) !== 1 ||
      metadata.width * metadata.height > 40_000_000
    )
      invalidRequest("Use a single JPEG, PNG or WebP image under 40 megapixels.");
    await image.resize(1, 1).raw().toBuffer();
    if (!metadata.exif) return { ...UNKNOWN_METADATA };
    const tags: unknown = await exifr
      .parse(bytes, {
        pick: [
          "DateTimeOriginal",
          "OffsetTimeOriginal",
          "GPSLatitude",
          "GPSLatitudeRef",
          "GPSLongitude",
          "GPSLongitudeRef",
          "GPSHPositioningError",
        ],
        reviveValues: false,
        makerNote: false,
        userComment: false,
        xmp: false,
        icc: false,
      })
      .catch(() => null);
    return exifMetadata(tags);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    invalidRequest("This image cannot be decoded safely. Export it as JPEG, PNG or WebP.");
  }
}

export async function downloadImportBytes(auth: AuthContext, path: string): Promise<Buffer> {
  const [owner, name, extra] = path.split("/");
  const match = /^([0-9a-f-]{36})\.(jpg|png|webp)$/.exec(name ?? "");
  if (
    owner !== auth.userId.toLowerCase() ||
    extra !== undefined ||
    !match ||
    !uuidSchema.safeParse(match[1]).success
  )
    invalidRequest("Invalid owned image.");
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new ApiError(503, "service_unavailable", "Photo storage is unavailable.");
  const bucket = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(20_000) }),
    },
  }).storage.from("captures");
  const { data: info, error: infoError } = await bucket.info(path);
  if (infoError || !info) throw new ApiError(422, "photo_not_uploaded", "Upload the image first.");
  if (
    typeof info.size !== "number" ||
    !Number.isInteger(info.size) ||
    info.size < 1 ||
    info.size > 10 * 1024 * 1024
  )
    invalidRequest("The uploaded image exceeds the size limit.");
  const { data, error } = await bucket.download(path);
  if (error || !data) throw new ApiError(503, "service_unavailable", "Photo download failed.");
  if (data.size > 10 * 1024 * 1024) invalidRequest("The uploaded image exceeds the size limit.");
  return Buffer.from(await data.arrayBuffer());
}

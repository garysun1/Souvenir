import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { CACHE } from "./safety";
import licenses from "./licenses.json";

const photoSchema = z.object({
  sourceId: z.string(),
  photographer: z.string(),
  sourceUrl: z.string().url(),
  license: z.string(),
  licenseUrl: z.string().url(),
  attribution: z.string(),
  width: z.number().positive(),
  height: z.number().positive(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: z.number().positive(),
  fetchedAt: z.string(),
});
const poolSchema = z.array(photoSchema).min(1);
export type Photo = z.infer<typeof photoSchema>;
export const hash = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");
export const poolPath = resolve(CACHE, "pool.json");

export function jpegDimensions(bytes: Buffer) {
  assert.equal(bytes.readUInt16BE(0), 0xffd8, "JPEG required");
  let offset = 2;
  while (offset + 9 < bytes.length) {
    assert.equal(bytes[offset], 0xff, "Invalid JPEG marker");
    const marker = bytes[offset + 1];
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      return { height: bytes.readUInt16BE(offset + 5), width: bytes.readUInt16BE(offset + 7) };
    }
    const length = bytes.readUInt16BE(offset + 2);
    assert(length >= 2);
    offset += 2 + length;
  }
  throw new Error("JPEG dimensions not found");
}

async function remote(url: string): Promise<Response> {
  const target = new URL(url);
  assert(
    target.protocol === "https:" &&
      ["picsum.photos", "fastly.picsum.photos"].includes(target.hostname),
  );
  const response = await fetch(target, { redirect: "manual", signal: AbortSignal.timeout(60_000) });
  if ([301, 302, 307, 308].includes(response.status)) {
    const location = response.headers.get("location");
    assert(location, "Missing redirect location");
    const redirected = new URL(location, target);
    assert.equal(redirected.hostname, "fastly.picsum.photos");
    assert.equal(redirected.protocol, "https:");
    return fetch(redirected, { redirect: "error", signal: AbortSignal.timeout(60_000) });
  }
  return response;
}

export async function buildPool() {
  mkdirSync(CACHE, { recursive: true, mode: 0o700 });
  if (existsSync(poolPath)) {
    const pool = loadPool();
    console.log(`Verified cached pool: ${pool.length} photos; no download.`);
    return;
  }
  const photos: Photo[] = [];
  for (const sourceId of licenses.photos.sourceIds) {
    const infoResponse = await remote(`https://picsum.photos/id/${sourceId}/info`);
    assert(infoResponse.ok, "Photo metadata request failed");
    const info = z
      .object({ id: z.string(), author: z.string(), url: z.string().url() })
      .parse(await infoResponse.json());
    assert.equal(info.id, sourceId);
    assert.equal(new URL(info.url).hostname, "unsplash.com");
    const response = await remote(`https://picsum.photos/id/${sourceId}/640/480.jpg`);
    assert(
      response.ok && response.headers.get("content-type")?.startsWith("image/jpeg"),
      "Photo download failed",
    );
    const bytes = Buffer.from(await response.arrayBuffer());
    assert(bytes.length < 10 * 1024 * 1024);
    const sha256 = hash(bytes);
    const dimensions = jpegDimensions(bytes);
    assert.deepEqual(dimensions, { width: 640, height: 480 });
    writeFileSync(resolve(CACHE, `${sha256}.jpg`), bytes, { mode: 0o600 });
    photos.push({
      sourceId,
      photographer: info.author,
      sourceUrl: info.url,
      license: licenses.photos.license,
      licenseUrl: licenses.photos.licenseUrl,
      attribution: `Photo by ${info.author} on Unsplash, delivered by Lorem Picsum. Synthetic test visit.`,
      ...dimensions,
      sha256,
      bytes: bytes.length,
      fetchedAt: new Date().toISOString(),
    });
  }
  writeFileSync(`${poolPath}.pending`, JSON.stringify(photos, null, 2), { mode: 0o600 });
  renameSync(`${poolPath}.pending`, poolPath);
  console.log(`Downloaded and hashed ${photos.length} licensed stock photos.`);
}

export function loadPool(): Photo[] {
  const pool = poolSchema.parse(JSON.parse(readFileSync(poolPath, "utf8")));
  for (const photo of pool) photoBytes(photo);
  return pool;
}
export function photoBytes(photo: Photo) {
  const bytes = readFileSync(resolve(CACHE, `${photo.sha256}.jpg`));
  assert.equal(
    hash(bytes),
    photo.sha256,
    "Photo changed; restore original bytes or use a new run-id",
  );
  assert.equal(bytes.length, photo.bytes);
  return bytes;
}

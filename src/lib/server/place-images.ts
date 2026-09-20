import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, like, lt, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { apiRequests, editions, placeImages, placeSources } from "@/lib/db/schema";
import { placeImagePromoteSchema } from "@/lib/contracts/api";
import { serializePlaceImageDto } from "@/lib/contracts/serializers";
import type { AuthContext, PlaceImageDto, PlaceImagePromote } from "../../../shared/api-contract";
import { ApiError, notFound } from "./errors";
import { placeImageStorage, type PlaceImageStorage } from "./place-image-storage";
import { requireVisiblePlace } from "./place-visibility";
import { approvedImageConditions } from "./catalog-images";
import { mergePlaceImages } from "@/lib/places/catalog-images";
import {
  completeRequest,
  deletedResource,
  lockUser,
  reserveRequest,
  type Created,
  type Database,
  type Transaction,
} from "./transactions";

const licenses = {
  "CC0-1.0": "https://creativecommons.org/publicdomain/zero/1.0/",
  "CC-BY-4.0": "https://creativecommons.org/licenses/by/4.0/",
  "CC-BY-SA-4.0": "https://creativecommons.org/licenses/by-sa/4.0/",
};

export async function getPlaceImages(
  userId: string,
  slug: string,
  database: Database = db,
): Promise<PlaceImageDto[]> {
  const place = await requireVisiblePlace(database, slug, userId);
  const rows = await database
    .select({ image: placeImages })
    .from(placeImages)
    .leftJoin(placeSources, eq(placeImages.sourceId, placeSources.id))
    .where(and(eq(placeImages.placeId, place.id), approvedImageConditions()))
    .orderBy(desc(placeImages.isHero), desc(placeImages.fetchedAt), asc(placeImages.id))
    .limit(50);
  return mergePlaceImages(
    place,
    rows.map(({ image }) => serializePlaceImageDto(image)),
  );
}

async function requireOwnedCapture(
  database: Database,
  auth: AuthContext,
  slug: string,
  editionId: string,
) {
  const place = await requireVisiblePlace(database, slug, auth.userId);
  if (place.visibility !== "public")
    throw new ApiError(403, "forbidden", "Publish images only for public places.");
  const [edition] = await database
    .select()
    .from(editions)
    .where(
      and(
        eq(editions.id, editionId),
        eq(editions.userId, auth.userId),
        eq(editions.placeId, place.id),
      ),
    );
  if (!edition?.photoPath) notFound("This photo is unavailable.");
  return { place, edition, capturePath: edition.photoPath };
}

export async function promotePlaceImage(
  auth: AuthContext,
  slug: string,
  input: PlaceImagePromote,
  storage: PlaceImageStorage = placeImageStorage,
): Promise<Created<PlaceImageDto>> {
  const parsed = placeImagePromoteSchema.parse(input);
  const storagePath = `place-images/${auth.userId}/${parsed.requestId}.webp`;
  await db.transaction(async (tx) => {
    await lockUser(tx, auth.userId);
    const { place } = await requireOwnedCapture(tx, auth, slug, parsed.editionId);
    const request = await reserveRequest(tx, auth.userId, parsed.requestId, "place.image.promote", {
      placeId: place.id,
      ...parsed,
    });
    if (request.resourcePath?.startsWith("deleted:")) deletedResource();
    if (!request.resourceId)
      await completeRequest(tx, auth.userId, parsed.requestId, randomUUID(), storagePath);
    else if (request.resourcePath?.startsWith("cleaned:"))
      await completeRequest(tx, auth.userId, parsed.requestId, request.resourceId, storagePath);
  });
  return db.transaction(async (tx) => {
    await lockUser(tx, auth.userId);
    const { place, edition, capturePath } = await requireOwnedCapture(
      tx,
      auth,
      slug,
      parsed.editionId,
    );
    const request = await reserveRequest(tx, auth.userId, parsed.requestId, "place.image.promote", {
      placeId: place.id,
      ...parsed,
    });
    if (request.resourcePath?.startsWith("deleted:")) deletedResource();
    if (request.resourcePath?.startsWith("cleaned:"))
      throw new ApiError(503, "service_unavailable", "Retry this image request.");
    if (!request.resourceId)
      throw new ApiError(503, "service_unavailable", "Retry this image request.");
    const [existing] = await tx
      .select()
      .from(placeImages)
      .where(eq(placeImages.id, request.resourceId));
    if (existing) return { data: serializePlaceImageDto(existing), created: false };
    const [published] = await tx
      .select()
      .from(placeImages)
      .where(
        and(
          eq(placeImages.provider, "user"),
          eq(placeImages.providerId, edition.id),
          eq(placeImages.uploadedBy, auth.userId),
        ),
      );
    if (published) throw new ApiError(409, "conflict", "This capture already has a public image.");
    const copy = await storage.promote(auth, capturePath, edition.requestId, storagePath);
    const [image] = await tx
      .insert(placeImages)
      .values({
        id: request.resourceId,
        placeId: place.id,
        provider: "user",
        providerId: edition.id,
        ...copy,
        uploadedBy: auth.userId,
        requestId: parsed.requestId,
        storagePath,
        consentedAt: new Date(),
        fetchedAt: new Date(),
        license: parsed.license,
        licenseUrl: licenses[parsed.license],
        attribution: parsed.attribution,
        sourcePageUrl: copy.url,
      })
      .returning();
    return { data: serializePlaceImageDto(image), created: true };
  });
}

export async function deletePlaceImage(
  auth: AuthContext,
  slug: string,
  id: string,
  storage: PlaceImageStorage = placeImageStorage,
): Promise<{ deleted: true }> {
  const path = await db.transaction(async (tx) => {
    await lockUser(tx, auth.userId);
    const place = await requireVisiblePlace(tx, slug, auth.userId);
    const [image] = await tx
      .delete(placeImages)
      .where(
        and(
          eq(placeImages.id, id),
          eq(placeImages.placeId, place.id),
          eq(placeImages.uploadedBy, auth.userId),
        ),
      )
      .returning();
    if (image?.requestId && image.storagePath) {
      await tx
        .update(apiRequests)
        .set({ resourcePath: `deleted:${place.id}:${image.storagePath}` })
        .where(
          and(eq(apiRequests.userId, auth.userId), eq(apiRequests.requestId, image.requestId)),
        );
      return image.storagePath;
    }
    const [request] = await tx
      .select()
      .from(apiRequests)
      .where(
        and(
          eq(apiRequests.userId, auth.userId),
          eq(apiRequests.resourceId, id),
          eq(apiRequests.operation, "place.image.promote"),
          like(apiRequests.resourcePath, `deleted:${place.id}:%`),
        ),
      );
    if (!request?.resourcePath) notFound("This image is unavailable.");
    return request.resourcePath.slice(`deleted:${place.id}:`.length);
  });
  if (path) {
    await storage.remove(path);
    await db
      .update(apiRequests)
      .set({ resourcePath: `deleted:${(await requireVisiblePlace(db, slug, auth.userId)).id}:` })
      .where(
        and(
          eq(apiRequests.userId, auth.userId),
          eq(apiRequests.resourceId, id),
          eq(apiRequests.operation, "place.image.promote"),
        ),
      );
  }
  return { deleted: true };
}

export async function cleanupPlaceImageObjects(
  storage: PlaceImageStorage = placeImageStorage,
  before = new Date(Date.now() - 60 * 60 * 1000),
): Promise<number> {
  const pending = await db
    .select()
    .from(apiRequests)
    .where(
      and(
        eq(apiRequests.operation, "place.image.promote"),
        or(
          like(apiRequests.resourcePath, "place-images/%"),
          like(apiRequests.resourcePath, "deleted:%:place-images/%"),
        ),
        lt(apiRequests.createdAt, before),
        sql`not exists (select 1 from place_images i where i.id = ${apiRequests.resourceId})`,
      ),
    )
    .orderBy(asc(apiRequests.createdAt))
    .limit(100);
  let cleaned = 0;
  for (const candidate of pending) {
    await db.transaction(async (tx) => {
      await lockUser(tx, candidate.userId);
      const [image] = candidate.resourceId
        ? await tx.select().from(placeImages).where(eq(placeImages.id, candidate.resourceId))
        : [];
      if (image) return;
      const [request] = await tx
        .select()
        .from(apiRequests)
        .where(
          and(
            eq(apiRequests.userId, candidate.userId),
            eq(apiRequests.requestId, candidate.requestId),
          ),
        );
      if (!request?.resourcePath) return;
      const path = request.resourcePath.startsWith("deleted:")
        ? request.resourcePath.split(":").slice(2).join(":")
        : request.resourcePath;
      if (!path.startsWith("place-images/")) return;
      await storage.remove(path);
      await tx
        .update(apiRequests)
        .set({
          resourcePath: request.resourcePath.startsWith("deleted:")
            ? request.resourcePath.split(":").slice(0, 2).join(":") + ":"
            : `cleaned:${path}`,
        })
        .where(
          and(
            eq(apiRequests.userId, candidate.userId),
            eq(apiRequests.requestId, candidate.requestId),
          ),
        );
      cleaned += 1;
    });
  }
  return cleaned;
}

export async function revokeEditionPlaceImages(
  tx: Transaction,
  userId: string,
  editionId: string,
): Promise<void> {
  const images = await tx
    .delete(placeImages)
    .where(
      and(
        eq(placeImages.provider, "user"),
        eq(placeImages.providerId, editionId),
        eq(placeImages.uploadedBy, userId),
      ),
    )
    .returning();
  for (const image of images) {
    if (!image.requestId || !image.storagePath) continue;
    await tx
      .update(apiRequests)
      .set({ resourcePath: `deleted:${image.placeId}:${image.storagePath}` })
      .where(
        and(
          eq(apiRequests.userId, userId),
          eq(apiRequests.requestId, image.requestId),
          eq(apiRequests.operation, "place.image.promote"),
        ),
      );
  }
}

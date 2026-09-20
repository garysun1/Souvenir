import { and, eq, isNull, isNotNull, lte, ne, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { places, placeImages, placeSources } from "@/lib/db/schema";
import { env } from "@/lib/env";
import type { Database } from "@/lib/server/transactions";
import { createProviderHttp, type ProviderHttp } from "./http";
import { fetchEntity } from "./wikidata";
import { resolveImage, type CommonsImageCandidate } from "./wikimedia";
import { POLICY_CHECKED_AT, sourcePolicies } from "./policies";

export async function enrichPlace(
  placeId: string,
  options: { confirmedImage?: string } = {},
  database: Database = db,
  http: ProviderHttp = createProviderHttp(env.PLACES_USER_AGENT),
): Promise<{ updated: boolean; candidates: CommonsImageCandidate[]; imageSelected: boolean }> {
  z.string().uuid().parse(placeId);
  const [place] = await database.select().from(places).where(eq(places.id, placeId));
  if (!place || place.source === "user" || !place.wikidataId)
    return { updated: false, candidates: [], imageSelected: false };
  const metadata = await fetchEntity(place.wikidataId, http);
  if (!metadata) return { updated: false, candidates: [], imageSelected: false };
  const candidates: CommonsImageCandidate[] = [];
  for (const name of metadata.imageRefs.slice(0, 2)) {
    const candidate = await resolveImage(name, http);
    if (candidate) candidates.push(candidate);
  }
  const selected = candidates.find((image) => image.providerId === options.confirmedImage);
  if (options.confirmedImage && !selected)
    throw new Error(
      "Confirmed image is not an eligible licensed candidate for this exact Wikidata entity.",
    );
  return database.transaction(async (tx) => {
    const [current] = await tx.select().from(places).where(eq(places.id, placeId)).for("update");
    if (!current || current.source === "user" || current.wikidataId !== place.wikidataId)
      throw new Error("Place identity changed; reselect it.");
    const fetchedAt = new Date();
    const [source] = await tx
      .insert(placeSources)
      .values({
        placeId,
        provider: "wikidata",
        providerId: place.wikidataId!,
        fetchedAt,
        retentionPolicy: "licensed",
        payload: {
          description: metadata.description,
          website: metadata.website,
          imageRefs: metadata.imageRefs,
        },
        retainedFields: ["description", "website", "imageRefs"],
        ...sourcePolicies.wikidata,
        sourceUrl: `https://www.wikidata.org/wiki/${place.wikidataId}`,
        status: "ready",
        policyCheckedAt: POLICY_CHECKED_AT,
      })
      .onConflictDoUpdate({
        target: [placeSources.provider, placeSources.providerId],
        set: {
          fetchedAt,
          status: "ready",
          expiresAt: null,
          retentionPolicy: "licensed",
          retainedFields: ["description", "website", "imageRefs"],
          policyCheckedAt: POLICY_CHECKED_AT,
          ...sourcePolicies.wikidata,
          payload: {
            description: metadata.description,
            website: metadata.website,
            imageRefs: metadata.imageRefs,
          },
        },
        setWhere: eq(placeSources.placeId, placeId),
      })
      .returning({ id: placeSources.id });
    if (!source)
      throw new Error("Provider identity is already linked to another place; review required.");
    await tx
      .update(places)
      .set({
        description: current.description || metadata.description || "",
        website: current.website ?? metadata.website,
      })
      .where(eq(places.id, placeId));
    if (selected) {
      const [imageSource] = await tx
        .insert(placeSources)
        .values({
          placeId,
          provider: "wikimedia",
          providerId: selected.providerId,
          fetchedAt,
          retentionPolicy: "metadata_only",
          retainedFields: [],
          license: selected.license,
          licenseUrl: selected.licenseUrl,
          attribution: selected.attribution,
          sourceUrl: selected.sourcePageUrl,
          policyUrl: "https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia",
          policyCheckedAt: POLICY_CHECKED_AT,
          status: "ready",
        })
        .onConflictDoUpdate({
          target: [placeSources.provider, placeSources.providerId],
          set: {
            fetchedAt,
            expiresAt: null,
            license: selected.license,
            licenseUrl: selected.licenseUrl,
            attribution: selected.attribution,
            status: "ready",
          },
          setWhere: eq(placeSources.placeId, placeId),
        })
        .returning({ id: placeSources.id });
      if (!imageSource)
        throw new Error("Image is already linked to another place; review required.");
      await tx.update(placeImages).set({ isHero: false }).where(eq(placeImages.placeId, placeId));
      const [existing] = await tx
        .select()
        .from(placeImages)
        .where(
          and(
            eq(placeImages.placeId, placeId),
            eq(placeImages.provider, "wikimedia"),
            eq(placeImages.providerId, selected.providerId),
          ),
        );
      const values = {
        ...selected,
        placeId,
        sourceId: imageSource.id,
        provider: "wikimedia" as const,
        fetchedAt,
        isHero: true,
      };
      if (existing) await tx.update(placeImages).set(values).where(eq(placeImages.id, existing.id));
      else await tx.insert(placeImages).values(values);
      await tx.update(places).set({ heroImageUrl: selected.url }).where(eq(places.id, placeId));
    }
    return { updated: true, candidates, imageSelected: !!selected };
  });
}

export async function purgeExpiredSourceData(
  database: Database = db,
  now = new Date(),
): Promise<number> {
  return database.transaction(async (tx) => {
    const expired = await tx
      .select()
      .from(placeSources)
      .where(
        or(
          and(
            lte(placeSources.expiresAt, now),
            or(ne(placeSources.status, "stale"), isNotNull(placeSources.payload)),
          ),
          and(
            eq(placeSources.retentionPolicy, "do_not_store"),
            ne(placeSources.status, "unavailable"),
          ),
        ),
      )
      .limit(500)
      .for("update", { skipLocked: true });
    for (const source of expired) {
      const removed = await tx
        .delete(placeImages)
        .where(and(eq(placeImages.sourceId, source.id), isNull(placeImages.storagePath)))
        .returning();
      for (const image of removed) {
        await tx
          .update(places)
          .set({ heroImageUrl: null })
          .where(and(eq(places.id, source.placeId), eq(places.heroImageUrl, image.url)));
      }
      await tx
        .update(placeSources)
        .set({
          payload: null,
          retainedFields: [],
          status: source.retentionPolicy === "do_not_store" ? "unavailable" : "stale",
        })
        .where(eq(placeSources.id, source.id));
    }
    return expired.length;
  });
}

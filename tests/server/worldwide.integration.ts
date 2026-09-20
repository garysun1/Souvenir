import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import { closeDb, db } from "@/lib/db";
import {
  apiRequests,
  editions,
  friendships,
  placeImages,
  places,
  setPlaces,
  sets,
  users,
} from "@/lib/db/schema";
import { getBootstrap, getFeaturedPlaces, getCollectionSets } from "@/lib/data";
import { createEdition, deleteEdition, getCollection, getEdition } from "@/lib/server/editions";
import {
  createWishlist,
  addWishlistMember,
  putWishlistItem,
  getWishlist,
} from "@/lib/server/wishlists";
import { createPlaceNote, patchPlaceNote, deletePlaceNote } from "@/lib/server/place-metadata";
import { getPlaceDetail } from "@/lib/server/place-detail";
import { getFeed } from "@/lib/server/feed";
import { createPlan, requirePlan } from "@/lib/server/plans";
import { putRanking, putPlacePreference } from "@/lib/server/rankings";
import { searchPg } from "@/lib/search/pgFallback";
import { ingestProviderPlaces } from "@/lib/places/store";
import { providerPlaceSchema } from "@/lib/places/types";
import { getNearbyPlaces } from "@/lib/places/coverage";
import { MockPlacesProvider } from "@/lib/places/mock";
import { GET as me } from "@/app/api/me/route";
import type { AuthContext } from "../../shared/api-contract";

vi.mock("@/lib/auth/server", () => ({
  requireApiUser: async (request: Request) => ({
    auth: { userId: request.headers.get("x-test-user"), email: null, mode: "bearer" },
  }),
}));
vi.mock("@/lib/auth/storage", () => ({
  signCapturePhoto: vi.fn(),
  verifyCapturePhoto: vi.fn(),
  deleteCapturePhoto: vi.fn(),
}));

const owner = randomUUID();
const friend = randomUUID();
const stranger = randomUUID();
const publicId = randomUUID();
const privateId = randomUUID();
const friendsId = randomUUID();
const auth = (userId: string): AuthContext => ({ userId, email: null, mode: "bearer" });
const visit = (placeId: string) => ({
  requestId: randomUUID(),
  placeId,
  capturedAt: new Date(Date.now() - 86_400_000).toISOString(),
  timezone: "UTC",
  visibility: "public" as const,
});

beforeEach(async () => {
  await db.execute(sql`TRUNCATE users, places, sets CASCADE`);
  await db.insert(users).values([
    { id: owner, handle: "owner", displayName: "Owner" },
    { id: friend, handle: "friend", displayName: "Friend" },
    { id: stranger, handle: "stranger", displayName: "Stranger" },
  ]);
  await db.insert(friendships).values({ userId: owner, friendId: friend, status: "accepted" });
  await db.insert(places).values(
    [
      { id: publicId, slug: "public", visibility: "public" as const, ownerId: null },
      { id: privateId, slug: "private", visibility: "private" as const, ownerId: owner },
      { id: friendsId, slug: "friends", visibility: "friends" as const, ownerId: owner },
    ].map((row) => ({
      ...row,
      name: row.slug,
      category: "nature" as const,
      lat: 1,
      lng: 1,
      city: "Test City",
      country: "US",
      source: row.ownerId ? ("user" as const) : ("curated" as const),
      description: "",
      rarityTier: "common" as const,
      rarityAppeal: 0,
      rarityDiscoveryFreq: 0,
      rarityAvailability: 0,
      stats: { payload: "never-return-raw" },
      externalIds: { payload: "never-return-raw" },
      heroImageUrl: "https://private.test/captures/photo.jpg",
    })),
  );
});
afterAll(closeDb);

it("filters bootstrap, legacy catalog, shared lists and collections after friendship revocation", async () => {
  const [set] = await db
    .insert(sets)
    .values({
      slug: "mixed-set",
      name: "Mixed",
      description: "",
      city: "Test City",
    })
    .returning();
  await db.insert(setPlaces).values(
    [publicId, privateId, friendsId].map((placeId, position) => ({
      setId: set.id,
      placeId,
      position,
    })),
  );
  const list = (
    await createWishlist(owner, { requestId: randomUUID(), name: "Shared", isShared: true })
  ).data;
  await addWishlistMember(owner, list.id, "friend");
  await putWishlistItem(owner, list.id, { placeId: privateId, saved: true });
  await putWishlistItem(owner, list.id, { placeId: friendsId, saved: true });
  expect((await getWishlist(friend, list.id)).entries.map((entry) => entry.placeId)).toEqual([
    friendsId,
  ]);
  const edition = (await createEdition(auth(friend), visit(friendsId))).data;
  await putRanking(friend, friendsId, { sentiment: "recommend", ranking: "unranked" });
  await putPlacePreference(friend, friendsId, { favorite: true, tip: "Private tip" });
  const plan = await createPlan(friend, {
    requestId: randomUUID(),
    plan: {
      title: "Friend's place",
      constraints: {
        participantIds: [friend],
        date: "2026-09-20",
        startMinute: 600,
        endMinute: 900,
        budgetCents: 1000,
        transport: "walk",
        interests: ["nature"],
        rain: false,
        preferredPlaceIds: [friendsId],
        excludedPlaceIds: [],
      },
      stops: [
        {
          placeId: friendsId,
          arrivalMinute: 610,
          departureMinute: 670,
          travelMinutes: 10,
          costCents: 0,
        },
      ],
      totalCostCents: 0,
      totalMinutes: 70,
      checks: [],
      version: 1,
      provenance: "manual",
    },
  });
  expect((await getBootstrap(friend)).plans).toHaveLength(1);
  expect((await getBootstrap(owner)).places).toHaveLength(3);
  expect((await getBootstrap(stranger)).places.map((place) => place.id)).toEqual([publicId]);
  expect((await getFeaturedPlaces()).map((place) => place.id)).toEqual([publicId]);
  expect((await getCollectionSets())[0].places.map((place) => place.id)).toEqual([publicId]);
  const search = await searchPg({ q: "", radiusKm: 100, limit: 20 });
  expect(search.map((entry) => entry.place.id)).toEqual([publicId]);
  expect(JSON.stringify(search)).not.toMatch(/never-return-raw|captures/);
  await db.delete(friendships);
  expect(await getCollection(auth(friend))).toEqual([]);
  await expect(getEdition(auth(friend), edition.id)).rejects.toMatchObject({ status: 404 });
  expect((await getWishlist(friend, list.id)).entries).toEqual([]);
  const bootstrap = await getBootstrap(friend);
  expect(bootstrap.sets[0].places.map((place) => place.id)).toEqual([publicId]);
  expect(bootstrap).toMatchObject({ plans: [], rankings: [], placePreferences: [] });
  await expect(requirePlan(db, friend, plan.data.id)).rejects.toMatchObject({ status: 404 });
  expect(JSON.stringify(bootstrap)).not.toMatch(/never-return-raw|captures/);
});

it("returns real profile/detail metrics with per-viewer social counts and provider availability", async () => {
  await createEdition(auth(owner), visit(publicId));
  const detail = await getPlaceDetail(friend, "public");
  expect(detail.metrics).toMatchObject({ collectors: 1, editions: 1, discoveryFreq: null });
  expect(detail.social).toEqual({ friendsBeen: 1, friendsSaved: 0 });
  expect((await getPlaceDetail(stranger, "public")).social).toEqual({
    friendsBeen: 0,
    friendsSaved: 0,
  });
  const response = await me(
    new Request("https://souvenir.test/api/me", { headers: { "x-test-user": owner } }),
  );
  expect(response.status).toBe(200);
  expect((await response.json()).data.stats).toMatchObject({
    editions: 1,
    placesVisited: 1,
    citiesVisited: 1,
  });
  expect((await getPlaceDetail(owner, "private")).metrics).toBeNull();
});

it("synchronizes note feed creation, visibility and deletion transactionally", async () => {
  const note = (
    await createPlaceNote(owner, "public", {
      requestId: randomUUID(),
      kind: "tip",
      body: "A public tip",
      visibility: "friends",
    })
  ).data;
  expect((await getFeed(friend, { limit: 10 })).events.map((event) => event.kind)).toEqual([
    "note",
  ]);
  await patchPlaceNote(owner, "public", note.id, { visibility: "private" });
  expect((await getFeed(friend, { limit: 10 })).events).toEqual([]);
  await patchPlaceNote(owner, "public", note.id, { visibility: "friends" });
  await deletePlaceNote(owner, "public", note.id);
  expect((await getFeed(friend, { limit: 10 })).events).toEqual([]);
});

it("revokes public derivatives when deleting an edition, preserving a durable cleanup intent", async () => {
  const edition = (await createEdition(auth(owner), visit(publicId))).data;
  const requestId = randomUUID();
  const imageId = randomUUID();
  const path = `place-images/${owner}/${requestId}.webp`;
  await db.insert(apiRequests).values({
    userId: owner,
    requestId,
    operation: "place.image.promote",
    requestHash: "test",
    resourceId: imageId,
    resourcePath: path,
  });
  await db.insert(placeImages).values({
    id: imageId,
    placeId: publicId,
    provider: "user",
    providerId: edition.id,
    uploadedBy: owner,
    requestId,
    storagePath: path,
    consentedAt: new Date(),
    url: "https://public.test/image.webp",
    sourcePageUrl: "https://public.test/image.webp",
    license: "CC-BY-4.0",
    attribution: "Owner",
  });
  await deleteEdition(auth(owner), edition.id);
  expect(await db.select().from(placeImages)).toEqual([]);
  const [intent] = await db.select().from(apiRequests).where(eq(apiRequests.requestId, requestId));
  expect(intent.resourcePath).toBe(`deleted:${publicId}:${path}`);
  expect(await db.select().from(editions)).toEqual([]);
});

it("refreshes catalog facts and locality aggregates without overwriting fresher provider evidence", async () => {
  const initial = providerPlaceSchema.parse({
    provider: "osm",
    providerId: "node/1234",
    name: "Original",
    category: "nature",
    lat: 20,
    lng: 30,
    city: "Old City",
    country: "US",
    fetchedAt: new Date(Date.now() - 60_000).toISOString(),
    evidence: "provider",
  });
  const result = await ingestProviderPlaces([initial]);
  await createEdition(auth(owner), visit(result.placeIds[0]));
  const refreshed = {
    ...initial,
    name: "Renamed",
    city: "New City",
    openingHours: "Mo-Fr 09:00-17:00",
    fetchedAt: new Date().toISOString(),
  };
  expect((await ingestProviderPlaces([refreshed])).refreshed).toBe(1);
  await ingestProviderPlaces([initial]);
  const [place] = await db.select().from(places).where(eq(places.id, result.placeIds[0]));
  expect(place).toMatchObject({ name: "Renamed", city: "New City" });
  const detail = await getPlaceDetail(owner, place.slug);
  expect(detail.metrics?.frequency.city).toBe("New City");
  expect(detail.availability).toMatchObject({
    status: "known",
    openingHours: refreshed.openingHours,
  });
  expect(
    (await searchPg({ q: "Renamed", radiusKm: 100, limit: 10 })).map((item) => item.place.id),
  ).toEqual([place.id]);
});

it("keeps synthetic lazy-filled discoveries distinct from live provider fetches", async () => {
  const provider = new MockPlacesProvider([
    providerPlaceSchema.parse({
      provider: "curated",
      providerId: "synthetic:integration:1",
      name: "Synthetic spot",
      category: "nature",
      lat: 10,
      lng: 10,
      fetchedAt: new Date().toISOString(),
      evidence: "synthetic-fixture",
    }),
  ]);
  const nearby = await getNearbyPlaces({ lat: 10, lng: 10, radiusM: 500, limit: 10 }, db, {
    provider,
    lazyFill: true,
  });
  expect(nearby.provenance).toBe("catalog");
  expect(nearby.places).toHaveLength(1);
  expect(nearby.places[0].place.stats).toMatchObject({ provenance: "synthetic-fixture" });
  expect(nearby.places[0].place.sources?.[0].status).toBe("unavailable");
});

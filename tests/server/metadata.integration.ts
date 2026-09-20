import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { db, closeDb } from "@/lib/db";
import {
  activityEvents,
  apiRequests,
  editions,
  friendships,
  placeImages,
  placeNotes,
  placePreferences,
  places,
  placeSources,
  placeSuggestions,
  placeTags,
  setPlaces,
  sets,
  users,
} from "@/lib/db/schema";
import { GET as catalog, POST as createPlace } from "@/app/api/places/route";
import { GET as detail } from "@/app/api/places/[slug]/route";
import { GET as notes, POST as createNote } from "@/app/api/places/[slug]/notes/route";
import { PATCH as patchNote, DELETE as deleteNote } from "@/app/api/places/[slug]/notes/[id]/route";
import { GET as tags, PUT as putTags } from "@/app/api/places/[slug]/tags/route";
import { POST as suggest } from "@/app/api/places/[slug]/suggestions/route";
import { GET as images, POST as promote } from "@/app/api/places/[slug]/images/route";
import { DELETE as deleteImage } from "@/app/api/places/[slug]/images/[id]/route";
import { GET as sources } from "@/app/api/places/[slug]/sources/route";
import { PUT as oldPreference } from "@/app/api/me/places/[placeId]/route";
import { getPlaces, getSets, requirePlaces } from "@/lib/server/catalog";
import { cleanupPlaceImageObjects, revokeEditionPlaceImages } from "@/lib/server/place-images";
import { lockUser } from "@/lib/server/transactions";
import { ApiError } from "@/lib/server/errors";
import { placeMetricsSchema } from "@/lib/contracts/api";
import type { PlaceImageStorage } from "@/lib/server/place-image-storage";
import { nearbyPg, searchPg } from "@/lib/search/pgFallback";
import manifest from "../../db/seed/catalog-images.json";

const storage = vi.hoisted(() => ({
  promote: vi.fn<PlaceImageStorage["promote"]>(),
  remove: vi.fn<PlaceImageStorage["remove"]>(),
}));
vi.mock("@/lib/server/place-image-storage", () => ({ placeImageStorage: storage }));
vi.mock("@/lib/auth/server", () => ({
  requireApiUser: async (request: Request) => {
    const userId = request.headers.get("x-test-user");
    return userId
      ? { auth: { userId, email: null, mode: "bearer" } }
      : { response: Response.json({ error: "unauthorized" }, { status: 401 }) };
  },
}));

const alice = randomUUID();
const bob = randomUUID();
const eve = randomUUID();
const publicId = randomUUID();
const privateId = randomUUID();
const friendsId = randomUUID();
const captureId = randomUUID();
const captureRequest = randomUUID();
const originalPath = `${alice}/${captureRequest}.jpg`;
const slug = "public-place";
const params = (name = slug) => ({ params: Promise.resolve({ slug: name }) });
const idParams = (id: string, name = slug) => ({ params: Promise.resolve({ slug: name, id }) });
function request(method = "GET", body?: unknown, user: string | null = alice, query = "") {
  return new Request(`https://souvenir.test/api/places${query}`, {
    method,
    headers: { "Content-Type": "application/json", ...(user ? { "x-test-user": user } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
const noteInput = (body = "A useful tip") => ({ requestId: randomUUID(), kind: "tip", body });
const placeInput = () => ({
  requestId: randomUUID(),
  name: "Quiet Spring",
  category: "nature",
  lat: 18.1,
  lng: 179.99999,
});
const promotion = () => ({
  requestId: randomUUID(),
  editionId: captureId,
  confirmPublic: true,
  rightsConfirmed: true,
  license: "CC-BY-4.0",
  attribution: "Alice",
});

beforeEach(async () => {
  vi.resetAllMocks();
  storage.promote.mockResolvedValue({
    url: "https://storage.test/place-images/derivative.webp",
    width: 800,
    height: 600,
  });
  storage.remove.mockResolvedValue(undefined);
  await db.execute(sql`TRUNCATE users, places, sets CASCADE`);
  await db.insert(users).values([
    { id: alice, handle: "alice", displayName: "Alice" },
    { id: bob, handle: "bob", displayName: "Bob" },
    { id: eve, handle: "eve", displayName: "Eve" },
  ]);
  await db.insert(friendships).values({ userId: alice, friendId: bob, status: "accepted" });
  await db.insert(places).values(
    [
      { id: publicId, slug, name: "A Public Place", visibility: "public" as const, ownerId: null },
      {
        id: privateId,
        slug: "private-place",
        name: "Secret Hidden Place",
        visibility: "private" as const,
        ownerId: alice,
      },
      {
        id: friendsId,
        slug: "friends-place",
        name: "Friends Place",
        visibility: "friends" as const,
        ownerId: alice,
      },
    ].map((row) => ({
      ...row,
      category: "nature" as const,
      lat: 10,
      lng: 20,
      city: null,
      source: row.ownerId ? ("user" as const) : ("curated" as const),
      description: "Test place",
      rarityTier: "common" as const,
      rarityAppeal: 0,
      rarityAvailability: 0,
      rarityDiscoveryFreq: 0,
      externalIds: { secret: "provider-raw" },
      stats: { payload: "provider-raw" },
      heroImageUrl: "https://storage.test/captures/private-photo.jpg",
    })),
  );
  await db.insert(editions).values({
    id: captureId,
    userId: alice,
    placeId: publicId,
    requestId: captureRequest,
    photoPath: originalPath,
    visitSequence: 1,
  });
});
afterAll(closeDb);

describe("catalog and detail visibility", () => {
  it("returns credited curated photography in catalog, detail, search, nearby, and sets", async () => {
    const image = manifest.find((item) => item.slug === "griffith-observatory")!;
    await db
      .update(places)
      .set({ slug: image.slug, lat: image.lat, lng: image.lng })
      .where(eq(places.id, publicId));
    const [set] = await db
      .insert(sets)
      .values({ slug: "photos", name: "Photos", description: "", city: "LA" })
      .returning();
    await db.insert(setPlaces).values({ setId: set.id, placeId: publicId, position: 0 });
    const entries = [
      (await getPlaces())[0],
      (await (await catalog(request("GET", undefined, null))).json()).data[0],
      (await (await detail(request("GET", undefined, null), params(image.slug))).json()).data,
      (await (await detail(request(), params(image.slug))).json()).data,
      (await searchPg({ q: "A Public Place", limit: 5, radiusKm: 10 }))[0].place,
      (await nearbyPg({ lat: image.lat, lng: image.lng, radiusM: 1000, limit: 5 }))[0].place,
      (await getSets())[0].places[0],
    ];
    for (const entry of entries) {
      expect(entry.heroImageUrl).toBe(image.url);
      expect(entry.images).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            url: image.url,
            isHero: true,
            license: image.license,
            attribution: image.attribution,
          }),
        ]),
      );
    }
    await db
      .update(places)
      .set({ stats: { evidence: "synthetic-fixture" } })
      .where(eq(places.id, publicId));
    expect((await getPlaces())[0]).toMatchObject({ heroImageUrl: null, images: [] });
  });

  it("selects only licensed, unexpired heroes from ready image sources", async () => {
    const [source] = await db
      .insert(placeSources)
      .values({
        placeId: publicId,
        provider: "wikimedia",
        providerId: "test-source",
        retentionPolicy: "licensed",
        policyUrl: "https://policy.test",
        policyCheckedAt: new Date(),
        status: "stale",
      })
      .returning();
    const base = {
      placeId: publicId,
      provider: "wikimedia" as const,
      isHero: false,
      license: "CC-BY-4.0",
      attribution: "Photographer",
      sourcePageUrl: "https://images.test/source",
    };
    const validUrl = "https://images.test/approved.jpg";
    const excluded = await db
      .insert(placeImages)
      .values([
        { ...base, url: "https://images.test/no-license.jpg", license: "" },
        { ...base, url: "https://images.test/no-credit.jpg", attribution: " " },
        { ...base, url: "https://images.test/expired.jpg", expiresAt: new Date(0) },
        { ...base, url: "https://images.test/stale-source.jpg", sourceId: source.id },
        { ...base, url: "https://user:secret@images.test/credentials.jpg" },
        { ...base, url: "file:///private.jpg" },
      ])
      .returning();
    for (const image of excluded) {
      await db.update(placeImages).set({ isHero: true }).where(eq(placeImages.id, image.id));
      expect((await getPlaces())[0]).toMatchObject({ heroImageUrl: null, images: [] });
      await db.update(placeImages).set({ isHero: false }).where(eq(placeImages.id, image.id));
    }
    await db.insert(placeImages).values([
      { ...base, url: "https://images.test/non-hero.jpg" },
      { ...base, url: validUrl, isHero: true },
    ]);
    expect((await getPlaces())[0]).toMatchObject({
      heroImageUrl: validUrl,
      images: [expect.objectContaining({ url: validUrl })],
    });
    const response = (await (await detail(request(), params())).json()).data;
    expect(response.heroImageUrl).toBe(validUrl);
    expect(response.images).toHaveLength(2);
    await db.delete(placeImages).where(eq(placeImages.url, validUrl));
    expect((await getPlaces())[0]).toMatchObject({ heroImageUrl: null, images: [] });
  });

  it("paginates stable catalog arrays, filters viewer visibility, and preserves unbounded bootstrap helpers", async () => {
    const anon = await (await catalog(request("GET", undefined, null))).json();
    expect(anon.data.map((p: { id: string }) => p.id)).toEqual([publicId]);
    const first = await (await catalog(request("GET", undefined, alice, "?limit=1"))).json();
    expect(first.data).toHaveLength(1);
    const second = await (
      await catalog(request("GET", undefined, alice, `?limit=1&cursor=${first.nextCursor}`))
    ).json();
    expect(second.data[0].id).not.toBe(first.data[0].id);
    expect((await getPlaces()).map((p) => p.id)).toEqual([publicId]);
    expect(await getPlaces(undefined, db, alice)).toHaveLength(3);
    expect(await getPlaces(undefined, db, bob)).toHaveLength(2);
    expect((await catalog(request("GET", undefined, alice, "?q=a&q=b"))).status).toBe(400);
    expect((await catalog(request("GET", undefined, alice, "?cursor=malformed"))).status).toBe(400);
    expect((await catalog(request("GET", undefined, alice, "?limit=100000"))).status).toBe(400);
    expect((await catalog(request("GET", undefined, alice, "?ownerId=someone"))).status).toBe(400);
    expect(await (await catalog(request("GET", undefined, eve, "?q=Secret"))).json()).toMatchObject(
      { data: [] },
    );
    expect(JSON.stringify(anon)).not.toContain("provider-raw");
    expect(JSON.stringify(anon)).not.toContain("captures");
  });

  it("applies visibility to sets and existence checks, including friendship removal", async () => {
    const [set] = await db
      .insert(sets)
      .values({ slug: "set", name: "Set", description: "", city: "Test" })
      .returning();
    await db.insert(setPlaces).values(
      [publicId, privateId, friendsId].map((placeId, position) => ({
        setId: set.id,
        placeId,
        position,
      })),
    );
    expect((await getSets())[0].places).toHaveLength(1);
    expect((await getSets(db, bob))[0].places).toHaveLength(2);
    await expect(requirePlaces(db, [privateId], eve)).rejects.toMatchObject({ status: 400 });
    await expect(requirePlaces(db, [privateId], alice)).resolves.toBeUndefined();
    await db.delete(friendships);
    expect((await getSets(db, bob))[0].places).toHaveLength(1);
  });

  it("hydrates insufficient activity metrics without disclosing private visits, tips or provider payloads", async () => {
    await db
      .insert(placePreferences)
      .values({ userId: alice, placeId: publicId, tip: "Private legacy preference" });
    await db.insert(placeSources).values({
      placeId: publicId,
      provider: "wikidata",
      providerId: "Q1",
      payload: { secret: "raw-provider-payload" },
      retentionPolicy: "licensed",
      policyUrl: "https://policy.test",
      policyCheckedAt: new Date(),
      status: "ready",
      expiresAt: new Date(Date.now() - 1000),
    });
    await db.insert(placeImages).values(
      [
        { url: "https://images.test/licensed.jpg", license: "CC-BY-4.0" },
        { url: "https://images.test/unlicensed.jpg", license: "" },
      ].map((row) => ({
        ...row,
        placeId: publicId,
        provider: "wikimedia" as const,
        attribution: "Artist",
        sourcePageUrl: "https://images.test/source",
      })),
    );
    const result = await detail(request(), params());
    expect(result.headers.get("Cache-Control")).toBe("private, no-store");
    const { data } = await result.json();
    expect(data).toMatchObject({
      metrics: {
        provenance: "souvenir-activity",
        sampleStatus: "insufficient",
        collectors: 0,
        editions: 0,
        saves: 0,
        discoveryFreq: null,
        frequency: {
          status: "unavailable",
          city: null,
          country: null,
          visitors90d: 0,
          cityVisitors90d: 0,
        },
        recommendRate: null,
        sentiment: { status: "insufficient", recommend: 0, depends: 0, skip: 0 },
        trendingScore: null,
        trend: { status: "insufficient", collectors7d: 0, weeklyCollectors8w: Array(8).fill(0) },
      },
      availability: { status: "unknown", openingHours: null },
      social: { friendsBeen: 0, friendsSaved: 0 },
    });
    expect(placeMetricsSchema.safeParse(data.metrics).success).toBe(true);
    expect(data.images).toHaveLength(1);
    expect(data.sources[0].status).toBe("stale");
    const text = JSON.stringify(data);
    for (const secret of [
      "raw-provider-payload",
      "provider-raw",
      "Private legacy",
      "photoPath",
      "payload",
      "captures",
    ])
      expect(text).not.toContain(secret);
    expect((await (await sources(request(), params())).json()).data[0]).not.toHaveProperty(
      "payload",
    );
    expect((await (await images(request(), params())).json()).data).toHaveLength(1);
  });

  it("uses identical unavailable responses for hidden and unknown slugs across read/write routes", async () => {
    for (const name of ["private-place", "absent-place"]) {
      expect(await (await detail(request("GET", undefined, eve), params(name))).json()).toEqual({
        error: "not_found",
        message: "This place is unavailable.",
      });
      for (const handler of [notes, tags, images, sources])
        expect((await handler(request("GET", undefined, eve), params(name))).status).toBe(404);
      expect((await createNote(request("POST", noteInput(), eve), params(name))).status).toBe(404);
      expect(
        (
          await suggest(
            request("POST", { requestId: randomUUID(), field: "closed", value: true }, eve),
            params(name),
          )
        ).status,
      ).toBe(404);
    }
    expect((await detail(request("GET", undefined, bob), params("friends-place"))).status).toBe(
      200,
    );
    await db.delete(friendships);
    expect((await detail(request("GET", undefined, bob), params("friends-place"))).status).toBe(
      404,
    );
  });
});

describe("custom place writes", () => {
  it("rolls custom-place reservation back on a database failure", async () => {
    const input = placeInput();
    await db.execute(
      sql`CREATE FUNCTION metadata_reject_place() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected place failure'; END $$`,
    );
    await db.execute(
      sql`CREATE TRIGGER metadata_place_failure BEFORE INSERT ON places FOR EACH ROW EXECUTE FUNCTION metadata_reject_place()`,
    );
    try {
      expect((await createPlace(request("POST", input))).status).toBe(500);
      expect(
        await db.select().from(apiRequests).where(eq(apiRequests.requestId, input.requestId)),
      ).toHaveLength(0);
      expect(await db.select().from(places)).toHaveLength(3);
    } finally {
      await db.execute(sql`DROP TRIGGER metadata_place_failure ON places`);
      await db.execute(sql`DROP FUNCTION metadata_reject_place()`);
    }
    expect((await createPlace(request("POST", input))).status).toBe(201);
  });

  it("requires auth, rejects owner injection and defaults to private with nullable locality", async () => {
    expect((await createPlace(request("POST", placeInput(), null))).status).toBe(401);
    for (const key of ["userId", "ownerId"])
      expect((await createPlace(request("POST", { ...placeInput(), [key]: bob }))).status).toBe(
        400,
      );
    const input = placeInput();
    const first = await createPlace(request("POST", input));
    expect(first.status).toBe(201);
    const { data } = await first.json();
    expect(data).toMatchObject({
      city: null,
      country: null,
      visibility: "private",
      source: "user",
    });
    expect((await db.select().from(places).where(eq(places.id, data.id)))[0].ownerId).toBe(alice);
    const replay = await createPlace(
      request("POST", { ...input, visibility: "private", city: null }),
    );
    expect(replay.status).toBe(200);
    expect((await replay.json()).data.id).toBe(data.id);
    expect((await createPlace(request("POST", { ...input, name: "Changed" }))).status).toBe(409);
  });

  it("returns only accessible duplicate candidates and rolls back rejected reservations", async () => {
    const input = { ...placeInput(), visibility: "public" };
    const created = (await (await createPlace(request("POST", input))).json()).data;
    const duplicate = { ...input, requestId: randomUUID(), lng: -179.99999 };
    const response = await createPlace(request("POST", duplicate, bob));
    expect(response.status).toBe(409);
    expect((await response.json()).details.existingPlace.id).toBe(created.id);
    expect(
      await db.select().from(apiRequests).where(eq(apiRequests.requestId, duplicate.requestId)),
    ).toHaveLength(0);
    await db.update(places).set({ visibility: "private" }).where(eq(places.id, created.id));
    const invisible = await createPlace(request("POST", duplicate, bob));
    expect(invisible.status).toBe(201);
    expect(await invisible.text()).not.toContain(created.id);
  });

  it("serializes cross-user public duplicates while collapsing same-request retries", async () => {
    const input = { ...placeInput(), visibility: "public" };
    const retries = await Promise.all(
      Array.from({ length: 5 }, () => createPlace(request("POST", input))),
    );
    expect(retries.filter((r) => r.status === 201)).toHaveLength(1);
    const parallel = await Promise.all(
      [alice, bob, eve].map((user) =>
        createPlace(
          request(
            "POST",
            {
              ...placeInput(),
              name: "Another Spring",
              visibility: "public",
            },
            user,
          ),
        ),
      ),
    );
    expect(parallel.map((r) => r.status).sort()).toEqual([201, 409, 409]);
    expect(await db.select().from(places).where(eq(places.name, "Another Spring"))).toHaveLength(1);
  });
});

describe("notes, tags and corrections", () => {
  it("restores the previous tag set when replacement insertion fails", async () => {
    await putTags(request("PUT", { tags: ["original"] }), params());
    await db.execute(
      sql`CREATE FUNCTION metadata_reject_tag() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected tag failure'; END $$`,
    );
    await db.execute(
      sql`CREATE TRIGGER metadata_tag_failure BEFORE INSERT ON place_tags FOR EACH ROW EXECUTE FUNCTION metadata_reject_tag()`,
    );
    try {
      expect((await putTags(request("PUT", { tags: ["replacement"] }), params())).status).toBe(500);
      expect((await (await tags(request(), params())).json()).data.myTags).toEqual(["original"]);
    } finally {
      await db.execute(sql`DROP TRIGGER metadata_tag_failure ON place_tags`);
      await db.execute(sql`DROP FUNCTION metadata_reject_tag()`);
    }
  });

  it("hydrates own notes independently of other authors and counts only visible accepted friends", async () => {
    const input = noteInput("Own private note");
    await createNote(request("POST", input), params());
    await db.insert(placeNotes).values(
      Array.from({ length: 101 }, () => ({
        userId: bob,
        placeId: publicId,
        requestId: randomUUID(),
        kind: "tip" as const,
        visibility: "public" as const,
        body: "Visible note",
        createdAt: new Date(Date.now() + 1000),
      })),
    );
    await db.insert(editions).values(
      [bob, bob, eve].map((userId, index) => ({
        userId,
        placeId: publicId,
        requestId: randomUUID(),
        visitSequence: index + 1,
        visibility: index === 0 ? ("private" as const) : ("public" as const),
      })),
    );
    const { data } = await (await detail(request(), params())).json();
    expect(data.notes).toHaveLength(100);
    expect(data.myNotes).toHaveLength(1);
    expect(data.myNotes[0].body).toBe("Own private note");
    expect(data.social.friendsBeen).toBe(1);
    await db.delete(friendships);
    expect((await (await detail(request(), params())).json()).data.social.friendsBeen).toBe(0);
  });

  it("authenticates every metadata route and rejects submitted actor IDs and unbounded input", async () => {
    for (const handler of [notes, tags, images, sources])
      expect((await handler(request("GET", undefined, null), params())).status).toBe(401);
    expect((await createNote(request("POST", noteInput(), null), params())).status).toBe(401);
    expect((await putTags(request("PUT", { tags: [] }, null), params())).status).toBe(401);
    expect((await suggest(request("POST", {}, null), params())).status).toBe(401);
    expect((await promote(request("POST", promotion(), null), params())).status).toBe(401);
    for (const handler of [deleteNote, deleteImage])
      expect(
        (await handler(request("DELETE", undefined, null), idParams(randomUUID()))).status,
      ).toBe(401);
    expect(
      (await patchNote(request("PATCH", { body: "x" }, null), idParams(randomUUID()))).status,
    ).toBe(401);
    expect(
      (await createNote(request("POST", { ...noteInput(), userId: bob }), params())).status,
    ).toBe(400);
    expect((await createNote(request("POST", noteInput("x".repeat(601))), params())).status).toBe(
      400,
    );
    expect((await putTags(request("PUT", { tags: ["bad tag"] }), params())).status).toBe(400);
    expect((await putTags(request("PUT", { tags: [], userId: bob }), params())).status).toBe(400);
    expect(
      (
        await suggest(
          request("POST", { requestId: randomUUID(), field: "closed", value: true, userId: bob }),
          params(),
        )
      ).status,
    ).toBe(400);
  });

  it("writes note/event together, replays safely, restricts edits/deletes to owner and retains tombstones", async () => {
    const input = noteInput();
    const result = await createNote(request("POST", input), params());
    expect(result.status).toBe(201);
    const { data } = await result.json();
    expect(data).toMatchObject({ userId: alice, visibility: "private" });
    expect((await createNote(request("POST", input), params())).status).toBe(200);
    expect(
      (await createNote(request("POST", { ...input, body: "Different" }), params())).status,
    ).toBe(409);
    expect(
      await db.select().from(activityEvents).where(eq(activityEvents.noteId, data.id)),
    ).toHaveLength(1);
    expect(
      (await patchNote(request("PATCH", { body: "hacked" }, bob), idParams(data.id))).status,
    ).toBe(404);
    expect((await deleteNote(request("DELETE", undefined, bob), idParams(data.id))).status).toBe(
      404,
    );
    expect(
      (await patchNote(request("PATCH", { visibility: "public" }), idParams(data.id))).status,
    ).toBe(200);
    expect(
      (await db.select().from(activityEvents).where(eq(activityEvents.noteId, data.id)))[0]
        .visibility,
    ).toBe("public");
    expect((await deleteNote(request("DELETE"), idParams(data.id))).status).toBe(200);
    expect((await deleteNote(request("DELETE"), idParams(data.id))).status).toBe(200);
    expect(
      await db.select().from(activityEvents).where(eq(activityEvents.noteId, data.id)),
    ).toHaveLength(0);
    expect(await (await createNote(request("POST", input), params())).json()).toMatchObject({
      error: "resource_deleted",
    });
  });

  it("rolls note and reservation back if its transactional activity event cannot be saved", async () => {
    const input = noteInput();
    await db.execute(
      sql`CREATE FUNCTION metadata_reject_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected event failure'; END $$`,
    );
    await db.execute(
      sql`CREATE TRIGGER metadata_event_failure BEFORE INSERT ON activity_events FOR EACH ROW EXECUTE FUNCTION metadata_reject_event()`,
    );
    try {
      expect((await createNote(request("POST", input), params())).status).toBe(500);
      expect(await db.select().from(placeNotes)).toHaveLength(0);
      expect(
        await db.select().from(apiRequests).where(eq(apiRequests.requestId, input.requestId)),
      ).toHaveLength(0);
    } finally {
      await db.execute(sql`DROP TRIGGER metadata_event_failure ON activity_events`);
      await db.execute(sql`DROP FUNCTION metadata_reject_event()`);
    }
    expect((await createNote(request("POST", input), params())).status).toBe(201);
  });

  it("rechecks note/tag visibility and never publishes the existing preference tip", async () => {
    const ids = [];
    for (const visibility of ["private", "friends", "public"])
      ids.push(
        (
          await (
            await createNote(request("POST", { ...noteInput(visibility), visibility }), params())
          ).json()
        ).data.id,
      );
    await putTags(request("PUT", { tags: ["scenic"], visibility: "friends" }), params());
    expect(
      (await (await notes(request("GET", undefined, bob), params())).json()).data,
    ).toHaveLength(2);
    expect(
      (await (await notes(request("GET", undefined, eve), params())).json()).data,
    ).toHaveLength(1);
    expect((await (await tags(request("GET", undefined, bob), params())).json()).data).toEqual({
      tags: ["scenic"],
      myTags: [],
    });
    await db.delete(friendships);
    expect(
      (await (await notes(request("GET", undefined, bob), params())).json()).data,
    ).toHaveLength(1);
    expect((await (await tags(request("GET", undefined, bob), params())).json()).data.tags).toEqual(
      [],
    );
    const preference = await oldPreference(
      request("PUT", { tip: "Keep this private", favorite: true }),
      { params: Promise.resolve({ placeId: publicId }) },
    );
    expect(preference.status).toBe(200);
    expect(await db.select().from(placeNotes)).toHaveLength(3);
    await db.update(placeNotes).set({ legacyTip: true }).where(eq(placeNotes.id, ids[0]));
    expect(
      (await patchNote(request("PATCH", { visibility: "friends" }), idParams(ids[0]))).status,
    ).toBe(400);
  });

  it("replaces only the actor's tags idempotently and stores typed corrections without modifying the place", async () => {
    for (let i = 0; i < 2; i++)
      expect(
        (
          await putTags(
            request("PUT", { tags: ["quiet", "scenic"], visibility: "public" }),
            params(),
          )
        ).status,
      ).toBe(200);
    await putTags(request("PUT", { tags: ["my-tag"] }, bob), params());
    await putTags(request("PUT", { tags: ["new-tag"] }), params());
    expect(await db.select().from(placeTags)).toHaveLength(2);
    expect((await (await tags(request("GET", undefined, bob), params())).json()).data).toEqual({
      tags: ["my-tag"],
      myTags: ["my-tag"],
    });
    for (const correction of [
      { field: "name", value: "Suggested name" },
      { field: "website", value: null },
      { field: "hours", value: { text: "Ask at entrance" } },
      { field: "coords", value: { lat: 12, lng: 13 } },
      { field: "closed", value: true },
    ]) {
      const input = { requestId: randomUUID(), ...correction };
      expect((await suggest(request("POST", input), params())).status).toBe(201);
      expect((await suggest(request("POST", input), params())).status).toBe(200);
      expect(
        (await suggest(request("POST", { ...input, field: "closed", value: false }), params()))
          .status,
      ).toBe(409);
    }
    expect(await db.select().from(placeSuggestions)).toHaveLength(5);
    expect((await db.select().from(places).where(eq(places.id, publicId)))[0].name).toBe(
      "A Public Place",
    );
  });
});

describe("consented gallery derivatives", () => {
  it("revokes derivative metadata atomically with edition deletion and queues cleanup", async () => {
    const input = promotion();
    await promote(request("POST", input), params());
    await expect(
      db.transaction(async (tx) => {
        await lockUser(tx, alice);
        await revokeEditionPlaceImages(tx, alice, captureId);
        throw new Error("Injected deletion rollback");
      }),
    ).rejects.toThrow("Injected deletion rollback");
    expect(await db.select().from(placeImages)).toHaveLength(1);
    await db.transaction(async (tx) => {
      await lockUser(tx, alice);
      await revokeEditionPlaceImages(tx, alice, captureId);
      await tx.delete(editions).where(eq(editions.id, captureId));
    });
    expect(await db.select().from(placeImages)).toHaveLength(0);
    expect(await cleanupPlaceImageObjects(storage, new Date(Date.now() + 1000))).toBe(1);
    expect(await cleanupPlaceImageObjects(storage, new Date(Date.now() + 1000))).toBe(0);
  });

  it("requires both consent flags, owned capture and matching public place", async () => {
    for (const extra of [
      { confirmPublic: false },
      { rightsConfirmed: false },
      { userId: bob },
      { url: "http://private.test" },
    ]) {
      expect((await promote(request("POST", { ...promotion(), ...extra }), params())).status).toBe(
        400,
      );
    }
    expect((await promote(request("POST", promotion(), bob), params())).status).toBe(404);
    expect((await promote(request("POST", promotion()), params("private-place"))).status).toBe(403);
    await db.update(places).set({ visibility: "public" }).where(eq(places.id, privateId));
    expect((await promote(request("POST", promotion()), params("private-place"))).status).toBe(404);
    expect(storage.promote).not.toHaveBeenCalled();
  });

  it("promotes a separate licensed derivative, collapses retries, and preserves the original capture", async () => {
    const input = promotion();
    const results = await Promise.all(
      Array.from({ length: 4 }, () => promote(request("POST", input), params())),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 200, 200, 201]);
    expect(storage.promote).toHaveBeenCalledTimes(1);
    expect(storage.promote).toHaveBeenCalledWith(
      expect.objectContaining({ userId: alice }),
      originalPath,
      captureRequest,
      `place-images/${alice}/${input.requestId}.webp`,
    );
    const { data } = await results[0].json();
    expect(data).toMatchObject({ provider: "user", license: "CC-BY-4.0", attribution: "Alice" });
    expect(data).not.toHaveProperty("storagePath");
    expect(JSON.stringify(data)).not.toContain(originalPath);
    expect((await db.select().from(editions).where(eq(editions.id, captureId)))[0].photoPath).toBe(
      originalPath,
    );
    expect(
      (await promote(request("POST", { ...input, attribution: "Changed" }), params())).status,
    ).toBe(409);
  });

  it("retains durable cleanup intents for failed uploads/DB inserts and safely retries", async () => {
    const input = promotion();
    storage.promote.mockRejectedValueOnce(new ApiError(503, "service_unavailable", "Try again"));
    expect((await promote(request("POST", input), params())).status).toBe(503);
    expect(await db.select().from(placeImages)).toHaveLength(0);
    expect(
      await db.select().from(apiRequests).where(eq(apiRequests.requestId, input.requestId)),
    ).toHaveLength(1);
    storage.promote.mockResolvedValueOnce({
      url: "https://images.test/copy",
      width: -1,
      height: 1,
    });
    expect((await promote(request("POST", input), params())).status).toBe(500);
    expect(await db.select().from(placeImages)).toHaveLength(0);
    storage.remove.mockRejectedValueOnce(new ApiError(503, "service_unavailable", "Try again"));
    await expect(
      cleanupPlaceImageObjects(storage, new Date(Date.now() + 1000)),
    ).rejects.toMatchObject({ status: 503 });
    expect(await cleanupPlaceImageObjects(storage, new Date(Date.now() + 1000))).toBe(1);
    expect(await cleanupPlaceImageObjects(storage, new Date(Date.now() + 1000))).toBe(0);
    expect((await promote(request("POST", input), params())).status).toBe(201);
    expect(await cleanupPlaceImageObjects(storage, new Date(Date.now() + 1000))).toBe(0);
  });

  it("deletes only owned derivatives, hides metadata before storage cleanup, and retains replay tombstones", async () => {
    const input = promotion();
    const { data } = await (await promote(request("POST", input), params())).json();
    expect((await deleteImage(request("DELETE", undefined, bob), idParams(data.id))).status).toBe(
      404,
    );
    storage.remove.mockRejectedValueOnce(new ApiError(503, "service_unavailable", "Try again"));
    expect((await deleteImage(request("DELETE"), idParams(data.id))).status).toBe(503);
    expect((await (await images(request(), params())).json()).data).toEqual([]);
    expect((await deleteImage(request("DELETE"), idParams(data.id))).status).toBe(200);
    expect((await deleteImage(request("DELETE"), idParams(data.id))).status).toBe(200);
    expect(await (await promote(request("POST", input), params())).json()).toMatchObject({
      error: "resource_deleted",
    });
    expect(storage.remove).toHaveBeenCalledWith(`place-images/${alice}/${input.requestId}.webp`);
    expect(
      await db
        .select()
        .from(editions)
        .where(and(eq(editions.id, captureId), eq(editions.photoPath, originalPath))),
    ).toHaveLength(1);
  });
});

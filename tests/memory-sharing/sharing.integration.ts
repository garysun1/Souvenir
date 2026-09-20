import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, db } from "@/lib/db";
import {
  editions,
  friendships,
  importBatches,
  importItems,
  memoryMoments,
  momentPersonTags,
  outings,
  places,
  tasteProfiles,
  tripAlbumMembers,
  users,
} from "@/lib/db/schema";
import {
  createMemoryAlbum,
  deleteMemoryAlbum,
  getMemoryAlbum,
  getMemoryAlbumInvitations,
  getMemoryAlbumMembers,
  getMemoryAlbums,
  inviteMemoryAlbumMember,
  respondMemoryAlbumMember,
  updateMemoryAlbum,
} from "@/lib/server/memory-sharing-albums";
import {
  createMemoryMoment,
  deleteMemoryMoment,
  getMemoryAlbumMoments,
  getMemoryMoment,
  getMemoryMoments,
  updateMemoryMoment,
} from "@/lib/server/memory-sharing-moments";
import {
  createMemoryTag,
  getMemoryTagInvitations,
  getMemoryTags,
  respondMemoryTag,
} from "@/lib/server/memory-sharing-tags";
import { getMemoryPhoto } from "@/lib/server/memory-sharing-media";
import { getEditionPhoto } from "@/lib/server/editions";
import * as albumsRoute from "@/app/api/albums/route";
import * as albumRoute from "@/app/api/albums/[albumId]/route";
import * as membersRoute from "@/app/api/albums/[albumId]/members/route";
import * as memberRoute from "@/app/api/albums/[albumId]/members/[memberId]/route";
import * as albumMomentsRoute from "@/app/api/albums/[albumId]/moments/route";
import * as albumInvitationsRoute from "@/app/api/album-invitations/route";
import * as momentsRoute from "@/app/api/moments/route";
import * as momentRoute from "@/app/api/moments/[momentId]/route";
import * as photoRoute from "@/app/api/moments/[momentId]/photo/route";
import * as tagsRoute from "@/app/api/moments/[momentId]/tags/route";
import * as tagRoute from "@/app/api/moments/[momentId]/tags/[tagId]/route";
import * as tagInvitationsRoute from "@/app/api/moment-tag-invitations/route";
import type { AuthContext, PlanContent } from "../../shared/api-contract";
import type {
  ConfirmedMemoryStop,
  MemoryMomentCreate,
  MemoryMomentDto,
  TripAlbumDto,
} from "../../shared/memories-contract";

const storage = vi.hoisted(() => ({
  sign: vi.fn(async () => ({
    data: { signedUrl: "https://storage.example.test/synthetic-signed-photo" },
    error: null as null | { message: string },
  })),
  from: vi.fn(),
}));

const sessions = vi.hoisted(() => ({
  cookieUserId: null as string | null,
  tokens: new Map<string, string>(),
  user: (id: string | null) =>
    id ? { id, user_metadata: { display_name: "Verified account" }, is_anonymous: false } : null,
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      getUser: async (token: string) => ({
        data: { user: sessions.user(sessions.tokens.get(token) ?? null) },
        error: null,
      }),
    },
    storage: {
      from: (bucket: string) => {
        storage.from(bucket);
        return { createSignedUrl: storage.sign };
      },
    },
  }),
}));
vi.mock("next/headers", () => ({
  cookies: () => {
    const id = sessions.cookieUserId;
    return {
      getAll: () => (id ? [{ name: "session", value: id }] : []),
      set: vi.fn(),
    };
  },
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: (
    _url: string,
    _key: string,
    options: { cookies: { getAll: () => { name: string; value: string }[] } },
  ) => ({
    auth: {
      getUser: async () => ({
        data: { user: sessions.user(options.cookies.getAll()[0]?.value ?? null) },
        error: null,
      }),
    },
  }),
}));

const [owner, friend, outsider, secondFriend] = Array.from({ length: 4 }, () => randomUUID());
const placeId = randomUUID();
const page = { limit: 25 };
const stop: ConfirmedMemoryStop = {
  placeId,
  capturedAt: "2026-09-19T01:30:00.000Z",
  timezone: "America/Los_Angeles",
};
const auth = (userId: string): AuthContext => ({ userId, mode: "bearer", email: null });

async function edition(userId = owner) {
  const requestId = randomUUID();
  const [count] = await db.execute<{ count: number }>(
    sql`select count(*)::int as count from editions where user_id = ${userId}::uuid`,
  );
  const [row] = await db
    .insert(editions)
    .values({
      userId,
      placeId,
      requestId,
      photoPath: `${userId}/${requestId}.jpg`,
      visitSequence: count.count + 1,
      capturedAt: new Date(stop.capturedAt),
      timezone: stop.timezone,
      note: "Private original note",
      companions: ["Private legacy companion"],
    })
    .returning();
  return row;
}

async function album(userId = owner) {
  return (await createMemoryAlbum(userId, { requestId: randomUUID(), title: "Weekend" })).data;
}

async function moment(userId = owner, targetAlbum?: TripAlbumDto) {
  const source = await edition(userId);
  const input: MemoryMomentCreate = {
    requestId: randomUUID(),
    source: { kind: "edition", id: source.id },
    target: targetAlbum
      ? { kind: "album", albumId: targetAlbum.id, confirmShare: true }
      : { kind: "private" },
    note: "Explicitly shared note",
    groupKey: "evening-gardens",
  };
  return { data: (await createMemoryMoment(userId, input)).data, source, input };
}

async function join(target: TripAlbumDto, userId = friend) {
  const invited = await inviteMemoryAlbumMember(owner, target.id, {
    requestId: randomUUID(),
    userId,
  });
  return respondMemoryAlbumMember(userId, target.id, invited.data.id, {
    expectedVersion: invited.data.version,
    state: "accepted",
  });
}

async function tag(target: MemoryMomentDto, userId = friend) {
  return (
    await createMemoryTag(target.authorId, target.id, {
      requestId: randomUUID(),
      userId,
      confirmShare: true,
    })
  ).data;
}

async function importItem(
  userId = owner,
  state: "uploaded" | "pending_upload" | "ready" = "uploaded",
) {
  const [batch] = await db
    .insert(importBatches)
    .values({ ownerId: userId, requestId: randomUUID(), title: "Selected photos" })
    .returning();
  const requestId = randomUUID();
  const [item] = await db
    .insert(importItems)
    .values({
      ownerId: userId,
      batchId: batch.id,
      requestId,
      sha256: randomUUID().replaceAll("-", "").repeat(2),
      fileName: "synthetic.jpg",
      contentType: "image/jpeg",
      sizeBytes: 1234,
      photoPath: `${userId}/${requestId}.jpg`,
      state,
      metadata: {
        capturedAt: null,
        timezone: null,
        latitude: null,
        longitude: null,
        accuracyM: null,
        origin: "unknown",
      },
    })
    .returning();
  return { batch, item };
}

function request(
  path: string,
  method = "GET",
  body?: unknown,
  userId: string | null = owner,
  mode = "bearer",
) {
  sessions.cookieUserId = mode === "cookie" ? userId : null;
  const token = `${userId}.synthetic.signature`;
  if (userId) sessions.tokens.set(token, userId);
  return new Request(`https://souvenir.test/api${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      origin: "https://souvenir.test",
      ...(userId
        ? mode === "cookie"
          ? { cookie: `session=${userId}` }
          : { authorization: `Bearer ${token}` }
        : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

beforeEach(async () => {
  vi.clearAllMocks();
  sessions.cookieUserId = null;
  sessions.tokens.clear();
  await db.execute(sql`TRUNCATE users, places CASCADE`);
  await db.insert(users).values(
    [owner, friend, outsider, secondFriend].map((id, i) => ({
      id,
      handle: `person${i}`,
      displayName: `Person ${i}`,
    })),
  );
  await db.insert(places).values({
    id: placeId,
    slug: "synthetic-garden",
    name: "Synthetic Garden",
    category: "nature",
    lat: 0,
    lng: 0,
    description: "Synthetic fixture",
    rarityTier: "common",
    rarityAppeal: 50,
    rarityDiscoveryFreq: 50,
    rarityAvailability: 50,
    visibility: "public",
  });
  await db.insert(friendships).values([
    { userId: friend, friendId: owner, status: "accepted" },
    { userId: owner, friendId: secondFriend, status: "accepted" },
  ]);
});
afterAll(closeDb);

describe("album invitations and per-author contributions", () => {
  it("limits pending invitations to title/owner and isolates an unrelated third user", async () => {
    const a = await album();
    const m = await moment(owner, a);
    const invite = await inviteMemoryAlbumMember(owner, a.id, {
      requestId: randomUUID(),
      userId: friend,
    });
    const invitations = await getMemoryAlbumInvitations(friend, page);
    expect(invitations.items).toEqual([
      { membership: invite.data, albumTitle: "Weekend", ownerId: owner },
    ]);
    for (const user of [friend, outsider]) {
      await expect(getMemoryAlbum(user, a.id)).rejects.toMatchObject({ status: 404 });
      await expect(getMemoryAlbumMembers(user, a.id, page)).rejects.toMatchObject({ status: 404 });
      await expect(getMemoryAlbumMoments(user, a.id, page)).rejects.toMatchObject({ status: 404 });
      await expect(getMemoryMoment(user, m.data.id)).rejects.toMatchObject({ status: 404 });
      await expect(getMemoryPhoto(user, m.data.id)).rejects.toMatchObject({ status: 404 });
      expect((await getMemoryAlbums(user, page)).items).toEqual([]);
    }
    expect(storage.sign).not.toHaveBeenCalled();
    await expect(
      respondMemoryAlbumMember(owner, a.id, invite.data.id, {
        expectedVersion: 1,
        state: "accepted",
      }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      respondMemoryAlbumMember(outsider, a.id, invite.data.id, {
        expectedVersion: 1,
        state: "accepted",
      }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      inviteMemoryAlbumMember(owner, a.id, { requestId: randomUUID(), userId: outsider }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      inviteMemoryAlbumMember(owner, a.id, { requestId: randomUUID(), userId: owner }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("preserves authorship, prevents cross-member writes, and withdraws contributions on removal", async () => {
    const a = await album();
    const membership = await join(a);
    const own = await moment(owner, a);
    const contributed = await moment(friend, a);
    expect((await getMemoryAlbumMoments(owner, a.id, page)).items).toHaveLength(2);
    expect((await getMemoryMoments(owner, page)).items.map((m) => m.id)).toEqual([own.data.id]);
    expect((await getMemoryMoment(owner, contributed.data.id)).authorId).toBe(friend);
    for (const [actor, target] of [
      [owner, contributed.data.id],
      [friend, own.data.id],
    ]) {
      await expect(
        updateMemoryMoment(actor, target, { expectedVersion: 1, note: "forged" }),
      ).rejects.toMatchObject({ status: 404 });
      await expect(deleteMemoryMoment(actor, target, { expectedVersion: 1 })).rejects.toMatchObject(
        { status: 404 },
      );
    }
    await expect(
      updateMemoryAlbum(friend, a.id, { expectedVersion: 1, title: "forged" }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(deleteMemoryAlbum(friend, a.id, { expectedVersion: 1 })).rejects.toMatchObject({
      status: 404,
    });
    await expect(getEditionPhoto(auth(owner), contributed.source.id)).rejects.toMatchObject({
      status: 404,
    });
    const signed = await getMemoryPhoto(owner, contributed.data.id);
    expect(Object.keys(signed).sort()).toEqual(["expiresAt", "url"]);
    expect(Date.parse(signed.expiresAt) - Date.now()).toBeLessThanOrEqual(300_000);
    expect(storage.sign).toHaveBeenCalledWith(contributed.source.photoPath, 300);
    await respondMemoryAlbumMember(owner, a.id, membership.id, {
      expectedVersion: membership.version,
      state: "removed",
    });
    await expect(getMemoryMoment(owner, contributed.data.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(getMemoryPhoto(friend, own.data.id)).rejects.toMatchObject({ status: 404 });
    expect((await getMemoryAlbumMoments(owner, a.id, page)).items.map((m) => m.id)).toEqual([
      own.data.id,
    ]);
    expect((await getMemoryMoment(friend, contributed.data.id)).authorId).toBe(friend);
    await expect(moment(friend, a)).rejects.toMatchObject({ status: 404 });
    const rejoined = await join(a);
    expect(rejoined.version).toBe(membership.version + 3);
    expect((await getMemoryAlbumMoments(owner, a.id, page)).items).toHaveLength(2);
    const [editionCount] = await db.execute<{ n: number }>(
      sql`select count(*)::int n from editions where user_id = ${owner}::uuid`,
    );
    expect(editionCount.n).toBe(1);
  });

  it("deletes albums without deleting authors' media or independent explicit tags", async () => {
    const a = await album();
    await join(a);
    const contributed = await moment(friend, a);
    await tag(contributed.data, owner);
    const own = await moment(owner, a);
    await deleteMemoryAlbum(owner, a.id, { expectedVersion: 1 });
    expect((await getMemoryMoment(friend, contributed.data.id)).albumId).toBeNull();
    expect((await getMemoryMoment(owner, contributed.data.id)).albumId).toBeNull();
    await expect(getMemoryMoment(friend, own.data.id)).rejects.toMatchObject({ status: 404 });
    expect(await db.select().from(editions)).toHaveLength(2);
    expect(await db.select().from(tripAlbumMembers)).toHaveLength(0);
    expect(await db.select().from(memoryMoments)).toHaveLength(2);
    expect(storage.sign).not.toHaveBeenCalled();
  });

  it("keeps album membership independent of friendship and requires explicit re-invitation", async () => {
    const a = await album();
    const invited = await inviteMemoryAlbumMember(owner, a.id, {
      requestId: randomUUID(),
      userId: friend,
    });
    const declined = await respondMemoryAlbumMember(friend, a.id, invited.data.id, {
      expectedVersion: 1,
      state: "declined",
    });
    await expect(
      respondMemoryAlbumMember(friend, a.id, invited.data.id, {
        expectedVersion: declined.version,
        state: "accepted",
      }),
    ).rejects.toMatchObject({ status: 409 });
    await join(a);
    await db.delete(friendships);
    const m = await moment(owner, a);
    expect((await getMemoryMoment(friend, m.data.id)).id).toBe(m.data.id);
    expect((await getMemoryAlbums(friend, page)).items).toHaveLength(1);
    await getMemoryPhoto(friend, m.data.id);
  });
});

describe("account tags and scoped photo reads", () => {
  it("requires an accepted friendship, not just a pending relationship row", async () => {
    await db.insert(friendships).values({ userId: owner, friendId: outsider, status: "pending" });
    const a = await album();
    const m = await moment(owner, a);
    await expect(
      inviteMemoryAlbumMember(owner, a.id, { requestId: randomUUID(), userId: outsider }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(tag(m.data, outsider)).rejects.toMatchObject({ status: 404 });
    await db.insert(tasteProfiles).values({
      userId: owner,
      sharing: "friends",
      published: {
        title: null,
        facets: [],
        collageMomentIds: [m.data.id],
        publishedAt: new Date().toISOString(),
      },
    });
    await expect(getMemoryPhoto(outsider, m.data.id)).rejects.toMatchObject({ status: 404 });
    expect(storage.sign).not.toHaveBeenCalled();
    await db
      .update(friendships)
      .set({ status: "accepted" })
      .where(eq(friendships.friendId, outsider));
    await tag(m.data, outsider);
    await getMemoryPhoto(outsider, m.data.id);
  });

  it("grants only the selected pending moment and own tag, never an album or source edition", async () => {
    const a = await album();
    const m = await moment(owner, a);
    const other = await moment(owner, a);
    const invitation = await tag(m.data);
    await tag(m.data, secondFriend);
    expect((await getMemoryMoment(friend, m.data.id)).id).toBe(m.data.id);
    await getMemoryPhoto(friend, m.data.id);
    expect((await getMemoryTags(friend, m.data.id, page)).items).toEqual([invitation]);
    expect((await getMemoryTags(owner, m.data.id, page)).items).toHaveLength(2);
    expect((await getMemoryTagInvitations(friend, page)).items).toEqual([
      { tag: invitation, moment: m.data },
    ]);
    expect((await getMemoryAlbumInvitations(friend, page)).items).toEqual([]);
    expect((await getMemoryMoments(friend, page)).items).toEqual([]);
    await expect(getMemoryAlbum(friend, a.id)).rejects.toMatchObject({ status: 404 });
    await expect(getMemoryMoment(friend, other.data.id)).rejects.toMatchObject({ status: 404 });
    await expect(getMemoryPhoto(outsider, m.data.id)).rejects.toMatchObject({ status: 404 });
    await expect(getEditionPhoto(auth(friend), m.source.id)).rejects.toMatchObject({ status: 404 });
    await expect(
      createMemoryTag(friend, m.data.id, {
        requestId: randomUUID(),
        userId: outsider,
        confirmShare: true,
      }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      respondMemoryTag(owner, m.data.id, invitation.id, { expectedVersion: 1, state: "accepted" }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      respondMemoryTag(outsider, m.data.id, invitation.id, {
        expectedVersion: 1,
        state: "removed",
      }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      respondMemoryTag(friend, other.data.id, invitation.id, {
        expectedVersion: 1,
        state: "accepted",
      }),
    ).rejects.toMatchObject({ status: 404 });
    expect(JSON.stringify(m.data)).not.toContain("Private original");
    expect(JSON.stringify(m.data)).not.toContain("photoPath");
  });

  it("revokes declined, removed, unfriended and withdrawn moment photo grants", async () => {
    const m = await moment();
    const invitation = await tag(m.data);
    const declined = await respondMemoryTag(friend, m.data.id, invitation.id, {
      expectedVersion: 1,
      state: "declined",
    });
    await expect(getMemoryPhoto(friend, m.data.id)).rejects.toMatchObject({ status: 404 });
    await expect(
      respondMemoryTag(friend, m.data.id, invitation.id, {
        expectedVersion: declined.version,
        state: "accepted",
      }),
    ).rejects.toMatchObject({ status: 404 });
    const reinvite = await tag(m.data);
    const accepted = await respondMemoryTag(friend, m.data.id, reinvite.id, {
      expectedVersion: reinvite.version,
      state: "accepted",
    });
    await getMemoryPhoto(friend, m.data.id);
    const removed = await respondMemoryTag(friend, m.data.id, accepted.id, {
      expectedVersion: accepted.version,
      state: "removed",
    });
    await expect(getMemoryPhoto(friend, m.data.id)).rejects.toMatchObject({ status: 404 });
    const again = await tag(m.data);
    expect(again.version).toBe(removed.version + 1);
    await db.delete(friendships);
    await expect(getMemoryPhoto(friend, m.data.id)).rejects.toMatchObject({ status: 404 });
    expect((await getMemoryTagInvitations(friend, page)).items).toEqual([]);
    await deleteMemoryMoment(owner, m.data.id, { expectedVersion: 1 });
    await expect(getMemoryPhoto(owner, m.data.id)).rejects.toMatchObject({ status: 404 });
    expect(await db.select().from(editions)).toHaveLength(1);
    expect(storage.sign).toHaveBeenCalledTimes(1);
  });

  it("honors only published collage IDs and accepted friendship, revoking on unpublish", async () => {
    const m = await moment();
    const privateMoment = await moment();
    await db.insert(tasteProfiles).values({
      userId: owner,
      sharing: "friends",
      collageMomentIds: [privateMoment.data.id],
      published: {
        title: null,
        facets: [],
        collageMomentIds: [m.data.id],
        publishedAt: new Date().toISOString(),
      },
    });
    await getMemoryPhoto(friend, m.data.id);
    await expect(getMemoryPhoto(friend, privateMoment.data.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(getMemoryPhoto(outsider, m.data.id)).rejects.toMatchObject({ status: 404 });
    await db
      .update(tasteProfiles)
      .set({ sharing: "private" })
      .where(eq(tasteProfiles.userId, owner));
    await expect(getMemoryPhoto(friend, m.data.id)).rejects.toMatchObject({ status: 404 });
    await db
      .update(tasteProfiles)
      .set({ sharing: "friends" })
      .where(eq(tasteProfiles.userId, owner));
    await db.delete(friendships);
    await expect(getMemoryPhoto(friend, m.data.id)).rejects.toMatchObject({ status: 404 });
  });

  it("never signs forged paths, a different upload identity, or an external photo URL", async () => {
    const m = await moment();
    await tag(m.data);
    for (const path of [
      `${outsider}/${m.source.requestId}.jpg`,
      `${owner}/${randomUUID()}.jpg`,
      `${owner}/../${m.source.requestId}.jpg`,
      `https://evil.test/photo.jpg`,
      `${owner}/${m.source.requestId}.jpg?other`,
      null,
    ]) {
      await db
        .update(editions)
        .set({ photoPath: path, photoUrl: "https://evil.test/photo.jpg" })
        .where(eq(editions.id, m.source.id));
      await expect(getMemoryPhoto(friend, m.data.id)).rejects.toMatchObject({ status: 404 });
    }
    expect(storage.sign).not.toHaveBeenCalled();
  });
});

describe("sources, associations, replay and concurrency", () => {
  it("rejects foreign sources and incomplete imports; preserves confirmed edition stops", async () => {
    const foreign = await edition(friend);
    await expect(
      createMemoryMoment(owner, {
        requestId: randomUUID(),
        source: { kind: "edition", id: foreign.id },
        target: { kind: "private" },
      }),
    ).rejects.toMatchObject({ status: 404 });
    const own = await edition();
    const base: MemoryMomentCreate = {
      requestId: randomUUID(),
      source: { kind: "edition", id: own.id },
      target: { kind: "private" },
    };
    await expect(
      createMemoryMoment(owner, {
        ...base,
        confirmedStop: { ...stop, capturedAt: "2026-09-20T12:00:00Z" },
      }),
    ).rejects.toMatchObject({ status: 400 });
    const saved = await createMemoryMoment(owner, base);
    expect(saved.data.confirmedStop).toEqual(stop);
    await expect(
      updateMemoryMoment(owner, saved.data.id, { expectedVersion: 1, confirmedStop: null }),
    ).rejects.toMatchObject({ status: 400 });
    const pending = await importItem(owner, "pending_upload");
    await expect(
      createMemoryMoment(owner, {
        requestId: randomUUID(),
        source: { kind: "import_item", id: pending.item.id },
        target: { kind: "private" },
      }),
    ).rejects.toMatchObject({ status: 404 });
    const imported = await importItem();
    const input: MemoryMomentCreate = {
      requestId: randomUUID(),
      source: { kind: "import_item", id: imported.item.id },
      target: { kind: "private" },
    };
    await expect(createMemoryMoment(friend, input)).rejects.toMatchObject({ status: 404 });
    const unresolved = await createMemoryMoment(owner, input);
    expect(unresolved.data.confirmedStop).toBeNull();
    const confirmed = await updateMemoryMoment(owner, unresolved.data.id, {
      expectedVersion: 1,
      confirmedStop: stop,
      groupKey: "day-one",
    });
    expect(confirmed.confirmedStop).toEqual(stop);
    await expect(
      createMemoryMoment(owner, { ...input, requestId: randomUUID() }),
    ).rejects.toMatchObject({ status: 409 });
    await tag(confirmed);
    await getMemoryPhoto(friend, confirmed.id);
    await db
      .update(importBatches)
      .set({ state: "cancelled" })
      .where(eq(importBatches.id, imported.batch.id));
    await expect(getMemoryPhoto(friend, confirmed.id)).rejects.toMatchObject({ status: 404 });
    expect((await getMemoryTagInvitations(friend, page)).items).toEqual([]);
    await db.delete(importBatches).where(eq(importBatches.id, imported.batch.id));
    await expect(getMemoryPhoto(friend, confirmed.id)).rejects.toMatchObject({ status: 404 });
  });

  it("validates album batch/outing associations without granting their source access", async () => {
    const imported = await importItem();
    const foreignBatch = await importItem(friend);
    await expect(
      createMemoryAlbum(owner, {
        requestId: randomUUID(),
        title: "forged",
        sourceBatchId: foreignBatch.batch.id,
      }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      createMemoryAlbum(owner, {
        requestId: randomUUID(),
        title: "forged",
        outingId: randomUUID(),
      }),
    ).rejects.toMatchObject({ status: 404 });
    const plan = {
      title: "Garden visit",
      constraints: {
        participantIds: [],
        date: "2026-09-19",
        startMinute: 0,
        endMinute: 120,
        budgetCents: 0,
        transport: "walk",
        interests: ["nature"],
        rain: false,
        excludedPlaceIds: [],
        preferredPlaceIds: [],
      },
      stops: [{ placeId, arrivalMinute: 0, departureMinute: 60, costCents: 0, travelMinutes: 0 }],
      totalCostCents: 0,
      totalMinutes: 60,
      checks: [],
      version: 1,
      provenance: "manual",
    } satisfies PlanContent;
    const [outing] = await db.insert(outings).values({ createdBy: outsider, plan }).returning();
    await expect(
      createMemoryAlbum(owner, { requestId: randomUUID(), title: "forged", outingId: outing.id }),
    ).rejects.toMatchObject({ status: 404 });
    const [ownedOuting] = await db.insert(outings).values({ createdBy: owner, plan }).returning();
    const a = (
      await createMemoryAlbum(owner, {
        requestId: randomUUID(),
        title: "Past trip",
        sourceBatchId: imported.batch.id,
        outingId: ownedOuting.id,
      })
    ).data;
    await join(a);
    expect((await getMemoryAlbum(friend, a.id)).sourceBatchId).toBe(imported.batch.id);
    expect((await getMemoryAlbum(friend, a.id)).outingId).toBe(ownedOuting.id);
    await expect(
      createMemoryMoment(friend, {
        requestId: randomUUID(),
        source: { kind: "import_item", id: imported.item.id },
        target: { kind: "album", albumId: a.id, confirmShare: true },
      }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("serializes concurrent creates and replays original results without reviving removed grants", async () => {
    const create = { requestId: randomUUID(), title: "Original title" };
    const saved = await Promise.all([
      createMemoryAlbum(owner, create),
      createMemoryAlbum(owner, create),
    ]);
    expect(new Set(saved.map((s) => s.data.id)).size).toBe(1);
    expect(saved.filter((s) => s.created)).toHaveLength(1);
    const a = saved[0].data;
    await updateMemoryAlbum(owner, a.id, { expectedVersion: 1, title: "Edited title" });
    expect((await createMemoryAlbum(owner, create)).data.title).toBe("Original title");
    await expect(
      createMemoryAlbum(owner, { ...create, title: "Changed payload" }),
    ).rejects.toMatchObject({ status: 409, code: "idempotency_conflict" });
    const invite = { requestId: randomUUID(), userId: friend };
    const invited = await Promise.all([
      inviteMemoryAlbumMember(owner, a.id, invite),
      inviteMemoryAlbumMember(owner, a.id, invite),
    ]);
    expect(invited[0].data.id).toBe(invited[1].data.id);
    const member = invited[0].data;
    const accepts = await Promise.allSettled([
      respondMemoryAlbumMember(friend, a.id, member.id, { expectedVersion: 1, state: "accepted" }),
      respondMemoryAlbumMember(friend, a.id, member.id, { expectedVersion: 1, state: "accepted" }),
    ]);
    expect(accepts.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(accepts.find((r) => r.status === "rejected")).toMatchObject({ reason: { status: 409 } });
    await respondMemoryAlbumMember(friend, a.id, member.id, {
      expectedVersion: 2,
      state: "removed",
    });
    expect((await inviteMemoryAlbumMember(owner, a.id, invite)).data).toEqual(member);
    await expect(getMemoryAlbum(friend, a.id)).rejects.toMatchObject({ status: 404 });
    const source = await edition();
    const momentInput: MemoryMomentCreate = {
      requestId: randomUUID(),
      source: { kind: "edition", id: source.id },
      target: { kind: "private" },
    };
    const moments = await Promise.all([
      createMemoryMoment(owner, momentInput),
      createMemoryMoment(owner, momentInput),
    ]);
    expect(moments[0].data.id).toBe(moments[1].data.id);
    expect(moments.filter((result) => result.created)).toHaveLength(1);
    const m = { data: moments[0].data, input: momentInput };
    await expect(
      createMemoryMoment(owner, { ...momentInput, note: "Changed payload" }),
    ).rejects.toMatchObject({ status: 409, code: "idempotency_conflict" });
    const tagInput = { requestId: randomUUID(), userId: friend, confirmShare: true as const };
    const tags = await Promise.all([
      createMemoryTag(owner, m.data.id, tagInput),
      createMemoryTag(owner, m.data.id, tagInput),
    ]);
    expect(tags[0].data.id).toBe(tags[1].data.id);
    const tagAccepts = await Promise.allSettled([
      respondMemoryTag(friend, m.data.id, tags[0].data.id, {
        expectedVersion: 1,
        state: "accepted",
      }),
      respondMemoryTag(friend, m.data.id, tags[0].data.id, {
        expectedVersion: 1,
        state: "accepted",
      }),
    ]);
    expect(tagAccepts.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(tagAccepts.find((r) => r.status === "rejected")).toMatchObject({
      reason: { status: 409 },
    });
    await respondMemoryTag(friend, m.data.id, tags[0].data.id, {
      expectedVersion: 2,
      state: "removed",
    });
    expect((await createMemoryTag(owner, m.data.id, tagInput)).data.state).toBe("pending");
    await expect(getMemoryPhoto(friend, m.data.id)).rejects.toMatchObject({ status: 404 });
    await expect(
      createMemoryTag(owner, m.data.id, { ...tagInput, userId: secondFriend }),
    ).rejects.toMatchObject({ status: 409, code: "idempotency_conflict" });
    await deleteMemoryMoment(owner, m.data.id, { expectedVersion: 1 });
    await expect(createMemoryMoment(owner, m.input)).rejects.toMatchObject({ status: 404 });
    expect(await db.select().from(momentPersonTags)).toHaveLength(1);
  });

  it("applies optimistic versions to edits/deletes and pages only authorized UUIDs", async () => {
    const albums = await Promise.all([album(), album(), album()]);
    await album(outsider);
    const first = await getMemoryAlbums(owner, { limit: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toBe(first.items[1].id);
    const next = await getMemoryAlbums(owner, { limit: 2, cursor: first.nextCursor! });
    expect(next.items).toHaveLength(1);
    expect(next.nextCursor).toBeNull();
    expect([...first.items, ...next.items].map((a) => a.id)).toEqual(
      albums.map((a) => a.id).sort(),
    );
    const m = await moment();
    const edits = await Promise.allSettled([
      updateMemoryMoment(owner, m.data.id, { expectedVersion: 1, note: "A" }),
      updateMemoryMoment(owner, m.data.id, { expectedVersion: 1, note: "B" }),
    ]);
    expect(edits.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    await expect(
      deleteMemoryMoment(owner, m.data.id, { expectedVersion: 1 }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      deleteMemoryAlbum(owner, albums[0].id, { expectedVersion: 9 }),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe("authenticated contract routes", () => {
  it.each(["cookie", "bearer"])("bootstraps a verified %s account before writes", async (mode) => {
    const newUser = randomUUID();
    const res = await albumsRoute.POST(
      request("/albums", "POST", { requestId: randomUUID(), title: "First trip" }, newUser, mode),
    );
    expect(res.status).toBe(201);
    expect((await res.json()).data.ownerId).toBe(newUser);
    const [profile] = await db.select().from(users).where(eq(users.id, newUser));
    expect(profile.displayName).toBe("Verified account");
  });

  it("rejects an unverified bearer without cookie fallback and blocks cross-origin cookie writes", async () => {
    const input = { requestId: randomUUID(), title: "Forbidden" };
    const forged = request("/albums", "POST", input, owner, "cookie");
    forged.headers.set("authorization", `Bearer ${outsider}.unverified.signature`);
    const unverified = await albumsRoute.POST(forged);
    expect(unverified.status).toBe(401);
    const crossOrigin = request("/albums", "POST", input, owner, "cookie");
    crossOrigin.headers.set("origin", "https://unrelated.test");
    const blocked = await albumsRoute.POST(crossOrigin);
    expect(blocked.status).toBe(403);
    expect((await getMemoryAlbums(owner, page)).items).toEqual([]);
  });

  it.each(["cookie", "bearer"])(
    "runs creation, invitation, contribution and withdrawal using %s envelopes",
    async (mode) => {
      const res = await albumsRoute.POST(
        request("/albums", "POST", { requestId: randomUUID(), title: "API album" }, owner, mode),
      );
      expect(res.status).toBe(201);
      expect(res.headers.get("cache-control")).toBe("private, no-store");
      const a = (await res.json()).data as TripAlbumDto;
      const context = { params: Promise.resolve({ albumId: a.id }) };
      const invite = await membersRoute.POST(
        request(
          `/albums/${a.id}/members`,
          "POST",
          { requestId: randomUUID(), userId: friend },
          owner,
          mode,
        ),
        context,
      );
      const member = (await invite.json()).data;
      const accepted = await memberRoute.PATCH(
        request(
          `/albums/${a.id}/members/${member.id}`,
          "PATCH",
          { expectedVersion: 1, state: "accepted" },
          friend,
          mode,
        ),
        { params: Promise.resolve({ albumId: a.id, memberId: member.id }) },
      );
      expect(accepted.status).toBe(200);
      const source = await edition(friend);
      const saved = await momentsRoute.POST(
        request(
          "/moments",
          "POST",
          {
            requestId: randomUUID(),
            source: { kind: "edition", id: source.id },
            target: { kind: "album", albumId: a.id, confirmShare: true },
          },
          friend,
          mode,
        ),
      );
      expect(saved.status).toBe(201);
      const m = (await saved.json()).data as MemoryMomentDto;
      const momentContext = { params: Promise.resolve({ momentId: m.id }) };
      const signed = await photoRoute.GET(
        request(`/moments/${m.id}/photo`, "GET", undefined, owner, mode),
        momentContext,
      );
      expect(signed.status).toBe(200);
      expect(Object.keys((await signed.json()).data).sort()).toEqual(["expiresAt", "url"]);
      const withdrawn = await momentRoute.DELETE(
        request(`/moments/${m.id}`, "DELETE", { expectedVersion: 1 }, friend, mode),
        momentContext,
      );
      expect(await withdrawn.json()).toEqual({ data: { deleted: true } });
      const revoked = await photoRoute.GET(
        request(`/moments/${m.id}/photo`, "GET", undefined, owner, mode),
        momentContext,
      );
      expect(revoked.status).toBe(404);
      expect(revoked.headers.get("cache-control")).toBe("private, no-store");
    },
  );

  it("rejects unknown fields, forged ownership, missing share consent, duplicate queries and malformed IDs", async () => {
    const a = await album();
    const m = await moment();
    const responses = await Promise.all([
      albumsRoute.POST(
        request("/albums", "POST", { requestId: randomUUID(), title: "X", ownerId: outsider }),
      ),
      momentsRoute.POST(request("/moments", "POST", { ...m.input, authorId: outsider })),
      momentsRoute.POST(
        request("/moments", "POST", { ...m.input, photoPath: `${outsider}/forged.jpg` }),
      ),
      momentsRoute.POST(
        request("/moments", "POST", { ...m.input, target: { kind: "album", albumId: a.id } }),
      ),
      tagsRoute.POST(
        request(`/moments/${m.data.id}/tags`, "POST", { requestId: randomUUID(), userId: friend }),
        { params: Promise.resolve({ momentId: m.data.id }) },
      ),
      albumsRoute.GET(request("/albums?limit=1&limit=2")),
      momentsRoute.GET(request("/moments?limit=51")),
      albumsRoute.GET(request("/albums?ownerId=forged")),
      albumRoute.GET(request("/albums/not-uuid"), {
        params: Promise.resolve({ albumId: "not-uuid" }),
      }),
      momentRoute.GET(request("/moments/not-uuid"), {
        params: Promise.resolve({ momentId: "not-uuid" }),
      }),
      photoRoute.GET(request(`/moments/${m.data.id}/photo?path=forged`), {
        params: Promise.resolve({ momentId: m.data.id }),
      }),
      memberRoute.PATCH(request("/member", "PATCH", { expectedVersion: 1, state: "accepted" }), {
        params: Promise.resolve({ albumId: a.id, memberId: "invalid" }),
      }),
      tagRoute.PATCH(request("/tag", "PATCH", { expectedVersion: 1, state: "accepted" }), {
        params: Promise.resolve({ momentId: m.data.id, tagId: "invalid" }),
      }),
    ]);
    for (const response of responses) {
      expect(response.status).toBe(400);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
      expect((await response.json()).error).toBe("invalid_request");
    }
    expect(storage.sign).not.toHaveBeenCalled();
  });

  it("guards every route before private IDs and returns no-store for unauthenticated requests", async () => {
    const id = randomUUID();
    const albumContext = { params: Promise.resolve({ albumId: id }) };
    const momentContext = { params: Promise.resolve({ momentId: id }) };
    const unauth = (method = "GET") =>
      request("/test", method, method === "GET" ? undefined : {}, null);
    const results = await Promise.all([
      albumsRoute.GET(unauth()),
      albumsRoute.POST(unauth("POST")),
      albumRoute.GET(unauth(), albumContext),
      albumRoute.PATCH(unauth("PATCH"), albumContext),
      albumRoute.DELETE(unauth("DELETE"), albumContext),
      membersRoute.GET(unauth(), albumContext),
      membersRoute.POST(unauth("POST"), albumContext),
      memberRoute.PATCH(unauth("PATCH"), {
        params: Promise.resolve({ albumId: id, memberId: id }),
      }),
      albumMomentsRoute.GET(unauth(), albumContext),
      albumInvitationsRoute.GET(unauth()),
      momentsRoute.GET(unauth()),
      momentsRoute.POST(unauth("POST")),
      momentRoute.GET(unauth(), momentContext),
      momentRoute.PATCH(unauth("PATCH"), momentContext),
      momentRoute.DELETE(unauth("DELETE"), momentContext),
      photoRoute.GET(unauth(), momentContext),
      tagsRoute.GET(unauth(), momentContext),
      tagsRoute.POST(unauth("POST"), momentContext),
      tagRoute.PATCH(unauth("PATCH"), { params: Promise.resolve({ momentId: id, tagId: id }) }),
      tagInvitationsRoute.GET(unauth()),
    ]);
    for (const result of results) {
      expect(result.status).toBe(401);
      expect(await result.json()).toMatchObject({ error: "unauthorized" });
      expect(result.headers.get("cache-control")).toBe("private, no-store");
    }
  });

  it("does not expose backend or storage errors in envelopes", async () => {
    const m = await moment();
    storage.sign.mockResolvedValueOnce({
      data: { signedUrl: "" },
      error: { message: "secret-object-path" },
    });
    const result = await photoRoute.GET(request(`/moments/${m.data.id}/photo`), {
      params: Promise.resolve({ momentId: m.data.id }),
    });
    expect(result.status).toBe(503);
    expect(JSON.stringify(await result.json())).not.toContain("secret-object-path");
  });
});

import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  outingMembers,
  outings,
  users,
  wishlistMembers,
  wishlists,
  wishlistSaves,
} from "@/lib/db/schema";
import type { WishlistCreate, WishlistDto, WishlistItemPut } from "../../../shared/api-contract";
import { requireSocialPlaces } from "./social-access";
import { recomputeStats } from "./stats";
import { ApiError, invalidRequest, notFound } from "./errors";
import {
  completeRequest,
  deletedResource,
  lockUser,
  reserveRequest,
  type Created,
  type Database,
  type Transaction,
} from "./transactions";

export async function requireWishlist(
  database: Database,
  userId: string,
  id: string,
  lock = false,
) {
  const query = database.select().from(wishlists).where(eq(wishlists.id, id));
  const [list] = await (lock ? query.for("update") : query);
  if (!list) notFound("This list is unavailable.");
  const [member] = await database
    .select()
    .from(wishlistMembers)
    .where(and(eq(wishlistMembers.wishlistId, id), eq(wishlistMembers.userId, userId)));
  if (list.ownerId !== userId && (!list.isShared || !member)) notFound("This list is unavailable.");
  return list;
}

export async function ensureDefaultWishlist(tx: Transaction, userId: string): Promise<void> {
  await tx
    .insert(wishlists)
    .values({ ownerId: userId, name: "Want to go", isShared: false, isDefault: true })
    .onConflictDoNothing();
  const [list] = await tx
    .select()
    .from(wishlists)
    .where(and(eq(wishlists.ownerId, userId), eq(wishlists.isDefault, true)));
  await tx.insert(wishlistMembers).values({ wishlistId: list.id, userId }).onConflictDoNothing();
}

async function serializeWishlist(
  database: Database,
  list: typeof wishlists.$inferSelect,
): Promise<WishlistDto> {
  const members = await database
    .select({ userId: wishlistMembers.userId })
    .from(wishlistMembers)
    .where(eq(wishlistMembers.wishlistId, list.id))
    .orderBy(asc(wishlistMembers.userId));
  const saves = await database
    .select()
    .from(wishlistSaves)
    .innerJoin(
      wishlistMembers,
      and(
        eq(wishlistMembers.wishlistId, wishlistSaves.wishlistId),
        eq(wishlistMembers.userId, wishlistSaves.userId),
      ),
    )
    .where(eq(wishlistSaves.wishlistId, list.id))
    .orderBy(asc(wishlistSaves.createdAt), asc(wishlistSaves.userId));
  const entries = new Map<string, WishlistDto["entries"][number]>();
  for (const { wishlist_saves: save } of saves) {
    const entry = entries.get(save.placeId) ?? {
      placeId: save.placeId,
      saverIds: [],
      completedBy: [],
    };
    entry.saverIds.push(save.userId);
    if (save.completed) entry.completedBy.push(save.userId);
    entries.set(save.placeId, entry);
  }
  return {
    ...list,
    memberIds: members.map((member) => member.userId),
    entries: [...entries.values()],
  };
}

export async function getWishlist(
  userId: string,
  id: string,
  database: Database = db,
): Promise<WishlistDto> {
  return serializeWishlist(database, await requireWishlist(database, userId, id));
}

export async function getWishlists(
  userId: string,
  database: Database = db,
): Promise<WishlistDto[]> {
  const rows = await database
    .select({ list: wishlists })
    .from(wishlists)
    .innerJoin(wishlistMembers, eq(wishlistMembers.wishlistId, wishlists.id))
    .where(eq(wishlistMembers.userId, userId))
    .orderBy(asc(wishlists.name), asc(wishlists.id));
  return Promise.all(
    rows
      .filter(({ list }) => list.ownerId === userId || list.isShared)
      .map(({ list }) => serializeWishlist(database, list)),
  );
}

export async function createWishlist(
  userId: string,
  input: WishlistCreate,
): Promise<Created<WishlistDto>> {
  const normalized = { ...input, isShared: input.isShared ?? false };
  return db.transaction(async (tx) => {
    await lockUser(tx, userId);
    const request = await reserveRequest(
      tx,
      userId,
      input.requestId,
      "wishlist.create",
      normalized,
    );
    if (request.resourceId) {
      const [existing] = await tx
        .select()
        .from(wishlists)
        .where(and(eq(wishlists.id, request.resourceId), eq(wishlists.ownerId, userId)));
      if (!existing) deletedResource();
      return { data: await serializeWishlist(tx, existing), created: false };
    }
    const [list] = await tx
      .insert(wishlists)
      .values({
        ownerId: userId,
        name: input.name,
        isShared: normalized.isShared,
      })
      .returning();
    await tx.insert(wishlistMembers).values({ wishlistId: list.id, userId });
    await completeRequest(tx, userId, input.requestId, list.id);
    return { data: await serializeWishlist(tx, list), created: true };
  });
}

export async function putWishlistItem(
  userId: string,
  id: string,
  input: WishlistItemPut,
): Promise<WishlistDto> {
  return db.transaction(async (tx) => {
    await lockUser(tx, userId);
    const list = await requireWishlist(tx, userId, id, true);
    await requireSocialPlaces(userId, [input.placeId], tx);
    if (!input.saved) {
      if (input.completed) invalidRequest("An unsaved place cannot be completed.");
      await tx
        .delete(wishlistSaves)
        .where(
          and(
            eq(wishlistSaves.wishlistId, id),
            eq(wishlistSaves.placeId, input.placeId),
            eq(wishlistSaves.userId, userId),
          ),
        );
    } else {
      await tx
        .insert(wishlistSaves)
        .values({
          wishlistId: id,
          placeId: input.placeId,
          userId,
          completed: input.completed ?? false,
          visibility: input.visibility ?? "private",
        })
        .onConflictDoUpdate({
          target: [wishlistSaves.wishlistId, wishlistSaves.placeId, wishlistSaves.userId],
          set: { userId, completed: input.completed, visibility: input.visibility },
        });
    }
    await recomputeStats({ placeIds: [input.placeId], expandLocalities: false }, tx);
    return serializeWishlist(tx, list);
  });
}

function requireOwner(list: typeof wishlists.$inferSelect, userId: string): void {
  if (list.ownerId !== userId)
    throw new ApiError(403, "forbidden", "Only the list owner can change members.");
  if (!list.isShared || list.isDefault)
    invalidRequest("Create a shared list before inviting people.");
}

export async function addWishlistMember(
  userId: string,
  id: string,
  handle: string,
): Promise<WishlistDto> {
  return db.transaction(async (tx) => {
    await lockUser(tx, userId);
    const list = await requireWishlist(tx, userId, id, true);
    requireOwner(list, userId);
    const [member] = await tx.select({ id: users.id }).from(users).where(eq(users.handle, handle));
    if (!member) notFound("No profile has that handle.");
    await tx
      .insert(wishlistMembers)
      .values({ wishlistId: id, userId: member.id })
      .onConflictDoNothing();
    return serializeWishlist(tx, list);
  });
}

export async function removeWishlistMember(
  userId: string,
  id: string,
  memberId: string,
): Promise<WishlistDto> {
  return db.transaction(async (tx) => {
    await lockUser(tx, userId);
    const list = await requireWishlist(tx, userId, id, true);
    requireOwner(list, userId);
    if (memberId === list.ownerId) invalidRequest("The owner must remain a member.");
    const removed = await tx
      .delete(wishlistSaves)
      .where(and(eq(wishlistSaves.wishlistId, id), eq(wishlistSaves.userId, memberId)))
      .returning({ id: wishlistSaves.placeId });
    await tx
      .delete(wishlistMembers)
      .where(and(eq(wishlistMembers.wishlistId, id), eq(wishlistMembers.userId, memberId)));
    await tx
      .delete(outingMembers)
      .where(
        and(
          eq(outingMembers.userId, memberId),
          inArray(
            outingMembers.outingId,
            tx.select({ id: outings.id }).from(outings).where(eq(outings.wishlistId, id)),
          ),
        ),
      );
    await recomputeStats({ placeIds: removed.map((row) => row.id), expandLocalities: false }, tx);
    return serializeWishlist(tx, list);
  });
}

export async function getWishlistOverlap(
  userId: string,
  id: string,
): Promise<{ placeIds: string[] }> {
  const list = await getWishlist(userId, id);
  return {
    placeIds: list.entries
      .filter((entry) => list.memberIds.every((memberId) => entry.saverIds.includes(memberId)))
      .map((entry) => entry.placeId),
  };
}

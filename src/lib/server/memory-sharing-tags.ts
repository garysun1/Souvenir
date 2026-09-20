import "server-only";
import { and, asc, eq, gt, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { memoryMoments, momentPersonTags } from "@/lib/db/schema";
import type {
  InvitationRespond,
  MemoryPageQuery,
  MomentTagCreate,
  MomentTagDto,
  MomentTagInvitationDto,
} from "../../../shared/memories-contract";
import { ApiError, notFound } from "./errors";
import {
  availableMomentSource,
  memoryPage,
  momentAccess,
  momentDto,
  requireMemoryFriend,
  requireMemoryVersion,
  requireMoment,
  tagDto,
} from "./memory-sharing-access";
import { acceptedFriends } from "./social-access";
import { completeRequest, lockUser, reserveRequest, type Created } from "./transactions";

export async function createMemoryTag(
  userId: string,
  momentId: string,
  input: MomentTagCreate,
): Promise<Created<MomentTagDto>> {
  return db.transaction(async (tx) => {
    await lockUser(tx, userId);
    const request = await reserveRequest(tx, userId, input.requestId, "memory.tag.invite", {
      momentId,
      ...input,
    });
    await tx
      .select({ id: memoryMoments.id })
      .from(memoryMoments)
      .where(and(eq(memoryMoments.id, momentId), eq(memoryMoments.authorId, userId)))
      .for("update");
    await requireMoment(userId, momentId, tx, true);
    if (request.resourceId) {
      return { data: JSON.parse(request.resourcePath!) as MomentTagDto, created: false };
    }
    await requireMemoryFriend(tx, userId, input.userId);
    const [existing] = await tx
      .select()
      .from(momentPersonTags)
      .where(
        and(eq(momentPersonTags.momentId, momentId), eq(momentPersonTags.userId, input.userId)),
      )
      .for("update");
    if (existing && (existing.state === "pending" || existing.state === "accepted")) {
      const data = tagDto(existing);
      await completeRequest(tx, userId, input.requestId, existing.id, JSON.stringify(data));
      return { data, created: false };
    }
    const [row] = existing
      ? await tx
          .update(momentPersonTags)
          .set({
            state: "pending",
            requestId: input.requestId,
            version: existing.version + 1,
            updatedAt: new Date(),
          })
          .where(eq(momentPersonTags.id, existing.id))
          .returning()
      : await tx
          .insert(momentPersonTags)
          .values({ momentId, senderId: userId, userId: input.userId, requestId: input.requestId })
          .returning();
    const data = tagDto(row);
    await completeRequest(tx, userId, input.requestId, row.id, JSON.stringify(data));
    return { data, created: true };
  });
}

export async function respondMemoryTag(
  userId: string,
  momentId: string,
  tagId: string,
  input: InvitationRespond,
) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(momentPersonTags)
      .where(and(eq(momentPersonTags.id, tagId), eq(momentPersonTags.momentId, momentId)))
      .for("update");
    if (!row || (row.senderId !== userId && row.userId !== userId)) notFound();
    if (row.userId !== userId && input.state !== "removed") notFound();
    if (input.state !== "removed") await requireMoment(userId, momentId, tx);
    requireMemoryVersion(row.version, input.expectedVersion);
    if (
      (input.state !== "removed" && row.state !== "pending") ||
      (input.state === "removed" && row.state !== "pending" && row.state !== "accepted")
    ) {
      throw new ApiError(409, "conflict", "This tag is no longer pending or active.");
    }
    const [updated] = await tx
      .update(momentPersonTags)
      .set({ state: input.state, version: row.version + 1, updatedAt: new Date() })
      .where(and(eq(momentPersonTags.id, tagId), eq(momentPersonTags.version, row.version)))
      .returning();
    return tagDto(updated);
  });
}

export async function getMemoryTags(userId: string, momentId: string, query: MemoryPageQuery) {
  const moment = await requireMoment(userId, momentId);
  const rows = await db
    .select({ tag: momentPersonTags })
    .from(momentPersonTags)
    .innerJoin(memoryMoments, eq(memoryMoments.id, momentPersonTags.momentId))
    .where(
      and(
        eq(momentPersonTags.momentId, momentId),
        isNull(memoryMoments.withdrawnAt),
        availableMomentSource(),
        momentAccess(userId),
        moment.authorId !== userId ? eq(momentPersonTags.userId, userId) : undefined,
        query.cursor ? gt(momentPersonTags.id, query.cursor) : undefined,
      ),
    )
    .orderBy(asc(momentPersonTags.id))
    .limit(query.limit + 1);
  return memoryPage(
    rows.map((row) => tagDto(row.tag)),
    query.limit,
    (row) => row.id,
  );
}

export async function getMemoryTagInvitations(userId: string, query: MemoryPageQuery) {
  const rows = await db
    .select({ tag: momentPersonTags, moment: memoryMoments })
    .from(momentPersonTags)
    .innerJoin(memoryMoments, eq(memoryMoments.id, momentPersonTags.momentId))
    .where(
      and(
        eq(momentPersonTags.userId, userId),
        eq(momentPersonTags.state, "pending"),
        isNull(memoryMoments.withdrawnAt),
        availableMomentSource(),
        acceptedFriends(userId, sql`${memoryMoments.authorId}`),
        query.cursor ? gt(momentPersonTags.id, query.cursor) : undefined,
      ),
    )
    .orderBy(asc(momentPersonTags.id))
    .limit(query.limit + 1);
  const items: MomentTagInvitationDto[] = rows.map((row) => ({
    tag: tagDto(row.tag),
    moment: momentDto(row.moment),
  }));
  return memoryPage(items, query.limit, (row) => row.tag.id);
}

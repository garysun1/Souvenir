import { and, asc, eq, inArray, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { editions, outingMembers, outings, wishlistMembers, wishlists } from "@/lib/db/schema";
import { planContentSchema } from "@/lib/contracts/api";
import type { PlanContent, PlanCreate, PlanDto } from "../../../shared/api-contract";
import { requirePlaces } from "./catalog";
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
import { requireWishlist } from "./wishlists";

export async function requirePlan(database: Database, userId: string, id: string) {
  const [row] = await database.select().from(outings).where(eq(outings.id, id));
  if (!row) notFound("This plan is unavailable.");
  if (row.createdBy !== userId) {
    const [member] = await database
      .select()
      .from(outingMembers)
      .where(and(eq(outingMembers.outingId, id), eq(outingMembers.userId, userId)));
    if (!member) notFound("This plan is unavailable.");
    if (row.wishlistId) await requireWishlist(database, userId, row.wishlistId);
  }
  return row;
}

function parsePlan(row: typeof outings.$inferSelect): PlanContent {
  const parsed = planContentSchema.safeParse(row.plan);
  if (!parsed.success) throw new ApiError(500, "internal_error", "This saved plan needs repair.");
  return parsed.data;
}

async function serializePlan(
  database: Database,
  row: typeof outings.$inferSelect,
): Promise<PlanDto> {
  const plan = parsePlan(row);
  const members = await database
    .select({ userId: outingMembers.userId })
    .from(outingMembers)
    .where(eq(outingMembers.outingId, row.id))
    .orderBy(asc(outingMembers.userId));
  const visits = await database
    .select({ placeId: editions.placeId })
    .from(editions)
    .where(and(eq(editions.userId, row.createdBy), eq(editions.outingId, row.id)));
  const visited = new Set(visits.map((visit) => visit.placeId));
  return {
    id: row.id,
    requestId: row.requestId ?? row.id,
    wishlistId: row.wishlistId,
    createdBy: row.createdBy,
    memberIds: [...new Set([row.createdBy, ...members.map((member) => member.userId)])],
    plan,
    status: plan.stops.every((stop) => visited.has(stop.placeId)) ? "completed" : "accepted",
    createdAt: row.createdAt.toISOString(),
  };
}

export async function getPlans(userId: string, database: Database = db): Promise<PlanDto[]> {
  const rows = await database
    .select()
    .from(outings)
    .where(
      or(
        eq(outings.createdBy, userId),
        inArray(
          outings.id,
          database
            .select({ id: outingMembers.outingId })
            .from(outingMembers)
            .where(eq(outingMembers.userId, userId)),
        ),
      ),
    )
    .orderBy(asc(outings.createdAt), asc(outings.id));
  return Promise.all(rows.map((row) => serializePlan(database, row)));
}

async function validatePlan(
  tx: Transaction,
  userId: string,
  wishlistId: string | null,
  input: PlanContent,
): Promise<void> {
  const participants = input.constraints.participantIds;
  if (!participants.includes(userId)) invalidRequest("Include yourself in the plan.");
  if (wishlistId) {
    await requireWishlist(tx, userId, wishlistId, true);
    const members = await tx
      .select({ userId: wishlistMembers.userId })
      .from(wishlistMembers)
      .where(eq(wishlistMembers.wishlistId, wishlistId));
    if (participants.some((id) => !members.some((member) => member.userId === id))) {
      invalidRequest("Participants must be current members of the linked list.");
    }
  } else if (participants.length !== 1 || participants[0] !== userId) {
    invalidRequest("Personal plans can only include yourself.");
  }
  await requirePlaces(tx, [
    ...input.stops.map((stop) => stop.placeId),
    ...input.constraints.excludedPlaceIds,
    ...input.constraints.preferredPlaceIds,
  ]);
  if (input.stops.some((stop) => input.constraints.excludedPlaceIds.includes(stop.placeId))) {
    invalidRequest("The plan contains an excluded place.");
  }
  let previousDeparture = input.constraints.startMinute;
  for (const stop of input.stops) {
    if (
      stop.arrivalMinute < previousDeparture + stop.travelMinutes ||
      stop.departureMinute > input.constraints.endMinute
    ) {
      invalidRequest("Stops must fit the time window, including travel time.");
    }
    previousDeparture = stop.departureMinute;
  }
  const totalCost = input.stops.reduce((total, stop) => total + stop.costCents, 0);
  if (totalCost !== input.totalCostCents || totalCost > input.constraints.budgetCents) {
    invalidRequest("The plan total must match its stops and fit the budget.");
  }
  if (input.totalMinutes !== previousDeparture - input.constraints.startMinute) {
    invalidRequest("The plan duration must include all stops and travel.");
  }
}

export async function createPlan(userId: string, input: PlanCreate): Promise<Created<PlanDto>> {
  const normalized = { ...input, wishlistId: input.wishlistId ?? null };
  return db.transaction(async (tx) => {
    await lockUser(tx, userId);
    const request = await reserveRequest(tx, userId, input.requestId, "outing.create", normalized);
    if (request.resourceId) {
      const [existing] = await tx
        .select()
        .from(outings)
        .where(and(eq(outings.id, request.resourceId), eq(outings.createdBy, userId)));
      if (!existing) deletedResource();
      return { data: await serializePlan(tx, existing), created: false };
    }
    await validatePlan(tx, userId, normalized.wishlistId, input.plan);
    const [row] = await tx
      .insert(outings)
      .values({
        createdBy: userId,
        requestId: input.requestId,
        wishlistId: normalized.wishlistId,
        plan: { ...input.plan },
        plannedFor: new Date(`${input.plan.constraints.date}T00:00:00Z`),
      })
      .returning();
    await tx
      .insert(outingMembers)
      .values(
        input.plan.constraints.participantIds.map((id) => ({ outingId: row.id, userId: id })),
      );
    await completeRequest(tx, userId, input.requestId, row.id);
    return { data: await serializePlan(tx, row), created: true };
  });
}

export async function updatePlan(userId: string, id: string, input: PlanContent): Promise<PlanDto> {
  return db.transaction(async (tx) => {
    await lockUser(tx, userId);
    const existing = await requirePlan(tx, userId, id);
    if (existing.createdBy !== userId)
      throw new ApiError(403, "forbidden", "Only the creator can edit this plan.");
    await validatePlan(tx, userId, existing.wishlistId, input);
    const [row] = await tx
      .update(outings)
      .set({
        plan: { ...input },
        plannedFor: new Date(`${input.constraints.date}T00:00:00Z`),
      })
      .where(and(eq(outings.id, id), eq(outings.createdBy, userId)))
      .returning();
    await tx.delete(outingMembers).where(eq(outingMembers.outingId, id));
    await tx
      .insert(outingMembers)
      .values(
        input.constraints.participantIds.map((memberId) => ({ outingId: id, userId: memberId })),
      );
    return serializePlan(tx, row);
  });
}

export async function deletePlan(userId: string, id: string): Promise<{ deleted: true }> {
  return db.transaction(async (tx) => {
    await lockUser(tx, userId);
    const row = await requirePlan(tx, userId, id);
    if (row.createdBy !== userId)
      throw new ApiError(403, "forbidden", "Only the creator can delete this plan.");
    if (row.wishlistId) {
      await tx
        .select({ id: wishlists.id })
        .from(wishlists)
        .where(eq(wishlists.id, row.wishlistId))
        .for("update");
    }
    await tx.delete(outingMembers).where(eq(outingMembers.outingId, id));
    await tx.delete(outings).where(and(eq(outings.id, id), eq(outings.createdBy, userId)));
    return { deleted: true };
  });
}

export async function validateEditionOuting(
  tx: Transaction,
  userId: string,
  outingId: string,
  placeId: string,
): Promise<void> {
  const row = await requirePlan(tx, userId, outingId);
  if (row.wishlistId) await requireWishlist(tx, userId, row.wishlistId, true);
  const [locked] = await tx.select().from(outings).where(eq(outings.id, outingId)).for("update");
  if (!locked) notFound("This plan is unavailable.");
  await requirePlan(tx, userId, outingId);
  if (!parsePlan(locked).stops.some((stop) => stop.placeId === placeId)) {
    invalidRequest("This place is not a stop in the selected plan.");
  }
}

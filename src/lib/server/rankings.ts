import { and, asc, eq, inArray, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { editions, placePreferences, places, rankingGroups, rankings } from "@/lib/db/schema";
import type {
  PlacePreferenceDto,
  PlacePreferencePut,
  RankingDto,
  RankingGroupDto,
  RankingPut,
} from "../../../shared/api-contract";
import { requireSocialPlaces } from "./social-access";
import { syncRankingActivity } from "./activity";
import { recomputeStats } from "./stats";
import { invalidRequest } from "./errors";
import { lockUser, type Database, type Transaction } from "./transactions";

export async function getRankings(
  userId: string,
  database: Database = db,
): Promise<{ rankings: RankingDto[]; rankingGroups: RankingGroupDto[] }> {
  const rows = await database
    .select()
    .from(rankings)
    .where(eq(rankings.userId, userId))
    .orderBy(asc(rankings.placeId));
  const groups = await database
    .select()
    .from(rankingGroups)
    .where(eq(rankingGroups.userId, userId))
    .orderBy(asc(rankingGroups.category), asc(rankingGroups.sentiment));
  return {
    rankings: rows.map(({ placeId, sentiment, ranking, comparedTo, tiedWith, rankScore }) => ({
      placeId,
      sentiment,
      ranking,
      comparedTo,
      tiedWith,
      rankScore,
    })),
    rankingGroups: groups.map(({ category, sentiment, placeIds, provisionalIds, ties }) => ({
      category,
      sentiment,
      placeIds,
      provisionalIds,
      ties,
    })),
  };
}

async function requireOwnVisits(database: Database, userId: string, ids: string[]): Promise<void> {
  const unique = [...new Set(ids)];
  if (!unique.length) return;
  const rows = await database
    .selectDistinct({ placeId: editions.placeId })
    .from(editions)
    .where(and(eq(editions.userId, userId), inArray(editions.placeId, unique)));
  if (rows.length !== unique.length) invalidRequest("Rank only places in your own collection.");
}

function groupWithout(group: RankingGroupDto, placeId: string): RankingGroupDto {
  return {
    ...group,
    placeIds: group.placeIds.filter((id) => id !== placeId),
    provisionalIds: group.provisionalIds.filter((id) => id !== placeId),
    ties: group.ties.filter(([a, b]) => a !== placeId && b !== placeId),
  };
}

async function saveGroup(tx: Transaction, userId: string, group: RankingGroupDto): Promise<void> {
  await tx
    .insert(rankingGroups)
    .values({ userId, ...group })
    .onConflictDoUpdate({
      target: [rankingGroups.userId, rankingGroups.category, rankingGroups.sentiment],
      set: { placeIds: group.placeIds, provisionalIds: group.provisionalIds, ties: group.ties },
    });
  const leaders = new Map(group.placeIds.map((id, index) => [id, index]));
  const assessments = group.placeIds.length
    ? await tx
        .select()
        .from(rankings)
        .where(and(eq(rankings.userId, userId), inArray(rankings.placeId, group.placeIds)))
    : [];
  for (let pass = 0; pass < group.placeIds.length; pass++) {
    let changed = false;
    for (const [a, b] of group.ties) {
      const index = Math.min(leaders.get(a)!, leaders.get(b)!);
      if (leaders.get(a) !== index || leaders.get(b) !== index) changed = true;
      leaders.set(a, index);
      leaders.set(b, index);
    }
    if (!changed) break;
  }
  for (const id of group.placeIds) {
    const provisional = group.provisionalIds.includes(id);
    const comparedTo = assessments.find((entry) => entry.placeId === id)?.comparedTo;
    await tx
      .update(rankings)
      .set({
        ranking: provisional ? "provisional" : "settled",
        rankScore: provisional ? null : group.placeIds.length - leaders.get(id)!,
        comparedTo: comparedTo && group.placeIds.includes(comparedTo) ? comparedTo : null,
        tiedWith:
          group.ties.find(([a, b]) => a === id || b === id)?.find((other) => other !== id) ?? null,
        updatedAt: new Date(),
      })
      .where(and(eq(rankings.userId, userId), eq(rankings.placeId, id)));
  }
}

export async function removePlaceRanking(
  tx: Transaction,
  userId: string,
  placeId: string,
): Promise<void> {
  await tx.delete(rankings).where(and(eq(rankings.userId, userId), eq(rankings.placeId, placeId)));
  await tx
    .update(rankings)
    .set({ comparedTo: null, tiedWith: null })
    .where(
      and(
        eq(rankings.userId, userId),
        or(eq(rankings.comparedTo, placeId), eq(rankings.tiedWith, placeId)),
      ),
    );
  const groups = await tx.select().from(rankingGroups).where(eq(rankingGroups.userId, userId));
  for (const group of groups) {
    if (group.placeIds.includes(placeId)) await saveGroup(tx, userId, groupWithout(group, placeId));
  }
}

export async function putRanking(userId: string, placeId: string, input: RankingPut) {
  return db.transaction(async (tx) => {
    await lockUser(tx, userId);
    const ids = [
      placeId,
      ...(input.group?.placeIds ?? []),
      ...(input.comparedTo ? [input.comparedTo] : []),
      ...(input.tiedWith ? [input.tiedWith] : []),
    ];
    await requireSocialPlaces(userId, ids, tx);
    await requireOwnVisits(tx, userId, ids);
    const [place] = await tx.select().from(places).where(eq(places.id, placeId));
    const current = await getRankings(userId, tx);
    const group = input.group;
    if (group) {
      if (
        group.category !== place.category ||
        group.sentiment !== input.sentiment ||
        !group.placeIds.includes(placeId) ||
        input.ranking === "unranked" ||
        group.provisionalIds.includes(placeId) !== (input.ranking === "provisional")
      ) {
        invalidRequest("The ranking must match its category, sentiment, and group position.");
      }
      const catalog = await tx
        .select({ id: places.id, category: places.category })
        .from(places)
        .where(inArray(places.id, group.placeIds));
      if (catalog.some((entry) => entry.category !== group.category))
        invalidRequest("Compare places within one category.");
      if (
        group.placeIds.some(
          (id) =>
            id !== placeId &&
            !current.rankings.some(
              (entry) => entry.placeId === id && entry.sentiment === input.sentiment,
            ),
        )
      ) {
        invalidRequest("Every group member must have the same sentiment.");
      }
    }
    for (const reference of [input.comparedTo, input.tiedWith]) {
      if (reference && (reference === placeId || !group?.placeIds.includes(reference))) {
        invalidRequest("Comparisons must reference another place in the ranking group.");
      }
    }
    if (
      input.tiedWith &&
      !group?.ties.some(
        ([a, b]) =>
          (a === placeId && b === input.tiedWith) || (b === placeId && a === input.tiedWith),
      )
    ) {
      invalidRequest("The tie must be present in the ranking group.");
    }
    await tx
      .update(rankings)
      .set({ comparedTo: null, tiedWith: null })
      .where(
        and(
          eq(rankings.userId, userId),
          or(eq(rankings.comparedTo, placeId), eq(rankings.tiedWith, placeId)),
        ),
      );
    for (const old of current.rankingGroups) {
      if (old.placeIds.includes(placeId)) await saveGroup(tx, userId, groupWithout(old, placeId));
    }
    await tx
      .insert(rankings)
      .values({
        userId,
        placeId,
        wouldRecommend: input.sentiment === "recommend",
        sentiment: input.sentiment,
        ranking: "unranked",
        comparedTo: input.comparedTo ?? null,
        tiedWith: input.tiedWith ?? null,
        rankScore: null,
        visibility: input.visibility ?? "private",
      })
      .onConflictDoUpdate({
        target: [rankings.userId, rankings.placeId],
        set: {
          wouldRecommend: input.sentiment === "recommend",
          sentiment: input.sentiment,
          ranking: "unranked",
          comparedTo: input.comparedTo ?? null,
          tiedWith: input.tiedWith ?? null,
          rankScore: null,
          updatedAt: new Date(),
          visibility: input.visibility,
        },
      });
    if (group) {
      const old = current.rankingGroups.find(
        (entry) => entry.category === group.category && entry.sentiment === group.sentiment,
      );
      const removed = old?.placeIds.filter((id) => !group.placeIds.includes(id)) ?? [];
      if (removed.length) {
        await tx
          .update(rankings)
          .set({ ranking: "unranked", rankScore: null, comparedTo: null, tiedWith: null })
          .where(and(eq(rankings.userId, userId), inArray(rankings.placeId, removed)));
      }
      await saveGroup(tx, userId, group);
    }
    await syncRankingActivity(tx, userId, placeId);
    await recomputeStats({ placeIds: [placeId], expandLocalities: false }, tx);
    return getRankings(userId, tx);
  });
}

export async function getPlacePreferences(
  userId: string,
  database: Database = db,
): Promise<PlacePreferenceDto[]> {
  return database
    .select({
      placeId: placePreferences.placeId,
      favorite: placePreferences.favorite,
      tip: placePreferences.tip,
    })
    .from(placePreferences)
    .where(eq(placePreferences.userId, userId))
    .orderBy(asc(placePreferences.placeId));
}

export async function putPlacePreference(
  userId: string,
  placeId: string,
  input: PlacePreferencePut,
): Promise<PlacePreferenceDto> {
  return db.transaction(async (tx) => {
    await lockUser(tx, userId);
    await requireSocialPlaces(userId, [placeId], tx);
    const [row] = await tx
      .insert(placePreferences)
      .values({ userId, placeId, ...input })
      .onConflictDoUpdate({
        target: [placePreferences.userId, placePreferences.placeId],
        set: input,
      })
      .returning();
    return { placeId, favorite: row.favorite, tip: row.tip };
  });
}

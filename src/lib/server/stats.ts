import { eq, inArray, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import { places, placeStats, userStats } from "@/lib/db/schema";
import { placeMetricsSchema } from "@/lib/contracts/api";
import type {
  PlaceMetricsDto,
  PlaceSocialDto,
  SetCompletionDto,
  UserStatsDto,
} from "../../../shared/api-contract";
import { acceptedFriends, requireSocialPlace, visibleTo } from "./social-access";
import type { Database, Transaction } from "./transactions";

const DAY = 86_400_000;
const WEEK = 7 * DAY;
export type Locality = { city: string | null; country: string | null };
export type StatsScope = {
  placeIds?: string[];
  userIds?: string[];
  previousLocalities?: Locality[];
  expandLocalities?: boolean;
  now?: Date;
};

export function statsWindows(now: Date) {
  const last7 = new Date(now.getTime() - WEEK);
  const baselineEnd = new Date(last7);
  baselineEnd.setUTCHours(0, 0, 0, 0);
  baselineEnd.setUTCDate(baselineEnd.getUTCDate() - ((baselineEnd.getUTCDay() + 6) % 7));
  return {
    windowStart: new Date(now.getTime() - 90 * DAY),
    windowEnd: now,
    last7,
    baselineEnd,
    baselineStart: new Date(baselineEnd.getTime() - 8 * WEEK),
  };
}

export function streaks(weeks: string[], currentWeek: string) {
  const ordered = [...new Set(weeks)].sort();
  let longestStreakWeeks = 0;
  let run = 0;
  let previous = 0;
  for (const week of ordered) {
    const time = Date.parse(week);
    run = time - previous === WEEK ? run + 1 : 1;
    longestStreakWeeks = Math.max(longestStreakWeeks, run);
    previous = time;
  }
  const age = Date.parse(currentWeek) - previous;
  return {
    currentStreakWeeks: age === 0 || age === WEEK ? run : 0,
    longestStreakWeeks,
  };
}

type PlaceCounts = {
  placeId: string;
  city: string | null;
  country: string | null;
  collectors: number;
  editions: number;
  saves: number;
  recommend: number;
  depends: number;
  skip: number;
  visitors90d: number;
  cityVisitors90d: number;
  collectors7d: number;
  weeklyCollectors8w: number[];
};

async function refreshPlaces(tx: Transaction, scope: StatsScope, now: Date) {
  const all = scope.placeIds === undefined && scope.userIds === undefined;
  const initial = all
    ? await tx.select().from(places)
    : scope.placeIds?.length
      ? await tx.select().from(places).where(inArray(places.id, scope.placeIds))
      : [];
  const localities = [...initial, ...(scope.previousLocalities ?? [])].filter(
    (place) => place.city && place.country,
  );
  const keys = new Set([
    ...initial.map((place) => `place:${place.id}`),
    ...localities.map((place) => `city:${JSON.stringify([place.city, place.country])}`),
  ]);
  for (const key of [...keys].sort()) {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
  }
  const conditions: SQL[] = [];
  if (initial.length)
    conditions.push(
      inArray(
        places.id,
        initial.map((place) => place.id),
      ),
    );
  const uniqueLocalities = new Map(
    localities.map((place) => [JSON.stringify([place.city, place.country]), place]),
  );
  if (scope.expandLocalities !== false) {
    for (const locality of uniqueLocalities.values()) {
      conditions.push(
        sql`(${places.city} = ${locality.city} AND ${places.country} = ${locality.country})`,
      );
    }
  }
  if (!all && !conditions.length) return;
  const filter = all ? sql`true` : sql`(${sql.join(conditions, sql` OR `)})`;
  const window = statsWindows(now);
  const instant = now.toISOString();
  const start = window.windowStart.toISOString();
  const last7 = window.last7.toISOString();
  const baseline = window.baselineStart.toISOString();
  const end = window.baselineEnd.toISOString();
  const rows = await tx.execute<PlaceCounts>(sql`
    WITH target AS (SELECT id, city, country, visibility FROM places WHERE ${filter}),
    visits AS (
      SELECT e.place_id, e.user_id, e.captured_at, p.city, p.country
      FROM editions e JOIN places p ON p.id = e.place_id
      WHERE e.visibility = 'public' AND p.visibility = 'public' AND e.captured_at < ${instant}::timestamptz
        AND (e.place_id IN (SELECT id FROM target) OR
          (e.captured_at >= ${start}::timestamptz AND EXISTS (
            SELECT 1 FROM target t WHERE t.city = p.city AND t.country = p.country)))
    ),
    counts AS (
      SELECT place_id, count(*)::int editions, count(DISTINCT user_id)::int collectors,
        count(DISTINCT user_id) FILTER (WHERE captured_at >= ${start}::timestamptz)::int visitors,
        count(DISTINCT user_id) FILTER (WHERE captured_at >= ${last7}::timestamptz)::int recent
      FROM visits GROUP BY place_id
    ),
    cities AS (
      SELECT city, country, count(DISTINCT user_id)::int visitors
      FROM visits WHERE captured_at >= ${start}::timestamptz
      GROUP BY city, country
    ),
    sentiments AS (
      SELECT r.place_id,
        count(*) FILTER (WHERE r.sentiment = 'recommend')::int recommend,
        count(*) FILTER (WHERE r.sentiment = 'depends')::int depends,
        count(*) FILTER (WHERE r.sentiment = 'skip')::int skip
      FROM rankings r JOIN target t ON t.id = r.place_id
      WHERE r.visibility = 'public' AND t.visibility = 'public'
        AND EXISTS (SELECT 1 FROM editions e WHERE e.user_id = r.user_id AND e.place_id = r.place_id)
      GROUP BY r.place_id
    ),
    saves AS (
      SELECT s.place_id, count(DISTINCT s.user_id)::int saves FROM wishlist_saves s
      JOIN target t ON t.id = s.place_id
      JOIN wishlist_members m ON m.wishlist_id = s.wishlist_id AND m.user_id = s.user_id
      JOIN wishlists w ON w.id = s.wishlist_id
      WHERE s.visibility = 'public' AND t.visibility = 'public'
        AND (w.is_shared OR w.owner_id = s.user_id)
      GROUP BY s.place_id
    ),
    weekly AS (
      SELECT t.id, w.week, count(DISTINCT v.user_id)::int collectors
      FROM target t CROSS JOIN generate_series(${baseline}::timestamptz,
        ${end}::timestamptz - interval '7 days', interval '7 days') w(week)
      LEFT JOIN visits v ON v.place_id = t.id AND v.captured_at >= w.week AND v.captured_at < w.week + interval '7 days'
      GROUP BY t.id, w.week
    )
    SELECT t.id AS "placeId", t.city, t.country,
      coalesce(c.collectors, 0)::int collectors, coalesce(c.editions, 0)::int editions,
      coalesce(s.saves, 0)::int saves,
      coalesce(r.recommend, 0)::int recommend, coalesce(r.depends, 0)::int depends, coalesce(r.skip, 0)::int skip,
      coalesce(c.visitors, 0)::int AS "visitors90d",
      greatest(coalesce(city.visitors, 0), coalesce(c.visitors, 0))::int AS "cityVisitors90d",
      coalesce(c.recent, 0)::int AS "collectors7d",
      (SELECT jsonb_agg(w.collectors ORDER BY w.week) FROM weekly w WHERE w.id = t.id) AS "weeklyCollectors8w"
    FROM target t LEFT JOIN counts c ON c.place_id = t.id
    LEFT JOIN cities city ON city.city = t.city AND city.country = t.country
    LEFT JOIN sentiments r ON r.place_id = t.id LEFT JOIN saves s ON s.place_id = t.id
    ORDER BY t.id
  `);
  const values = rows.map((row) => {
    const total = row.recommend + row.depends + row.skip;
    const average = row.weeklyCollectors8w.reduce((sum, count) => sum + count, 0) / 8;
    const ready = Boolean(row.city && row.country && row.cityVisitors90d >= 5);
    return {
      ...row,
      discoveryFreq: ready ? row.visitors90d / row.cityVisitors90d : null,
      recommendRate: total >= 5 ? row.recommend / total : null,
      collectors8wAvg: average,
      trendingScore: average > 0 ? row.collectors7d / average : null,
      sampleStatus:
        ready && total >= 5 && average > 0 ? ("ready" as const) : ("insufficient" as const),
      windowStart: window.windowStart,
      windowEnd: now,
      baselineStart: window.baselineStart,
      baselineEnd: window.baselineEnd,
      computedAt: now,
    };
  });
  for (let offset = 0; offset < values.length; offset += 500) {
    await tx
      .insert(placeStats)
      .values(values.slice(offset, offset + 500))
      .onConflictDoUpdate({
        target: placeStats.placeId,
        set: {
          city: sql`excluded.city`,
          country: sql`excluded.country`,
          collectors: sql`excluded.collectors`,
          editions: sql`excluded.editions`,
          saves: sql`excluded.saves`,
          recommend: sql`excluded.recommend`,
          depends: sql`excluded.depends`,
          skip: sql`excluded.skip`,
          visitors90d: sql`excluded.visitors_90d`,
          cityVisitors90d: sql`excluded.city_visitors_90d`,
          collectors7d: sql`excluded.collectors_7d`,
          weeklyCollectors8w: sql`excluded.weekly_collectors_8w`,
          collectors8wAvg: sql`excluded.collectors_8w_avg`,
          discoveryFreq: sql`excluded.discovery_freq`,
          recommendRate: sql`excluded.recommend_rate`,
          trendingScore: sql`excluded.trending_score`,
          sampleStatus: sql`excluded.sample_status`,
          computedAt: sql`excluded.computed_at`,
          windowStart: sql`excluded.window_start`,
          windowEnd: sql`excluded.window_end`,
          baselineStart: sql`excluded.baseline_start`,
          baselineEnd: sql`excluded.baseline_end`,
          provenance: sql`excluded.provenance`,
          definitionVersion: sql`excluded.definition_version`,
        },
      });
  }
}

export function editionAudience(viewerId: string, ownerId: string): SQL {
  return sql`e.user_id = ${ownerId}::uuid
    AND ${visibleTo(viewerId, sql`e.user_id`, sql`e.visibility`)}
    AND ${visibleTo(viewerId, sql`p.owner_id`, sql`p.visibility`)}`;
}

async function userCounts(database: Database, ownerId: string, audience: SQL, now: Date) {
  const rows = await database.execute<{
    placesVisited: number;
    editions: number;
    citiesVisited: number;
    weeks: string[];
    currentWeek: string;
  }>(sql`
    WITH owned AS (
      SELECT e.*, p.city, p.country FROM editions e JOIN places p ON p.id = e.place_id
      WHERE ${audience} AND e.captured_at < ${now.toISOString()}::timestamptz
    )
    SELECT count(DISTINCT place_id)::int AS "placesVisited", count(*)::int editions,
      count(DISTINCT (city, country)) FILTER (WHERE city IS NOT NULL AND country IS NOT NULL)::int AS "citiesVisited",
      coalesce(jsonb_agg(DISTINCT to_char(date_trunc('week', captured_at AT TIME ZONE timezone), 'YYYY-MM-DD')), '[]') AS weeks,
      to_char(date_trunc('week', ${now.toISOString()}::timestamptz AT TIME ZONE
        coalesce((SELECT timezone FROM owned ORDER BY captured_at DESC, id DESC LIMIT 1), 'UTC')), 'YYYY-MM-DD') AS "currentWeek"
    FROM owned
  `);
  const row = rows[0];
  return {
    userId: ownerId,
    placesVisited: row.placesVisited,
    editions: row.editions,
    citiesVisited: row.citiesVisited,
    ...streaks(row.weeks, row.currentWeek),
    globalRank: null,
    cityRanks: [],
    computedAt: now,
    sampleStatus: "ready" as const,
    provenance: "souvenir-activity" as const,
    definitionVersion: 1 as const,
  };
}

export async function recomputeStats(
  scope: StatsScope = {},
  transaction?: Transaction,
): Promise<void> {
  const run = async (tx: Transaction) => {
    const now = scope.now ?? new Date();
    await refreshPlaces(tx, scope, now);
    const all = scope.placeIds === undefined && scope.userIds === undefined;
    const owners = all
      ? await tx.execute<{ id: string }>(sql`SELECT id FROM users ORDER BY id`)
      : (scope.userIds ?? []).map((id) => ({ id }));
    for (const { id } of owners) {
      const values = await userCounts(tx, id, sql`e.user_id = ${id}::uuid`, now);
      await tx
        .insert(userStats)
        .values(values)
        .onConflictDoUpdate({ target: userStats.userId, set: values });
    }
  };
  if (transaction) await run(transaction);
  else await db.transaction(run);
}

export function serializeMetrics(
  row: typeof placeStats.$inferSelect,
  now = new Date(),
): PlaceMetricsDto {
  const stale = now.getTime() - row.computedAt.getTime() > 300_000;
  const frequency =
    !row.city || !row.country
      ? "unavailable"
      : row.discoveryFreq === null
        ? "insufficient"
        : "ready";
  const sentiment = row.recommendRate === null ? "insufficient" : "ready";
  const trend = row.trendingScore === null ? "insufficient" : "ready";
  return placeMetricsSchema.parse({
    provenance: "souvenir-activity",
    definitionVersion: 1,
    computedAt: row.computedAt.toISOString(),
    sampleStatus: stale ? "stale" : row.sampleStatus,
    collectors: row.collectors,
    editions: row.editions,
    saves: row.saves,
    discoveryFreq: row.discoveryFreq,
    frequency: {
      status: stale ? "stale" : frequency,
      visitors90d: row.visitors90d,
      cityVisitors90d: row.cityVisitors90d,
      city: row.city,
      country: row.country,
      windowStart: row.windowStart.toISOString(),
      windowEnd: row.windowEnd.toISOString(),
      minimumCohort: 5,
    },
    recommendRate: row.recommendRate,
    sentiment: {
      status: stale ? "stale" : sentiment,
      recommend: row.recommend,
      depends: row.depends,
      skip: row.skip,
      minimumSample: 5,
    },
    trendingScore: row.trendingScore,
    trend: {
      status: stale ? "stale" : trend,
      collectors7d: row.collectors7d,
      weeklyCollectors8w: row.weeklyCollectors8w,
      collectors8wAvg: row.collectors8wAvg,
      baselineStart: row.baselineStart.toISOString(),
      baselineEnd: row.baselineEnd.toISOString(),
    },
  });
}

export async function getPlaceMetrics(
  viewerId: string,
  placeId: string,
): Promise<PlaceMetricsDto | null> {
  const place = await requireSocialPlace(viewerId, placeId);
  if (place.visibility !== "public") return null;
  let [row] = await db.select().from(placeStats).where(eq(placeStats.placeId, placeId));
  if (
    !row ||
    row.city !== place.city ||
    row.country !== place.country ||
    Date.now() - row.computedAt.getTime() > 300_000
  ) {
    await recomputeStats({ placeIds: [placeId] });
    [row] = await db.select().from(placeStats).where(eq(placeStats.placeId, placeId));
  }
  return row ? serializeMetrics(row) : null;
}

export async function getPlaceSocial(
  viewerId: string,
  placeId: string,
  database: Database = db,
): Promise<PlaceSocialDto> {
  await requireSocialPlace(viewerId, placeId, database);
  const [row] = await database.execute<PlaceSocialDto & Record<string, unknown>>(sql`
    SELECT
      (SELECT count(DISTINCT e.user_id)::int FROM editions e WHERE e.place_id = ${placeId}::uuid
        AND e.visibility <> 'private' AND ${acceptedFriends(viewerId, sql`e.user_id`)}) AS "friendsBeen",
      (SELECT count(DISTINCT s.user_id)::int FROM wishlist_saves s
        JOIN wishlist_members m ON m.wishlist_id = s.wishlist_id AND m.user_id = s.user_id
        JOIN wishlists w ON w.id = s.wishlist_id
        WHERE s.place_id = ${placeId}::uuid AND ${acceptedFriends(viewerId, sql`s.user_id`)}
        AND (w.is_shared OR w.owner_id = s.user_id)
        AND (s.visibility <> 'private' OR (w.is_shared AND EXISTS (
          SELECT 1 FROM wishlist_members v WHERE v.wishlist_id = s.wishlist_id AND v.user_id = ${viewerId}::uuid)))) AS "friendsSaved"
  `);
  return { friendsBeen: row.friendsBeen, friendsSaved: row.friendsSaved };
}

export async function getSetCompletion(
  viewerId: string,
  ownerId: string,
  database: Database = db,
): Promise<SetCompletionDto[]> {
  const rows = await database.execute<{ setId: string; visited: number; total: number }>(sql`
    SELECT s.id AS "setId", count(sp.place_id)::int total,
      count(sp.place_id) FILTER (WHERE EXISTS (SELECT 1 FROM editions e JOIN places p ON p.id = e.place_id
        WHERE e.place_id = sp.place_id AND ${editionAudience(viewerId, ownerId)}))::int visited
    FROM sets s LEFT JOIN set_places sp ON sp.set_id = s.id
    WHERE NOT EXISTS (SELECT 1 FROM set_places hidden JOIN places p ON p.id = hidden.place_id
      WHERE hidden.set_id = s.id AND NOT ${visibleTo(viewerId, sql`p.owner_id`, sql`p.visibility`)})
    GROUP BY s.id ORDER BY s.id
  `);
  return rows.map((row) => ({ ...row, rate: row.total ? row.visited / row.total : null }));
}

export async function getTasteOverlap(
  viewerId: string,
  friendId: string,
  database: Database = db,
): Promise<number | null> {
  const [row] = await database.execute<{ overlap: number | null }>(sql`
    WITH visits AS (
      SELECT e.place_id, bool_or(e.user_id = ${viewerId}::uuid) mine, bool_or(e.user_id = ${friendId}::uuid) theirs
      FROM editions e JOIN places p ON p.id = e.place_id
      WHERE (${editionAudience(viewerId, viewerId)} OR ${editionAudience(viewerId, friendId)})
      GROUP BY e.place_id
    ) SELECT count(*) FILTER (WHERE mine AND theirs)::float8 / nullif(count(*), 0) overlap FROM visits
  `);
  return row.overlap;
}

export async function getUserStats(
  viewerId: string,
  ownerId: string,
  database: Database = db,
): Promise<UserStatsDto | null> {
  const [allowed] = await database.execute(sql`SELECT id FROM users u WHERE u.id = ${ownerId}::uuid
    AND ${visibleTo(viewerId, sql`u.id`, sql`u.stats_visibility`)}`);
  if (!allowed) return null;
  const now = new Date();
  const counts = await userCounts(database, ownerId, editionAudience(viewerId, ownerId), now);
  const ranked = await database.execute<{
    rank: number;
    city: string | null;
    country: string | null;
    placesVisited: number;
  }>(sql`
    WITH counts AS (
      SELECT u.id, NULL::text city, NULL::text country, count(DISTINCT p.id)::int n FROM users u
      LEFT JOIN editions e ON e.user_id = u.id AND e.visibility = 'public' AND e.captured_at < ${now.toISOString()}::timestamptz
      LEFT JOIN places p ON p.id = e.place_id AND p.visibility = 'public'
      WHERE u.stats_visibility = 'public' GROUP BY u.id
      UNION ALL
      SELECT u.id, p.city, p.country, count(DISTINCT p.id)::int n
      FROM users u JOIN editions e ON e.user_id = u.id JOIN places p ON p.id = e.place_id
      WHERE u.stats_visibility = 'public' AND e.visibility = 'public' AND p.visibility = 'public'
        AND e.captured_at < ${now.toISOString()}::timestamptz AND p.city IS NOT NULL AND p.country IS NOT NULL
      GROUP BY u.id, p.city, p.country
    ), ranked AS (
      SELECT *, rank() OVER (PARTITION BY city, country ORDER BY n DESC)::int rank FROM counts
    ) SELECT rank, city, country, n AS "placesVisited" FROM ranked WHERE id = ${ownerId}::uuid ORDER BY country, city
  `);
  return {
    placesVisited: counts.placesVisited,
    editions: counts.editions,
    citiesVisited: counts.citiesVisited,
    currentStreakWeeks: counts.currentStreakWeeks,
    longestStreakWeeks: counts.longestStreakWeeks,
    globalRank: ranked.find((row) => row.city === null)?.rank ?? null,
    cityRanks: ranked.flatMap((row) =>
      row.city && row.country
        ? [
            {
              city: row.city,
              country: row.country,
              rank: row.rank,
              placesVisited: row.placesVisited,
            },
          ]
        : [],
    ),
    computedAt: now.toISOString(),
    provenance: "souvenir-activity",
    definitionVersion: 1,
    sampleStatus: "ready",
  };
}

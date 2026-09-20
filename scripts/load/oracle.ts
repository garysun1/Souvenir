import assert from "node:assert/strict";
import type { PlaceMetricsDto, UserStatsDto } from "../../shared/api-contract";
import type { Database } from "./local";

export async function profileOracle(db: Database, id: string, stats: UserStatsDto) {
  const [row] = await db`
    SELECT count(*)::int AS editions, count(DISTINCT e.place_id)::int AS places,
      count(DISTINCT (p.city,p.country)) FILTER (WHERE p.city IS NOT NULL AND p.country IS NOT NULL)::int AS cities
    FROM editions e JOIN places p ON p.id=e.place_id WHERE e.user_id=${id}`;
  assert.equal(stats.editions, row.editions);
  assert.equal(stats.placesVisited, row.places);
  assert.equal(stats.citiesVisited, row.cities);
  const [streak] = await db`
    WITH weeks AS (
      SELECT DISTINCT date_trunc('week', captured_at AT TIME ZONE 'UTC') AS week
      FROM editions WHERE user_id=${id}
    ), grouped AS (
      SELECT week,week - row_number() OVER (ORDER BY week) * interval '1 week' AS grp FROM weeks
    ), spans AS (SELECT count(*)::int AS n, max(week) AS last FROM grouped GROUP BY grp)
    SELECT coalesce(max(n),0)::int AS longest,
      coalesce(max(n) FILTER (WHERE last >= date_trunc('week', now() AT TIME ZONE 'UTC') - interval '1 week'),0)::int AS current
    FROM spans`;
  assert.equal(stats.longestStreakWeeks, streak.longest);
  assert.equal(stats.currentStreakWeeks, streak.current);
  assert.equal(stats.provenance, "souvenir-activity");
  assert.equal(stats.definitionVersion, 1);
  assert(Date.now() - Date.parse(stats.computedAt) < 300_000, "Stats older than five minutes");
}

function near(actual: number | null, expected: number | null) {
  if (expected === null) assert.equal(actual, null);
  else
    assert(
      actual !== null && Number.isFinite(actual) && Math.abs(actual - expected) < 1e-9,
      "Metric differs from SQL oracle",
    );
}

export async function metricsOracle(db: Database, id: string, metrics: PlaceMetricsDto) {
  assert.equal(metrics.provenance, "souvenir-activity");
  assert.equal(metrics.definitionVersion, 1);
  assert.equal(metrics.frequency.minimumCohort, 5);
  assert.equal(metrics.sentiment.minimumSample, 5);
  const end = metrics.frequency.windowEnd;
  const start = metrics.frequency.windowStart;
  assert.equal(Date.parse(end) - Date.parse(start), 90 * 86_400_000);
  const [counts] = await db`
    SELECT count(*)::int AS editions, count(DISTINCT user_id)::int AS collectors,
      count(DISTINCT user_id) FILTER (WHERE captured_at >= ${start}::timestamptz AND captured_at < ${end}::timestamptz)::int AS visitors,
      count(DISTINCT user_id) FILTER (WHERE captured_at >= ${end}::timestamptz - interval '7 days' AND captured_at < ${end}::timestamptz)::int AS recent
    FROM editions WHERE place_id=${id} AND visibility='public'`;
  const [cohort] = await db`
    SELECT count(DISTINCT e.user_id)::int AS visitors FROM editions e
    JOIN places p ON p.id=e.place_id JOIN places target ON target.id=${id}
    WHERE e.visibility='public' AND p.visibility='public'
      AND p.city=target.city AND p.country=target.country
      AND e.captured_at>=${start}::timestamptz AND e.captured_at<${end}::timestamptz`;
  const [sentiment] = await db`
    SELECT count(*) FILTER (WHERE sentiment='recommend')::int AS recommend,
      count(*) FILTER (WHERE sentiment='depends')::int AS depends,
      count(*) FILTER (WHERE sentiment='skip')::int AS skip
    FROM rankings WHERE place_id=${id} AND visibility='public'`;
  const [saves] =
    await db`SELECT count(DISTINCT user_id)::int AS count FROM wishlist_saves WHERE place_id=${id} AND visibility='public'`;
  assert.equal(metrics.collectors, counts.collectors);
  assert.equal(metrics.editions, counts.editions);
  assert.equal(metrics.saves, saves.count);
  assert.equal(metrics.frequency.visitors90d, counts.visitors);
  assert.equal(metrics.frequency.cityVisitors90d, cohort.visitors);
  near(metrics.discoveryFreq, cohort.visitors >= 5 ? counts.visitors / cohort.visitors : null);
  assert.deepEqual(
    {
      recommend: metrics.sentiment.recommend,
      depends: metrics.sentiment.depends,
      skip: metrics.sentiment.skip,
    },
    sentiment,
  );
  const total = sentiment.recommend + sentiment.depends + sentiment.skip;
  near(metrics.recommendRate, total >= 5 ? sentiment.recommend / total : null);
  if (cohort.visitors < 5) assert.notEqual(metrics.frequency.status, "ready");
  if (total < 5) assert.notEqual(metrics.sentiment.status, "ready");
  const weekly = await db`
    WITH weeks AS (
      SELECT generate_series(
        date_trunc('week', (${end}::timestamptz AT TIME ZONE 'UTC') - interval '7 days') - interval '8 weeks',
        date_trunc('week', (${end}::timestamptz AT TIME ZONE 'UTC') - interval '7 days') - interval '1 week',
        interval '1 week') AS week
    )
    SELECT count(DISTINCT e.user_id)::int AS count FROM weeks w
    LEFT JOIN editions e ON e.place_id=${id} AND e.visibility='public'
      AND e.captured_at >= w.week AT TIME ZONE 'UTC' AND e.captured_at < (w.week + interval '1 week') AT TIME ZONE 'UTC'
    GROUP BY w.week ORDER BY w.week`;
  const values = weekly.map((row) => row.count as number);
  assert.deepEqual(metrics.trend.weeklyCollectors8w, values);
  const mean = values.reduce((a, b) => a + b, 0) / 8;
  near(metrics.trend.collectors8wAvg, mean);
  assert.equal(metrics.trend.collectors7d, counts.recent);
  near(metrics.trendingScore, mean > 0 ? counts.recent / mean : null);
  assert(Date.now() - Date.parse(metrics.computedAt) < 300_000, "Stale place metrics");
}

export async function integrityOracle(db: Database, ids: string[]) {
  const [bad] = await db`
    SELECT count(*)::int AS count FROM editions e
    LEFT JOIN users u ON u.id=e.user_id LEFT JOIN places p ON p.id=e.place_id
    WHERE e.user_id=ANY(${ids}::uuid[]) AND (u.id IS NULL OR p.id IS NULL
      OR (e.photo_path IS NOT NULL AND split_part(e.photo_path,'/',1)<>e.user_id::text))`;
  assert.equal(bad.count, 0);
  const [orphan] = await db`
    SELECT count(*)::int AS count FROM activity_events a
    LEFT JOIN editions e ON e.id=a.edition_id AND e.user_id=a.user_id AND e.place_id=a.place_id
    LEFT JOIN place_notes n ON n.id=a.note_id AND n.user_id=a.user_id AND n.place_id=a.place_id
    LEFT JOIN rankings r ON r.user_id=a.user_id AND r.place_id=a.ranking_place_id
    WHERE a.user_id=ANY(${ids}::uuid[]) AND (
      (a.kind='edition' AND e.id IS NULL) OR (a.kind='note' AND n.id IS NULL)
      OR (a.kind='ranking' AND r.user_id IS NULL))`;
  assert.equal(orphan.count, 0);
  const [rls] = await db`
    SELECT count(*)::int AS count FROM pg_tables
    WHERE schemaname='public' AND tablename IN ('users','editions','place_notes','activity_events')
      AND NOT rowsecurity`;
  assert.equal(rls.count, 0, "RLS boundary disabled");
  const [grants] = await db`
    SELECT count(*)::int AS count FROM information_schema.role_table_grants
    WHERE table_schema='public' AND grantee IN ('anon','authenticated','PUBLIC')
      AND table_name IN ('users','editions','place_notes','activity_events')`;
  assert.equal(grants.count, 0, "Direct client grants breach API boundary");
}

export async function explainOracle(db: Database, id: string, place: string) {
  const expected = [
    "editions_place_captured_user_idx",
    "editions_user_captured_idx",
    "activity_events_user_cursor_idx",
    "user_stats_leaderboard_idx",
  ];
  const indexes =
    await db`SELECT indexname FROM pg_indexes WHERE schemaname='public' AND indexname=ANY(${expected})`;
  assert.equal(indexes.length, expected.length);
  return db.begin(async (tx) => {
    await tx`SET LOCAL enable_seqscan=off`;
    await tx`SET LOCAL enable_sort=off`;
    const plans = [
      await tx`EXPLAIN (FORMAT TEXT) SELECT user_id FROM editions WHERE place_id=${place} AND captured_at>=now()-interval '90 days' ORDER BY captured_at,user_id`,
      await tx`EXPLAIN (FORMAT TEXT) SELECT * FROM editions WHERE user_id=${id} ORDER BY captured_at DESC`,
      await tx`EXPLAIN (FORMAT TEXT) SELECT * FROM activity_events WHERE user_id>=${id} ORDER BY user_id,created_at DESC NULLS LAST,id DESC NULLS LAST LIMIT 25`,
      await tx`EXPLAIN (FORMAT TEXT) SELECT * FROM user_stats ORDER BY places_visited DESC NULLS LAST,user_id LIMIT 25`,
    ].map((rows) => rows.map((row) => String(row["QUERY PLAN"])).join("\n"));
    for (let i = 0; i < expected.length; i++)
      assert(plans[i].includes(expected[i]), `Missing expected EXPLAIN index ${expected[i]}`);
    return {
      note: "enable_seqscan=off and enable_sort=off with matching ordered probes check index eligibility; these are not production optimizer cost claims.",
      plans,
    };
  });
}

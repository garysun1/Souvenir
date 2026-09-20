# Social metrics, multi-city load seeding, and subagent split

Extends [destination-data-backend.md](./destination-data-backend.md). Phase A
there (contracts → provider adapters → nearby → notes/tags → frontend wiring)
is a prerequisite for everything below. Phase B adds social-metric features,
Phase C seeds 1000 dummy accounts across multiple cities and verifies the
whole stack through the public API and the database, Phase D splits the work
across subagents.

## 1. Current state relevant to social features

| Piece                                              | State                                                                                                                                                                     |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `friendships` table                                | Exists in `schema.ts` (`user_id, friend_id, status pending\|accepted`), **no API route and no server module** read or write it.                                          |
| Wishlist sharing                                   | Real: `wishlist_members`, `wishlist_saves`, `GET /api/wishlists/[id]/overlap`.                                                                                             |
| Rankings / sentiment                               | Real per-user: `ranking_groups`, `PUT /api/rankings/[placeId]`, `place_preferences`.                                                                                       |
| Rarity signals on `places`                         | `rarityAppeal`, `rarityDiscoveryFreq`, `rarityAvailability` are static seeded ints (0 for extension rows). UI shows "Still learning / Unavailable / Unknown" (see place screen). |
| Mobile social                                      | `domain/social.ts` (`socialActivity`, `friendSummary`, `fictionalEditions`), `features/social/*`, `app/friend/[userId].tsx` run entirely on fixtures.                     |
| Auth provisioning                                  | `ensureUserProfile` creates a `users` row from the verified Supabase UUID; `scripts/check-hosted.mjs` shows the pattern for admin `createUser` + scoped cleanup.           |
| Test infra                                         | Disposable Docker Postgres 16 harnesses (`tests/server/check-persistence.mjs`, `tests/auth/check-profiles.mjs`), vitest unit tests, no load harness.                        |

Constraint from the environment notes: never seed or reset the shared hosted
project; hosted checks use disposable accounts and cleanup scoped to recorded
IDs. Phase C is designed around that.

## 2. Phase B — social-metric features

### 2.1 Metrics to compute

All derived from `editions`, `friendships`, `wishlist_saves`, `ranking_groups`,
`place_notes`, `place_tags`. Nothing new is written by users for these; they
are aggregations.

| Metric                    | Definition                                                                                         | Surfaces                                                                 |
| ------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `discoveryFreq`           | distinct collectors with ≥1 edition at the place ÷ active collectors in the place's city, 90-day window | Place screen "In-app discovery frequency" (replaces "Unavailable"), rarity tier |
| `friendsBeen`             | accepted friends of viewer with an edition at the place                                            | Place screen "3 friends have been", Discover rail "Friends went"         |
| `friendsSaved`            | accepted friends with a `wishlist_saves` row at the place                                          | Place screen, wishlist overlap                                           |
| `recommendRate`           | recommend ÷ (recommend+depends+skip) from `ranking_groups`, min 5 raters, else null                | Place screen sentiment chip (sentiment colors, per design rules)         |
| `trending`                | editions in last 7 d ÷ trailing 8-week weekly mean, per place and per city                         | Discover "Trending in {city}"                                            |
| `collectorRank`           | viewer's distinct-place count rank within city and globally                                        | Profile stat tiles (Beli "#Rank")                                        |
| `streak`                  | consecutive ISO weeks with ≥1 edition                                                              | Profile stat tile                                                        |
| `setCompletion`           | places in set with an edition ÷ set size, per user; also friends' completion                       | Set cards "You've been to 3 of 10", friend comparison                    |
| `tasteOverlap`            | Jaccard of place sets between viewer and friend                                                    | Friend screen                                                            |
| `feed`                    | friends' editions, rankings, notes, set completions, ordered by time                               | Friends tab                                                              |

`rarityAppeal`, `discoveryFreq`, `availability` stay three separate signals per
AGENTS.md; only `rarityDiscoveryFreq` becomes computed. `rarityTier` is derived
from `discoveryFreq` percentiles within city (legendary ≤ 2 %, epic ≤ 8 %, rare
≤ 20 %, uncommon ≤ 45 %, else common) and recomputed by the same job.

### 2.2 Storage: materialized stats, not on-read joins

```ts
// contracts PR #2 (additive)
placeStats: {
  placeId uuid pk -> places.id,
  collectors int, editions int, saves int,
  recommend int, depends int, skip int,
  editions7d int, editions8wAvg real,
  discoveryFreq real, trendingScore real,
  computedAt timestamptz
}
userStats: {
  userId uuid pk -> users.id,
  placesVisited int, editions int, citiesVisited int,
  currentStreakWeeks int, longestStreakWeeks int,
  globalRank int, cityRanks jsonb,      // { "Los Angeles": 12, ... }
  computedAt timestamptz
}
activityEvents: {
  id uuid pk, userId uuid, kind text,   // edition | ranking | note | set_complete | friend
  placeId uuid null, refId uuid null, payload jsonb, createdAt timestamptz,
  index (userId, createdAt desc)
}
```

`activityEvents` rows are written inside the existing transactions
(`createEdition`, `putRanking`, note create, friendship accept) so the feed is
append-only and cheap to page. `placeStats`/`userStats` are recomputed by
`src/lib/server/stats.ts#recomputeStats({ placeIds?, userIds? })`:

- incremental: called after each write with the affected IDs (same tx, one
  aggregate query per table);
- full: `scripts/recompute-stats.ts` for backfill and for the trending window
  roll (cron/maintenance step).

Friend-relative metrics (`friendsBeen`, `friendsSaved`, `tasteOverlap`) are
computed on read; they are a join against ≤ a few hundred friend IDs.

### 2.3 API

| Route                                    | Method       | Notes                                                                                  |
| ---------------------------------------- | ------------ | -------------------------------------------------------------------------------------- |
| `/api/friends`                           | GET          | accepted + pending (incoming/outgoing) with `ProfileDto` + `tasteOverlap`             |
| `/api/friends/[userId]`                  | PUT / DELETE | request or accept (PUT is idempotent; accept when reverse pending exists) / remove     |
| `/api/friends/search?q=`                 | GET          | handle/display-name search, excludes self                                              |
| `/api/feed?cursor=`                      | GET          | `activityEvents` of accepted friends, keyset pagination on `(createdAt, id)`           |
| `/api/places/[slug]`                     | GET          | `PlaceDetailDto` gains `stats: PlaceStatsDto`, `social: { friendsBeen, friendsSaved, recommendRate }` |
| `/api/places/trending?city=`             | GET          | top N by `trendingScore`                                                               |
| `/api/me`                                | GET          | gains `stats: UserStatsDto`                                                            |
| `/api/users/[handle]`                    | GET          | public profile + stats + set completion; editions only if friend                       |
| `/api/leaderboard?city=&scope=friends\|city\|global` | GET | ranked `users` by `placesVisited`                                              |

Zod: `friendPutSchema` (empty strict body), `feedQuerySchema` (`cursor?`,
`limit ≤ 50`), `leaderboardQuerySchema`. Every route stays behind `withApiUser`
except `/api/places/trending` (public, cached 5 min via `Cache-Control`).

Privacy rules: a user's editions/notes are visible to accepted friends only
(and `public` notes to all); stats counts are visible to everyone; `feed`
never includes `private` notes.

### 2.4 Frontend wiring

Mobile: replace `fictionalEditions`/`socialActivity` fixtures with
`/api/feed`; `app/friend/[userId].tsx` → `/api/users/[handle]`;
`features/social/AccountFriends.tsx` + `InvitationSheet.tsx` → `/api/friends*`;
`features/discovery/PlaceSignals.tsx` renders `stats.discoveryFreq` (with
"n of collectors in {city}" explainer) and `social.friendsBeen`; Profile tiles
→ `me.stats`. Web: `src/app/friends`, `src/app/profile`, `places/[slug]`,
`discover` "Trending" rail; new `src/lib/web/social.ts`.

## 3. Phase C — 1000-account, multi-city seeding and verification

### 3.1 Target environments

| Env                   | What                                                                                                   | Use                                                                       |
| --------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| **Local full stack** (primary) | Supabase CLI `supabase start` (Postgres + Auth + Storage in Docker; CLI needs adding to the blueprint) + `next start` on :3000 | The full 1000-account run, repeatable, destroyed after each run |
| **Disposable Postgres only**   | Existing `check-persistence.mjs` harness, test auth guard, mock Storage                       | Fast CI-sized run (100 accounts, 3 cities) on every PR                    |
| **Hosted shared project**      | Existing Supabase project with the stored `SUPABASE_*` secrets                                | Smoke only: 25 accounts, 1 city, tagged and cleaned up by recorded ID; never the 1000 run |

Rationale: hosted Auth has admin rate limits and the environment rule forbids
bulk data in the shared project; the local Supabase stack runs the identical
Auth/Storage code, so the 1000 run is faithful without polluting production.

### 3.2 Scripts (`scripts/load/`, all `--apply` gated, all idempotent by `runId`)

```
scripts/load/
  run.ts               orchestrator: --run-id --accounts 1000 --cities lisbon,tokyo,... --env local|pg|hosted
  cities.json          8 cities with bbox + timezone: Los Angeles, New York, Mexico City, Lisbon,
                       Paris, Cairo, Tokyo, Sydney
  ingest.ts            Phase A `ingest-city.ts` per city (OSM+Wikidata live, or recorded fixtures with --offline)
  accounts.ts          admin.createUser (email `souvenir-load-<runId>-<n>@example.invalid`, email_confirm: true)
                       -> signInWithPassword -> bearer token; users row via first GET /api/me
  personas.ts          deterministic seeded RNG (seed = runId): home city, taste categories,
                       activity level (lurker 40 % / regular 45 % / power 15 %), 0-40 friends
  behaviors.ts         per persona, through the public API with bearer auth:
                         POST /api/capture/upload + upload bytes + POST /api/editions (5-120 each)
                         PUT /api/rankings/[placeId], PUT /api/me/places/[placeId]
                         POST /api/wishlists, PUT items, POST members
                         POST /api/places/[slug]/notes, PUT tags
                         PUT /api/friends/[userId] both directions for accept
  timeline.ts          backdates capturedAt over 18 months so streaks/trending are non-trivial;
                       DB-only step: UPDATE editions SET captured_at (API forbids future/backdated writes
                       beyond validation window) + INSERT activity_events with matching timestamps
  images.ts            §3.4
  verify.ts            §3.5 assertions
  cleanup.ts           deletes by recorded IDs from `scripts/load/runs/<runId>.json` (accounts,
                       places with source=user, storage objects); hosted mode requires it to succeed
```

Data volume per 1000-account run (targets): ~8 cities × 150–400 places
= ~2000 places; ~35k editions; ~12k rankings; ~3k wishlists; ~9k notes; ~15k
friendships; ~35k storage objects (or 35k `photoPath` references to a shared
pool, see §3.4).

Write path rule: everything a real client can do goes **through the API** so
validation, transactions, `activity_events` and stats hooks are exercised;
only backdating and bulk `place_stats` recompute touch the DB directly, and
both are also what production maintenance jobs would do.

### 3.3 Concurrency and rate limits

- API writes: worker pool of 16 concurrent personas, each sequential; retries
  with jitter on 429/503; `requestId` reuse on retry to prove idempotency.
- Local Auth `createUser`: 8 concurrent.
- Hosted smoke: 2 concurrent, 25 accounts.
- Provider ingest: Overpass ≤ 1 req/s, Wikidata ≤ 5 req/s, results recorded to
  `scripts/load/fixtures/<city>.json` so CI and reruns are `--offline`.

### 3.4 Images: stock photos for dummy data

Two distinct image classes with different licensing and pipelines.

**Place hero images (catalog, shown to everyone)**

- Source: Wikimedia Commons via Wikidata `P18` (already in Phase A). Store
  `license`, `attribution`, `sourcePageUrl` in `place_images`; only accept
  CC0 / CC-BY / CC-BY-SA / PD; skip files with `NoDerivatives` or
  `NonCommercial`.
- Request `?width=1280` thumbnails; upload a copy into a **public**
  `place-images` bucket (separate from private `captures`) so the app never
  hotlinks Commons; keep the original URL in `place_images.sourcePageUrl`.
- Fallback when no P18: deterministic category placeholder generated locally
  (SVG → PNG via `sharp`, brand teal gradient + category icon), `provider =
  "placeholder"`, so the UI can show a "No photo yet" state honestly.
- `scripts/load/images.ts --heroes` runs after ingest; ~2000 images, ~15 min
  at 5 req/s.

**User edition photos (private, per account)**

- Source: **Lorem Picsum** (`https://picsum.photos/seed/<seed>/1200/900`,
  free, no key, Unsplash-licensed photos) with `seed = sha1(runId:placeId:k)`
  so reruns are byte-identical. Alternative if a key is available: Pexels API
  (free, `PEXELS_API_KEY`, query by category e.g. "museum interior") for
  more relevant imagery — chosen per city via `cities.json` `photoQueries`.
- Build a **shared pool** of 600 photos (75 per category × 8 categories, 3
  sizes: 1200×900, 900×1200, 1200×1200) once into
  `scripts/load/cache/photos/` (gitignored, ~250 MB). Each edition picks
  pool photo `hash(editionSeed) mod 600`; 30 % of editions get a light
  variation (crop/rotate/brightness via `sharp`) so `mediaFingerprint`
  dedupe in the mobile import path is exercised with both exact and
  near-duplicates.
- Upload goes through the real path: `POST /api/capture/upload` → signed
  token → `uploadToSignedUrl` → `POST /api/editions` with `photoPath`. Local
  stack stores 35k objects (~10 GB); to keep it manageable use `--photo-mode
  pool` (default: 35k uploads but from 600 distinct byte arrays) or
  `--photo-mode sparse` (photos on 20 % of editions, rest `photoPath = null`,
  which is also realistic for imported visits).
- Never use Picsum/Pexels images as **place** heroes: they are not photos of
  the place. Keep the classes separate so provenance chips stay truthful.
- Avatars: `users.avatarUrl` from DiceBear (`/9.x/thumbs/svg?seed=<handle>`),
  free, generated, no faces of real people.

Licensing summary to record in `docs/design/image-licensing.md`: Commons
(per-file, attributed), Picsum/Unsplash License (free incl. commercial, no
attribution required, not for a competing stock service), Pexels License
(similar), DiceBear thumbs (CC0).

### 3.5 Verification (`scripts/load/verify.ts` + vitest integration)

API-level (bearer as random personas):

- `GET /api/me` stats match SQL ground truth for 50 sampled users (places,
  streak, rank).
- `GET /api/places/[slug]` `stats.discoveryFreq` and `social.friendsBeen`
  match SQL for 100 sampled (viewer, place) pairs including zero-friend users.
- Feed: no private notes, no non-friend editions, cursor pagination covers
  exactly N events with no duplicates.
- Leaderboard: ordering strictly by `placesVisited`, tie-break stable.
- Privacy negatives: non-friend `GET /api/users/[handle]` has no editions;
  foreign edition photo → 404.
- Idempotency: replayed `POST /api/editions` with same `requestId` returns the
  same edition; parallel friend PUTs both directions yield one `accepted` row.
- Latency budget at 1000 accounts: p95 < 300 ms for `GET /api/places/[slug]`,
  `/api/feed`, `/api/places/nearby` against the local stack (recorded to
  `runs/<runId>.json`, compared against the previous run).

DB-level (direct SQL):

- Referential integrity, no orphan `activity_events`, `place_stats.computedAt`
  ≥ latest write for touched places.
- `discoveryFreq ∈ [0,1]`, rarity tier percentiles match spec per city.
- Recompute `scripts/recompute-stats.ts` full → results identical to
  incremental values (drift check).
- `EXPLAIN` on feed / nearby / leaderboard queries uses the new indexes
  (`activity_events(user_id, created_at)`, `places(geohash)`, `editions(place_id, captured_at)`).

Front-end spot check (testing agent, after the run): place screen in the
screenshot shows a real frequency ("Collected by 12 % of collectors in Los
Angeles"), friends-been row, and Discover shows "Trending in Lisbon".

### 3.6 Cleanup and safety

- `runs/<runId>.json` records every created auth ID, place ID (user-created),
  wishlist ID, and storage path as it goes; `cleanup.ts` deletes only those.
- Hosted mode refuses `--accounts > 50` and refuses to run without
  `--env hosted --i-understand-shared-project`.
- Local stack is torn down with `supabase stop --no-backup`.

## 4. Phase D — subagent strategy

Principle: one PR per branch per AGENTS.md ownership; contracts land first in
isolation; adapters and load tooling are network-free in CI via recorded
fixtures; the lead integrates and reviews. Each subagent gets: the two design
docs, its section numbers, the exact branch, the done-criteria below, and
"do not touch `schema.ts`/`schemas` outside a contracts PR".

### 4.1 Waves

**Wave 0 — contracts (sequential, lead-authored, 1 session)**

- `contracts/places-global-metadata`: A §1 (places columns, place_sources,
  place_images, place_notes, place_tags, place_suggestions, coverage_cells).
- `contracts/social-stats`: B §2.2 (place_stats, user_stats, activity_events)
  + friend/feed/leaderboard Zod + DTOs.
  Both include migrations, RLS SQL, `serializePlaceDto` extension, and
  `tests/contracts` updates. Nothing else starts until these merge (other
  agents can branch off the contracts branch, rebasing after squash).

**Wave 1 — parallel, 5 subagents, ~1 session each**

| #   | Branch             | Scope                                                                                                                                                   | Done when                                                                                                                              |
| --- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| S1  | `feat/search`      | A §2.2 `src/lib/places/*` (osm, wikidata, wikimedia, mock, categorize, normalize, dedupe), `scripts/ingest-city.ts`, recorded fixtures for 8 cities    | `--offline` ingest of 8 fixture cities into disposable PG; unit tests on categorize/dedupe; no network in vitest                        |
| S2  | `feat/search`      | A §2.3-2.4 `GET /api/places/nearby`, `SearchService.nearby` (pg + es), lazy fill + coverage_cells, conditions route with OSM hours                     | nearby returns provider-filled results on an empty cell in the persistence harness; ES mapping documented                             |
| S3  | `feat/collection`  | A §3 notes/tags/images/suggestions routes, `POST /api/places` + 409 dedupe, `getPlaceDetail`, tip mirror                                                | persistence integration tests for each route incl. visibility rules                                                                    |
| S4  | `feat/social`      | B §2.2-2.3 `stats.ts` incremental + full recompute, friends/feed/leaderboard/users routes, `activity_events` hooks in editions/rankings                 | drift check (incremental == full) passes on harness data; privacy negatives tested                                                     |
| S5  | `feat/search`      | C §3.2 load scripts skeleton: `run.ts`, `accounts.ts`, `personas.ts`, `behaviors.ts` against **current** API only, `cleanup.ts`, `runs/` recording; C §3.4 image pool builder + placeholder generator | 100-account/1-city run on the persistence harness end-to-end; cleanup leaves zero rows; pool builder produces 600 photos offline-cached |

S5 is intentionally started before S3/S4 land: it targets existing routes
first and adds notes/friends behaviors in Wave 2, which keeps the harness
ready when the features arrive.

**Wave 2 — parallel, 3 subagents, after Wave 1 merges**

| #   | Branch                          | Scope                                                                                                                          | Done when                                                                                       |
| --- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| S6  | `feat/collection` (mobile+web)  | A §4 wiring: PlaceSearchSheet nearby, bootstrap mapping, place detail notes/tags/gallery, SourceChip, web hooks                | mobile `npm test`, `npx expo-doctor`, web `pnpm test`; screenshots of place detail with real data |
| S7  | `feat/social` (mobile+web)      | B §2.4 wiring: feed, friends, profile stats, leaderboard, trending rail, PlaceSignals frequency                                | same gates; screenshot replaces the "Unavailable" rows in the attached place screen             |
| S8  | `feat/search`                   | C §3.2 `behaviors.ts` notes/friends/tags, `timeline.ts`, `verify.ts`, local Supabase CLI stack in blueprint, hosted smoke mode | 1000-account/8-city run on local stack passes §3.5; hosted 25-account smoke passes and cleans up |

**Wave 3 — lead + testing agent**

- Lead runs the 1000-account run once on the local stack, reviews
  `runs/<runId>.json` metrics, and opens the wrap-up PR with the recorded
  results.
- Testing agent drives Expo web + Next.js against the seeded local stack for
  the golden path (Discover → place with stats → capture → feed).
- Full `pnpm lint/format:check/typecheck/test/build` and mobile gates once.

### 4.2 Coordination rules for subagents

- Shared surfaces are append-only: `src/components/ui/*`, `shared/api-contract.ts`
  (DTO additions only), `src/lib/env.ts` (each agent adds only its keys:
  S1 `PLACES_PROVIDER`, `OVERPASS_URL`, `NOMINATIM_USER_AGENT`; S5 `PEXELS_API_KEY?`).
- No agent runs anything against the hosted project except S8's smoke mode,
  and only with the `--i-understand-shared-project` flag.
- Every PR body lists: routes added, env keys added, harness command that
  proves it, and the fixture files recorded.
- Merge order inside a wave does not matter; conflicts are limited to
  `env.ts` and `api-contract.ts` by construction.

### 4.3 Estimate

Wave 0: 1 session (lead). Wave 1: 5 parallel sessions. Wave 2: 3 parallel
sessions. Wave 3: 1 session. External waits: none for OSM/Wikidata; a Pexels
key only if preferred over Picsum; Supabase CLI added to the blueprint.

## 5. Decisions needed before Wave 0

1. Primary 1000-account environment: local Supabase CLI stack (proposed) vs a
   second, dedicated hosted Supabase project.
2. Edition photo source: Picsum (no key, less relevant) vs Pexels (key,
   category-relevant).
3. `--photo-mode` default for the big run: `pool` (35k uploads) vs `sparse`
   (20 % of editions).
4. Feed privacy default for editions: friends-only (proposed) vs public.
5. Whether `rarityTier` should be recomputed from `discoveryFreq` (proposed)
   or stay curated.

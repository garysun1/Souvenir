# Worldwide and social contracts

This is the integration reference for the contracts PR. It defines storage and
transport interfaces; new route handlers, aggregation jobs and provider adapters
are implemented by their component owners. Existing URLs, opaque `stats` JSON,
rarity fields and private tips retain their meanings.

## Imports and ownership

| Surface                                                               | Owner / exports                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/lib/db/schema.ts`, `drizzle/`, generated snapshots               | Contracts owner only. New tables: `placeSources`, `placeImages`, `placeNotes`, `placeTags`, `placeSuggestions`, `coverageCells`, `placeStats`, `userStats`, `activityEvents`. Existing `places`, `users`, `editions`, `rankings`, `wishlistSaves`, `friendships` gain metadata, visibility or indexes.                                                                                                                                                                 |
| `src/lib/contracts/api.ts`                                            | Contracts owner. Re-exports worldwide request schemas and metric disclosure schemas. Existing edition/ranking/save/profile inputs accept optional visibility preferences.                                                                                                                                                                                                                                                                                              |
| `src/lib/contracts/worldwide.ts`                                      | `placeCreateSchema`, `placeNoteCreateSchema`, `placeNotePatchSchema`, `placeTagPutSchema`, `placeSuggestionSchema`, `placeImagePromoteSchema`, `nearbyQuerySchema`, `boundingBoxSchema`, `placeListQuerySchema`, `userIdParamsSchema`, `placeSlugParamsSchema`, `placeNoteParamsSchema`, `friendPutSchema`, `friendSearchQuerySchema`, `feedCursorSchema`, `feedQuerySchema`, `leaderboardQuerySchema`, `trendingQuerySchema`, `encodeFeedCursor`, `decodeFeedCursor`. |
| `src/lib/contracts/metrics.ts`                                        | `placeMetricsSchema`, `METRIC_DEFINITION_VERSION = 1`, `MINIMUM_PUBLIC_SAMPLE = 5`. Validate computed responses before publishing them.                                                                                                                                                                                                                                                                                                                                |
| `src/lib/contracts/primitives.ts`                                     | `uuidSchema`, `instantSchema`, `timezoneSchema`.                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `src/lib/schemas/worldwide.ts`                                        | `visibilitySchema`, `placeSourceSchema`, `sampleStatusSchema`, `countrySchema`, `latitudeSchema`, `longitudeSchema`, `httpUrlSchema`; re-exported by `src/lib/schemas/index.ts`.                                                                                                                                                                                                                                                                                       |
| `src/lib/contracts/serializers.ts`                                    | `serializePlaceSourceDto`, `serializePlaceImageDto`, `serializeSocialProfileDto`, `serializeSocialEditionDto`. Allowlist projections, not authorization functions. Call only after checking access.                                                                                                                                                                                                                                                                    |
| `shared/worldwide-contract.ts`                                        | Re-exported by `shared/api-contract.ts`. Types listed below, plus `WORLDWIDE_ROUTES`. Owned by contracts; consumed by frontend/backend.                                                                                                                                                                                                                                                                                                                                |
| Destination services, provider adapters, root env extensions/examples | Destinations owner. Use contracts and existing verified auth; do not edit frozen contracts.                                                                                                                                                                                                                                                                                                                                                                            |
| Social services, aggregators, social routes                           | Social/backend owners. Live visibility checks, invalidation and formulas below are required.                                                                                                                                                                                                                                                                                                                                                                           |
| UI consumers                                                          | Frontend owners. Render nullable locality and metric/source status. No fixture metrics in account mode.                                                                                                                                                                                                                                                                                                                                                                |
| Local scripts/config/package dev tooling, 1000-account load harness   | Load owner. Disposable resources only; no hosted credentials or real email delivery.                                                                                                                                                                                                                                                                                                                                                                                   |
| Integration PR, final browser validation                              | Backend integrator / parent final verifier.                                                                                                                                                                                                                                                                                                                                                                                                                            |

Shared exports include:

- Scalars/unions: `Visibility`, `PlaceSource`, `SampleStatus`, `RetentionPolicy`,
  `PlaceNoteKind`, `SuggestionStatus`, `PlaceCorrection`, `PlaceCorrectionValue`.
- Metadata writes: `PlaceCreate`, `PlaceNoteCreate`, `PlaceNotePatch`, `PlaceTagPut`,
  `PlaceSuggestionCreate`, `PlaceImagePromote`.
- Metadata results: `PlaceNoteDto`, `PlaceTagsDto`, `PlaceSuggestionDto`,
  `PlaceSourceDto`, `PlaceImageDto`, `DocumentedAvailabilityDto`, `PlaceDetailDto`.
- Queries/results: `BoundingBox`, `NearbyQuery`, `NearbyPlaceDto`, `NearbyDto`,
  `FeedCursor`, `FeedQuery`, `FeedDto`, `LeaderboardQuery`, `LeaderboardEntryDto`,
  `LeaderboardDto`, `TrendingQuery`, `TrendingDto`, `DeleteDto`.
- Metrics/social: `PlaceMetricsDto`, alias `PlaceStatsDto`, `PlaceSocialDto`,
  `CityRankDto`, `UserStatsDto`, `SetCompletionDto`, `SocialProfileDto`, `FriendDto`,
  `FriendsDto`, `SocialEditionDto`, `UserDetailDto`, `ProfileStatsDto`,
  discriminated `ActivityEventDto`.

## Route integration contract

All routes require verified Next API auth and existing `{ data }` / `{ error }`
envelopes. Dynamic IDs are UUIDs; slugs remain stable. User-scoped responses use
`Cache-Control: private, no-store`. Route handlers are responsible for this;
declaring a DTO or constant does not implement a route.

| Method and route                       | Validation                                                 | Data result                                                                                                         |
| -------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| GET `/api/places`                      | `placeListQuerySchema`                                     | Existing place list with additive `PlaceDto` fields                                                                 |
| POST `/api/places`                     | `placeCreateSchema`                                        | `PlaceDto`                                                                                                          |
| GET `/api/places/nearby`               | `nearbyQuerySchema`                                        | `NearbyDto` candidates, never an automatic selection                                                                |
| GET `/api/places/[slug]`               | `placeSlugParamsSchema`                                    | `PlaceDetailDto`                                                                                                    |
| GET `/api/places/[slug]/sources`       | `placeSlugParamsSchema`                                    | `PlaceSourceDto[]`                                                                                                  |
| GET `/api/places/[slug]/images`        | `placeSlugParamsSchema`                                    | `PlaceImageDto[]`                                                                                                   |
| POST `/api/places/[slug]/images`       | `placeImagePromoteSchema`                                  | `PlaceImageDto`                                                                                                     |
| GET `/api/places/[slug]/notes`         | `placeSlugParamsSchema`                                    | `PlaceNoteDto[]` filtered by current access                                                                         |
| POST `/api/places/[slug]/notes`        | `placeNoteCreateSchema`                                    | `PlaceNoteDto`                                                                                                      |
| PATCH `/api/places/[slug]/notes/[id]`  | `placeNoteParamsSchema`, `placeNotePatchSchema`            | `PlaceNoteDto`                                                                                                      |
| DELETE `/api/places/[slug]/notes/[id]` | `placeNoteParamsSchema`                                    | `DeleteDto`                                                                                                         |
| GET/PUT `/api/places/[slug]/tags`      | `placeSlugParamsSchema`, PUT `placeTagPutSchema`           | `PlaceTagsDto`                                                                                                      |
| POST `/api/places/[slug]/suggestions`  | `placeSuggestionSchema`                                    | `PlaceSuggestionDto`                                                                                                |
| GET `/api/places/[slug]/conditions`    | Existing route contract                                    | Existing response; no invented hours/prices. `PlaceDetailDto.availability` adds documented hours/status separately. |
| GET `/api/places/trending`             | `trendingQuerySchema`                                      | `TrendingDto`                                                                                                       |
| GET `/api/friends`                     | Auth only                                                  | `FriendsDto`                                                                                                        |
| GET `/api/friends/search`              | `friendSearchQuerySchema`                                  | `SocialProfileDto[]`                                                                                                |
| PUT/DELETE `/api/friends/[userId]`     | `userIdParamsSchema`, PUT `friendPutSchema` (empty object) | `FriendDto` / `DeleteDto`                                                                                           |
| GET `/api/users/[userId]`              | `userIdParamsSchema`                                       | `UserDetailDto` (friend detail uses userId, never handle)                                                           |
| GET `/api/feed`                        | `feedQuerySchema`                                          | `FeedDto`                                                                                                           |
| GET `/api/me`                          | Existing auth/profile contract                             | `ProfileDto` with optional stats and visibility preferences                                                         |
| GET `/api/me/stats`                    | Auth only                                                  | `ProfileStatsDto`                                                                                                   |
| GET `/api/leaderboard`                 | `leaderboardQuerySchema`                                   | `LeaderboardDto`                                                                                                    |

Nearby radius is 50–50,000 meters (default 1,500), limit 1–50 (default 25).
Bounding boxes allow `west > east` for antimeridian crossing: use
`lng >= west OR lng <= east` in that case, and AND otherwise. South must be at
most north. SQL coarse bounds/geohash prefilter candidates; distance filtering
and sorting use actual coordinates. `city` filters require ISO alpha-2 `country`;
do not join cities solely by name. Provider external IDs use `(provider,
providerId)` uniqueness; OSM IDs must include object kind, e.g. `node/123`.

## Visibility, authorization and mutation hooks

- The authenticated actor supplies every owner/user ID. Request bodies reject
  `ownerId` and `userId`. Verify target ownership and place visibility on every
  read/write, including direct slug lookups, search, catalog/bootstrap, nearby,
  sets, feed and aggregate queries. `places.ownerId` is required for source
  `user`; creation services must explicitly default user places to `private`
  (the catalog default remains public to preserve existing places).
- Existing editions/rankings/saves and new notes/tags/events default to private;
  user stats visibility defaults to private. Mutations accepting a visibility
  input must persist it explicitly. Existing services do not yet implement
  these new fields. Public aggregate contributions require public records on
  public places. Owner profile counts can use all owned records; expose another
  user's stats only according to their current `statsVisibility`.
- Legacy `place_preferences.tip` is preserved in place. Do not copy it to a
  public note. Optional later migration to `place_notes` must set
  `legacyTip=true`, `kind=tip`, `visibility=private`; SQL prevents sharing that
  legacy record. A new explicitly authored note may be shared separately.
- `place_sources.payload` and private capture URLs/paths are excluded from
  the new serializers. Social editions also omit notes, companions and import
  identifiers. `ActivityEventDto` is a typed union, not a generic payload.
  Never spread a storage row into a social response.
- Events and target writes must share a transaction. Edition/note event FKs
  enforce actor/place consistency and cascade deletion; ranking events cascade
  through `(userId, rankingPlaceId)`. A friendship deletion/downgrade removes
  pair-specific friendship events via a security-invoker trigger. Feed reads
  must still join current accepted friendships and current target visibility;
  the trigger does not authorize other event kinds. Removing a friend must
  remove both possible directional relationship rows transactionally.
- Recheck set completion from accessible editions; delete obsolete completion
  events when an edition is removed. Relationship and visibility checks apply
  even to pages requested with an older feed cursor. Never cache friend counts
  (`PlaceSocialDto.friendsBeen/friendsSaved`), feeds, friend leaderboards or
  friend profiles in global stats rows or shared caches.
- Feed order is `(createdAt DESC, id DESC)` and pagination uses the strict
  less-than tuple. Cursors contain only timestamp + event UUID.
- Friend PUT means send a pending request, accept an incoming pending request,
  or replay the existing relationship. Lock the unordered pair before checking
  both orientations; do not treat an outgoing request as accepted.
- Use the existing `apiRequests` ledger for every request-ID mutation, including
  custom places, notes, corrections and image promotion. Operation names must
  distinguish writes, bind the normalized body hash and actor, reject conflicting
  reuse, and retain deletion tombstones. Unique table keys are a backstop, not
  a complete replay protocol. Tag replacement and DELETE are naturally
  idempotent. Website corrections may have SQL/JSON null to mean clear; other
  fields require a value. Only accepted corrections may change canonical data.
- Image promotion needs both explicit public confirmation and rights
  confirmation. Verify the edition belongs to the actor and target place,
  then create a separate consented public derivative under `place-images/`.
  Do not reclassify the private original or publish its signed URL.
- Coverage leases use atomic insert/update with `leaseToken` and `leaseUntil`.
  Only the matching token may finish a refresh; obey retry/expiry timestamps.

## Metrics, provenance and invalidation

`PlaceDto.metrics` is optional/null until computed. Its fields are
`collectors`, `editions`, `saves`, `discoveryFreq`, `frequency`, `recommendRate`,
`sentiment`, `trendingScore`, `trend`, `sampleStatus`, `provenance`,
`definitionVersion`, `computedAt`. Do not reinterpret old `PlaceDto.stats` or
rarity fields as these metrics.

- Frequency: at one UTC as-of instant, use `[asOf-90d, asOf)`.
  `frequency.visitors90d` counts distinct public-contributing visitors at this
  place. `frequency.cityVisitors90d` counts distinct visitors at **any** public
  place in the same canonical city + country, including this place. Repeat
  editions do not increase either count. `discoveryFreq = numerator / denominator`.
  Missing locality, zero denominator or denominator below five yields null,
  with unavailable/insufficient status. Persist cohort `city` and `country` in
  `placeStats` so metadata edits cannot silently relabel an old denominator.
- Trend: `trend.collectors7d` counts distinct collectors in `[asOf-7d, asOf)`.
  The baseline consists of the eight latest complete UTC ISO weeks (Monday
  00:00 boundaries) whose end is at or before `asOf-7d`. Each array entry counts
  distinct collectors within that week; a collector may occur in multiple
  weeks. `collectors8wAvg = sum(weeklyCollectors8w) / 8`;
  `trendingScore = collectors7d / collectors8wAvg`. Zero baseline yields null,
  never Infinity. Do not substitute 56-day unique users divided by eight.
- Recommendation share uses current distinct users' public rankings:
  `recommend / (recommend + depends + skip)`, null below five total raters.
  `depends` stays in the denominator. No scarcity, appeal or availability proxy.
- Documented availability holds sourced hours, timezone, source UUID and fetched
  time. Unknown remains null; stale is explicit. Personal appeal remains its
  own concept.
- Global `placeStats` holds public contributions only; owner `userStats` can
  cache owned counts but authorization is checked live. Compute set completion
  for the requesting audience. Rank ties by equal place count with deterministic
  UUID ordering for pagination. City ranks use city + country. Exclude unknown
  locality from city counts/ranks. Current and longest streaks count consecutive
  UTC ISO weeks; current streak includes last week until the current week ends.
- Recompute/invalidate affected public place and city-cohort stats, owner stats,
  ranks and set completion after edition/ranking/save insert, edit, deletion or
  visibility changes, and after place locality/visibility changes. Never serve
  a cached private contribution after revocation. Per-metric statuses are
  derived from sample sizes/locality and cache freshness; do not mark the
  whole result ready just because one component is available.

## Source licensing and public configuration

Retention is source-specific, not a generic timer. `placeSources` records
`retentionPolicy`, `retainedFields`, `policyUrl`, `policyCheckedAt`, license,
attribution, fetched/expiry times and status. Metadata-only/do-not-store rows
cannot hold payloads. Expiring rows need a future expiry; any payload requires
a reviewed policy reference. This contract conservatively disallows Google
payload storage; Google place IDs are separate identifiers. Adapters must purge
expired payloads and derivatives and avoid persisting disallowed fields in
canonical metadata or old `stats`.

Review current provider terms before using data:
[Google Places policies](https://developers.google.com/maps/documentation/places/web-service/policies),
[OSM attribution guidance](https://osmfoundation.org/wiki/Licence/Attribution_Guidelines),
[ODbL](https://opendatacommons.org/licenses/odbl/1-0/),
[Nominatim policy](https://operations.osmfoundation.org/policies/nominatim/).
OSM attribution alone does not settle ODbL database/share-alike obligations.
Public Nominatim is not a bulk-production backend. Commons images require
per-file license/attribution review. Licensing columns do not themselves grant
rights. Nearby results and images require user-confirmed selection.

`shared/public-supabase-config.ts` is shared by root/mobile configuration.
Publishable keys remain preferred. Local loopback/Android-emulator URLs also
accept syntactically valid HS256 JWTs with **exactly** `role=anon`, rejecting
service-role/secret keys and remote JWT configuration. This is a configuration
classifier, not JWT authentication: Supabase must still verify requests.
CLI 2.54.11 `status --help` was executed, and its official source confirms
`PUBLISHABLE_KEY` and legacy `ANON_KEY` outputs. No repository CLI dependency or
load configuration is installed by this PR.

## Validation and migrations

Drizzle generated schema SQL and snapshots. The custom migration enables RLS
and revokes PUBLIC/anon/authenticated privileges for every new table, matching 0004. Apply all migrations atomically using the existing migrator. SQL generation
placed composite FKs before referenced unique constraints in 0007; those SQL
statements were reordered, without editing generated snapshots.

Disposable checks (clear ambient hosted credentials first):

```sh
pnpm lint
pnpm format:check
pnpm typecheck
npm --prefix apps/mobile run typecheck
pnpm test
node tests/contracts/check-migrations.mjs
node tests/contracts/check-worldwide.mjs
node tests/server/check-persistence.mjs
node tests/auth/check-profiles.mjs
node tests/contracts/check-catalog.mjs --build
```

The new PostgreSQL check creates permissive default grants before migrations to
verify they are actually revoked, then tests denial even after SELECT privileges
are temporarily restored. It also verifies existing-data preservation, unknown
locality, replay uniqueness, retention checks, private tips/media, composite
event ownership, deletion cascades, friendship revocation and metric guards.
Unit checks cover malformed inputs, minimum cohorts, complete trend windows,
null zero-baseline rates, allowlisted serialization and local public keys.

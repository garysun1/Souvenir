# Worldwide backend integration

This backend is based on `contracts/worldwide-social`. The implementation branch
is `feat/collection-worldwide`; merge the contracts separately before retargeting
the implementation. No frontend, mobile, hosted database or production provider
configuration is included.

## Client interfaces

All personal operations use verified bearer or cookie authentication, Zod input
validation, `{ data }` / `{ error }` envelopes and private, non-cacheable responses.
Never send an owner UUID as a substitute for authentication.

| Interface                                          | Behavior                                                                                                                                       |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/me`                                      | Existing profile fields plus `stats: UserStatsDto \| null`.                                                                                    |
| `GET /api/me/stats`                                | `ProfileStatsDto`: profile fields plus stats, including set completion and taste overlap.                                                      |
| `GET /api/bootstrap`                               | Viewer-authorized catalog, sets, collection, lists, rankings, preferences and plans.                                                           |
| `GET /api/places`                                  | Public anonymous catalog; verified viewers can also read authorized custom places. Cursor pagination retains the legacy data array.            |
| `POST /api/places`                                 | Private-by-default custom place; duplicate conflicts disclose only accessible candidates.                                                      |
| `GET /api/places/{slug}`                           | Anonymous public base place; authenticated `PlaceDetailDto` with images, notes/tags, source metadata, social counts, metrics and availability. |
| `GET /api/places/search`, `GET /api/places/nearby` | Public discovery-eligible catalog only. Private and unverified custom places are excluded even for their owner.                                |
| `GET /api/places/{slug}/conditions`                | Documented availability and freshness; unverified current conditions stay unknown.                                                             |
| Place notes, tags, suggestions, sources and images | See [metadata services](place-metadata-services.md) for route/input details.                                                                   |
| Friends, feed, users, leaderboard and trending     | See [social services](social-services.md) for routes and transaction hooks.                                                                    |

Metrics describe actual Souvenir activity. Small samples retain null rates and
explicit insufficient/unavailable statuses. Private custom places have no public
aggregate metrics. Friend visit/save counts are computed for the requesting viewer.
Availability comes from current documented provider evidence, never from a fixture
or inferred current opening state. Legacy rarity fields remain compatibility data;
use the explicit metrics/status fields rather than interpreting zero as certainty.

Authenticated bootstrap passes the verified viewer through all catalog joins.
Collections, shared wishlists, ranking references, preferences and saved plans
recheck custom-place access. A shared plan must contain places visible to all
participants when created; if access is later revoked, the plan is omitted from
that viewer's list and direct access returns 404.

Note creation/patch uses `syncNoteActivity` in the write transaction. Edition
deletion calls `revokeEditionPlaceImages` in the same transaction. Provider
refresh preserves canonical IDs/slugs and accepts catalog fact changes only from
a newer primary-source record; locality changes call `afterPlaceChange` in the
same transaction.

## Provider and image configuration

PostgreSQL search is the default (`SEARCH_PROVIDER=pg`). Elasticsearch is optional:
provision/synchronize `souvenir-places-v1` using the mapping/document exports in
`src/lib/search/es.ts`; hits are rehydrated and authorization-filtered in PostgreSQL.

`PLACES_PROVIDER=osm` requires `OVERPASS_URL` for live fills. Production requires a
self-hosted or contracted endpoint and `OVERPASS_MANAGED_ENDPOINT=true`.
`PLACES_LAZY_FILL=false` leaves ordinary search functional without a provider.
The disposable-only mock uses a distinct synthetic namespace; its sources report
unavailable and nearby responses never claim live provider provenance.

Use a private `captures` bucket and a separate public `place-images` bucket
with server-only writes. Promotion requires explicit public consent, confirmed
rights and a capture owned by the authenticated user. Sharp strips metadata from
the separate WebP derivative. Source captures remain private. Local load `prepare`
provisions both buckets on the loopback stack only.

Provider commands and rights/retention guidance:
[destination fixtures](../tests/places/fixtures/README.md).
No live endpoints or external Elasticsearch cluster are required for the
disposable tests. These tests do not certify production dataset/image licenses.

## Disposable local verification

Use Node `24.19.0`, pnpm `9.15.5`, Linux Docker and the pinned Supabase CLI.
The load wrapper drops ambient hosted Supabase credentials and rejects dotenv
files. Never source hosted configuration when running tests.

```sh
source "$HOME/.nvm/nvm.sh"
nvm use 24.19.0
pnpm install --frozen-lockfile
node scripts/load/exec.mjs check
node scripts/load/exec.mjs photos
node scripts/load/exec.mjs smoke --apply
```

Smoke runs real local Auth, private signed Storage transfers, the production Next
API, SQL/privacy checks, replay and scoped cleanup. Worldwide validation uses the
same server:

```sh
node scripts/load/exec.mjs start --apply
node scripts/load/exec.mjs prepare --apply
node scripts/load/exec.mjs build
node scripts/load/exec.mjs serve
# In another terminal:
node scripts/load/exec.mjs run --apply \
  --run-id worldwide-small --seed souvenir-v1 \
  --accounts 4 --editions 3 --mode worldwide --concurrency 2 --photos sparse
node scripts/load/exec.mjs cleanup --apply --run-id worldwide-small
```

The scale owner can use the exact 1,000-account command in
[the load guide](../scripts/load/README.md); that command creates 35,000 editions
and 2,000 signed captures. Worldwide reports also compare persisted incremental
place/user projections against the loopback-only full recompute CLI. Per-viewer
API results are independently checked against SQL.

Ports: Next `3300`, Supabase Auth/Storage/API `56321`, PostgreSQL `56322`, local
mail catcher `56324`. Results and manifests are ignored under `out/load/runs`.
Clean each run by its exact run ID, then stop the stack:

```sh
node scripts/load/exec.mjs stop --apply
```

Disposable service suites, with no ambient Supabase variables:

```sh
env -i PATH="$PATH" HOME="$HOME" node tests/contracts/check-migrations.mjs
env -i PATH="$PATH" HOME="$HOME" node tests/contracts/check-worldwide.mjs
env -i PATH="$PATH" HOME="$HOME" node tests/contracts/check-catalog.mjs --build
env -i PATH="$PATH" HOME="$HOME" node tests/auth/check-profiles.mjs
env -i PATH="$PATH" HOME="$HOME" node tests/server/check-persistence.mjs
env -i PATH="$PATH" HOME="$HOME" node tests/server/check-social.mjs
env -i PATH="$PATH" HOME="$HOME" node tests/places/check-destinations.mjs --build
```

## Maintenance entrypoints

`scripts/recompute-stats.ts [asOf]` rebuilds aggregates only on an explicit
loopback database. `scripts/enrich-places.ts --purge-expired --apply` removes
expired provider payloads/images under its disposable-database guard.

`scripts/cleanup-place-images.ts --apply` processes up to 100 durable orphan or
deletion intents older than one hour. Run it with Node's
`--conditions=react-server`, local Storage server credentials, and matching
`DATABASE_URL` / `PLACES_DISPOSABLE_DATABASE_URL` values. For example, the local
load wrapper exposes `cleanup-images --apply`. Repeat batches until zero.
Production scheduling/provisioning remains deployment configuration; this branch
does not install a hosted scheduler or mutate a hosted bucket.

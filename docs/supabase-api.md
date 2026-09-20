# Web/mobile persistence contract v1

This reference specifies the integration; it does not claim the routes are already
implemented. `shared/api-contract.ts` is the transport type source (type-only
imports are safe in Expo). `src/lib/contracts/api.ts` contains server request
validators. Do not import server modules or root React dependencies into mobile.
Existing frozen `src/lib/schemas` types remain compatible with legacy web views;
their `Date` fields are not the JSON wire contract.

## Transport and authentication

- Base URL is the Next.js origin. Native uses `EXPO_PUBLIC_API_URL`; Expo web uses
  that origin with explicitly allowed CORS. No public deployment is required.
- All bodies/results are JSON `{ data: T }` or
  `{ error: ErrorCode, message?: string, details?: object }`. Dates on the wire
  are ISO-8601 instants, IDs are database UUIDs, categories are
  `nature|culture|food|landmark|hidden_gem`. Use slugs only in catalog detail URLs.
- Success is 200 (including idempotent replay), first creation 201, deletion
  200 `{data:{deleted:true}}`. Never return a success envelope after a failed
  write. Private responses use `Cache-Control: private, no-store`.
- 400 `invalid_json|invalid_request`; 401 `unauthorized` (missing/expired session);
  403 `forbidden`; 404 `not_found` (also foreign private resource IDs);
  409 `conflict|idempotency_conflict`; 410 `resource_deleted`;
  422 `photo_not_uploaded`; 413 `payload_too_large`; 429 `rate_limited`;
  503 `service_unavailable`; 500 `internal_error`. Avoid raw SQL/provider errors.
- Cookie requests use Supabase SSR cookies. Mobile sends
  `Authorization: Bearer <access_token>`. If a bearer header is present, validate
  it with Supabase `auth.getUser(token)`; never fall back to cookies on invalid
  bearer credentials. Cookie auth also verifies with `getUser()`, never trusts
  `getSession()` alone. Disable the `DEV_USER_ID` bypass in real-account flows.
- Mutating cookie requests validate Origin against the app's configured origin.
  Allowlisted Expo web origins may send bearer credentials, not ambient cookie
  auth. Do not allow wildcard credentialed CORS. Handle OPTIONS centrally.
- Email/password signup, sign-in, refresh, sign-out use Supabase Auth SDK.
  Email confirmation is required: a signup without a session is pending
  confirmation, not a signed-in account. Configure approved confirmation URLs
  only in the final integration stage.
- Next.js 15 uses `src/middleware.ts` for cookie refresh (not `proxy.ts`).
  Auth owner exports `requireApiUser(request): Promise<AuthResult>` and
  `getCurrentUserId(): Promise<string|null>` from `src/lib/auth/server.ts`;
  `ensureUserProfile(auth): Promise<ProfileDto>` lives in
  `src/lib/auth/profile.ts`. `AuthResult`/`AuthContext` are exported transport
  types. Guard returns `{auth}` or `{response}`; it provisions the current user's
  profile idempotently before returning auth. Profile id = verified auth user id.
  Use a deterministic collision-safe handle such as `user_<full uuid without
hyphens>` and metadata only for a sanitized initial display name.
  Do not adopt the existing development profile or another account by email.
- Auth owner retains `createSupabaseBrowserClient` and
  `createSupabaseServerClient`; missing configuration must produce usable errors.
  Environment access remains centralized in `src/lib/env.ts`; separate public
  parsing from server-required DATABASE_URL so browser import cannot throw.

## Routes

All routes below require verified authentication except catalog reads.
Each request is validated strictly; caller-supplied owner/user IDs are rejected.
Route UUID/slug/query parameters also require validation.

| Method / path                               | Request              | `data`                                                     |
| ------------------------------------------- | -------------------- | ---------------------------------------------------------- |
| GET `/api/places?q=`                        | optional text query  | `PlaceDto[]`, complete catalog when q absent               |
| GET `/api/places/:slug`                     | slug                 | `PlaceDto`                                                 |
| GET `/api/sets`                             | none                 | `SetDto[]`                                                 |
| GET `/api/sets/:slug`                       | slug                 | `SetDto`                                                   |
| GET `/api/bootstrap`                        | none                 | `BootstrapDto`                                             |
| GET `/api/me`                               | none                 | `ProfileDto`                                               |
| PATCH `/api/me`                             | `ProfilePatch`       | `ProfileDto`                                               |
| GET `/api/me/collection`                    | none                 | `CollectionEntryDto[]`                                     |
| POST `/api/editions`                        | `EditionCreate`      | `EditionDto`                                               |
| GET `/api/editions/:id`                     | UUID                 | `CollectionEntryDto`                                       |
| PATCH `/api/editions/:id`                   | `EditionPatch`       | `EditionDto`                                               |
| DELETE `/api/editions/:id`                  | none                 | `{deleted:true}`                                           |
| POST `/api/capture/upload`                  | `PhotoUploadRequest` | `PhotoUploadDto`                                           |
| GET `/api/editions/:id/photo`               | UUID                 | `SignedPhotoDto` (404 when absent)                         |
| GET `/api/wishlists`                        | none                 | `WishlistDto[]`                                            |
| POST `/api/wishlists`                       | `WishlistCreate`     | `WishlistDto`                                              |
| PUT `/api/wishlists/:id/items`              | `WishlistItemPut`    | `WishlistDto`                                              |
| POST `/api/wishlists/:id/members`           | `{handle:string}`    | `WishlistDto`                                              |
| DELETE `/api/wishlists/:id/members/:userId` | UUID                 | `WishlistDto`                                              |
| GET `/api/wishlists/:id/overlap`            | UUID                 | `{placeIds:UUID[]}`                                        |
| PUT `/api/rankings/:placeId`                | `RankingPut`         | `{rankings:RankingDto[], rankingGroups:RankingGroupDto[]}` |
| PUT `/api/me/places/:placeId`               | `PlacePreferencePut` | `PlacePreferenceDto`                                       |
| GET `/api/outings`                          | none                 | `PlanDto[]`                                                |
| POST `/api/outings`                         | `PlanCreate`         | `PlanDto`                                                  |
| PATCH `/api/outings/:id`                    | `PlanContent`        | `PlanDto`                                                  |
| DELETE `/api/outings/:id`                   | none                 | `{deleted:true}`                                           |

Bootstrap is the authoritative refresh boundary: profile, complete catalog/sets,
all own editions, accessible wishlists/plans, own assessments/ranking groups,
favorites/private tips. It creates exactly one default personal wishlist per
profile, transactionally, and returns its actual UUID (`isDefault=true`).
Never silently truncate the catalog to its original 30 rows. Clients refetch on
foreground, successful auth change, pull-to-refresh, and completed writes.
Shared APIs export `getBootstrap(userId): Promise<BootstrapDto>` from
`src/lib/data.ts`; this takes an already verified ID for server rendering.
Preserve existing data-loader signatures and legacy `serializePlace` for web
compatibility. Add explicit wire serializers in `src/lib/serializers.ts`;
web agents must consume them without editing them.

Existing `/api/search` may retain its schema and public catalog behavior.
`/api/capture/identify`, `/api/plan`, `/api/import/dropbox`, and
`/api/places/:slug/conditions` are simulation/provider boundaries, not persistence
APIs. Require auth for private inputs. Label mock results; real capture supports
manual catalog selection. Never fetch arbitrary user image URLs server-side.
Dropbox sample imports must never upload demo editions into real accounts.

## Editions, retries, and private media

- Each logical capture generates a UUID requestId once, persisted in its draft.
  Retry reuses the same key and normalized payload; a new revisit generates a
  new key, even at the same place/date/variant.
- `api_requests` is a durable `(user_id,request_id)` ledger covering edition,
  wishlist, and outing creation. In one transaction lock/reserve the key, compare
  operation + SHA-256 of canonical validated input, mutate, record resourceId.
  Same key/different operation or input = 409. Retry returns the original
  resource (with freshly signed photos), not a second write. Keep ledger rows
  after deletion; a retry of a deleted create returns 410. Failed transactions
  must roll back both mutation and reservation. Never cache expiring signed URLs.
- `edition_counters` allocates monotonically increasing visitSequence per
  user/place with an atomic upsert in the same transaction. Deleting visits never
  resets/reuses the counter. Variant is display metadata, not a uniqueness key.
  Existing rows are backfilled without changing their IDs.
- capturedAt is an instant; timezone is a validated IANA name supplied with the
  draft. Note and companions are private text (companions are names, not user
  identities or authorization grants). Omitted patch fields are unchanged;
  null note clears it. Do not change requestId when editing.
- Imports require a stable nonempty importSourceId unique per user, also retained
  in the ledger to prevent reimport after deletion. User-reviewed real imports
  may use origin=import; bundled fixture imports remain simulation-only.
- outingId, if present, must reference an accessible plan containing that place.
  No API creates another member's edition. Deletion removes private collection
  entries and cleans orphan assessment/ranking references when the user's last
  edition for a place is deleted; favorites/tips/saves remain independent.
- Bucket `captures` must be private. Final integrator creates it with Storage API,
  10 MiB limit and JPEG/PNG/WebP allowlist; never insert into storage tables
  directly and never use getPublicUrl. This stage does not create a bucket.
- Shared APIs owns `src/lib/auth/storage.ts`: `createCaptureUpload(auth,input)`
  returns `PhotoUploadDto`; `signCapturePhoto(auth,path)` returns
  `SignedPhotoDto`; `deleteCapturePhoto(auth,path)` returns `Promise<void>`.
  Add explicit types to these exports. Use server credentials only there.
- Server constructs `{auth.userId}/{requestId}.{jpg|png|webp}`. Signed upload is
  single-object, no upsert. Upload response has `uploaded:false` with token and
  signedUrl for a new object. If an earlier attempt already uploaded the exact
  owned path with matching MIME/size, return `uploaded:true` and null token/
  signedUrl; the client skips upload and retries edition creation. Different
  MIME/size for an existing request path is a conflict. Keep bytes immutable
  while retrying a draft; a new photo requires a new requestId.
  Client sends binary bytes using Supabase
  `uploadToSignedUrl(path,token,bytes,{contentType})`; React Native must use an
  ArrayBuffer, not an assumed browser File/FormData implementation. Persist only
  object path, never signed URL, device URI, sample URI, or arbitrary remote URL.
- Before creating an edition the server verifies exact current-user path,
  requestId, object existence, content type and actual size. A retry can proceed
  if upload already succeeded. Reject paths outside user's prefix. GET edition,
  collection/bootstrap and photo refresh sign reads for 300 seconds. Errors
  signing existing media fail clearly rather than pretending a photo persisted.
- No client Storage policies are needed: signing/upload tokens grant narrow
  access, server authorizes every issue/delete/read. Leave Storage default deny.
  Delete DB edition transactionally; delete its object afterward. Retry cleanup
  via retained ledger resource/path metadata if Storage is unavailable; do not
  restore a deleted edition to hide cleanup failure.

## Lists, rankings, and plans

- Default wishlist is private; sharing requires an explicit non-default shared
  wishlist. Owner membership is automatic; only owner may add/remove real
  profiles by handle. isShared alone never grants access. Owners cannot remove
  themselves; removing a member removes their saves. No public user directory.
- Each wishlist/place has independent per-user saves/completion rows.
  `saved:false` removes only current user's row; setting a value is idempotent,
  never a toggle API. Members may see list content/member IDs, not private
  photos/notes/tips. Overlap contains places saved by every current member.
- A ranking requires an own edition. Server validates group category/sentiment,
  membership of all group IDs, comparison references and own visits. Persist
  assessment + ordered bucket/provisional IDs/ties atomically; remove the moved
  place from old groups. Request omitting group leaves assessment unranked and
  removes its former bucket membership. Do not use a single boolean for all
  three sentiments. rankScore is derived by server, not trusted as input.
- Favorites and private tips are per user/place rows. Empty tip clears it.
- Saved plans are structured outing documents (`outings.plan`) with constraints,
  stops and provenance, not the entire app state. The outing UUID is also plan ID;
  mobile may project one response into its Plan and Outing view models.
  participantIds must contain the caller and only actual members of the linked
  wishlist, or just the caller for a personal plan. Validate all place IDs.
  createdBy is server-derived. Only creator edits/deletes; actual members read.
  Delete unlinks editions.outingId without deleting any member's edition.
  `status` is derived from the creator's editions covering the plan's stops.
  Simulation plans remain visibly labeled; no bookings/payments/provider claims.

## Client persistence boundary

| UI action                                                        | Real account persistence                                    |
| ---------------------------------------------------------------- | ----------------------------------------------------------- |
| Capture/reveal or reviewed real import                           | upload, then POST edition; reveal success only after commit |
| Edit moment/date/companions; delete                              | PATCH / DELETE edition                                      |
| Want to go; mark list completion                                 | PUT wishlist item with explicit desired values              |
| Favorite / private tip                                           | PUT own place preference                                    |
| Sentiment / compare / tie / skip                                 | PUT ranking and optional ordered group                      |
| Accept plan / revise / delete                                    | POST / PATCH / DELETE outings                               |
| Shared-list membership                                           | owner member routes, real handles only                      |
| Display name / home city                                         | PATCH me                                                    |
| Onboarding tastes, layout, capture drafts                        | local account-scoped preferences/drafts allowed             |
| Maya/Jordan/Sam, import samples, weather/AI/provider simulations | separate labeled fixture mode only                          |

Real-account bootstrap starts from empty private state, never `createSeed()`.
Do not sync or migrate `souvenir-state-v1` into accounts. Clear private memory
before an account switch; use account-scoped local keys, cancel prior requests,
and discard in-flight responses whose auth generation changed. A failed request
does not mutate authoritative state or display success; keep draft and retry.
On 401 refresh once with SDK, retry with same idempotency key, then require sign-in.
No offline private writes claimed as saved. Refresh signed URLs after expiry;
never cache one as a permanent photo URI.

## Database perimeter and release setup

### Canonical catalog

`shared/catalog-map.ts` maps all 30 mobile fixture IDs to canonical slugs.
Resolve the slugs against bootstrap's actual UUIDs; never derive DB UUIDs from
fixture IDs or migrate the demo collection. Eight map to the existing catalog;
22 are additive (`db/seed/mobile-extension.json`). Griffith Park remains distinct
from Old Los Angeles Zoo. Existing 30 place IDs and rows are never overwritten.

`pnpm exec tsx scripts/extend-catalog.ts` is a read-only dry run.
The final integrator may run it with `--apply` after reviewing the target DB.
It inserts missing places and the Downtown Firsts set/missing memberships with
ON CONFLICT DO NOTHING, in one transaction. Repeated runs preserve existing
rows, edits, memberships, and IDs. It fails if an expected overlapping base
destination is missing. The legacy seed remains unsuitable for shared data.

Added destinations have `stats.verified=false`, `provenance=prototype-catalog`
and `rarityStatus=unavailable`; required numeric rarity fields use neutral
placeholders, not measured statistics. Clients display unavailable values and
must not present prototype discovery counts, prices, hours or provider IDs as
verified. Existing web catalog sample rarity values also are not validated live
observations. All canonical categories are retained in real state; the mobile
presentation may map nature→park, culture→cultural while adding labels/filters
for food/hidden_gem. Never silently discard the other web destinations.

Use canonical UUIDs in requests even when a fixture mapping provides bundled
photography/presentation. User-owned state never uses fixture IDs. Mock planner
hours/prices/travel/weather remain explicitly labeled simulation estimates.

`node tests/contracts/check-catalog.mjs --build` tests additive seeding twice
against disposable Postgres 16, verifies no existing rows/IDs or set members
change, then builds Next.js against that local database. Next.js currently
prerenders Discover and therefore needs a populated schema during build.
Root pnpm checks exclude mobile; CI runs npm/Expo checks from `apps/mobile`
with its own lockfile and Node 24. No hosted secrets are required in CI.

### Release perimeter

Generated migrations preserve existing places/IDs and visits. RLS is enabled on
all public application tables; anon/authenticated grants are revoked with no
client policies, because all reads/writes go through the authenticated server.
Even catalog data is served through Next.js. The Postgres server connection is
privileged, so every query must still enforce owner/member predicates. Never
put DATABASE_URL, secret or service-role keys in either client.

Final integration only: apply reviewed migrations, run the additive catalog
extension, create/verify private bucket through official Storage API, configure
Auth redirect URLs, then test two accounts and direct Data API denial.
Do not run legacy `db:seed` against shared Supabase (it deletes data).
No existing auth.users FK is added: the development profile must survive.

Run `node tests/contracts/check-migrations.mjs` with Docker available to apply
the full migration chain to disposable Postgres 16 with legacy data. It checks
row/ID preservation, metadata backfill, repeated variants, durable request/import
uniqueness, grant revocation, and RLS denial. It never reads DATABASE_URL or
connects to Supabase.

## Independent implementation ownership

All agents start from the prepared integration commit. No agent edits frozen
`src/lib/db/schema.ts`, `src/lib/schemas/**`, or migrations; escalate a contract
need. `shared/**`, `src/lib/contracts/**`, this reference and preparation tests
are integrator-owned after handoff.

| Agent / suggested branch             | Exclusive paths                                                                                                                                                                                                                                                                                                              |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| authentication / `feat/social`       | `src/lib/auth/server.ts`, `browser.ts`, new `profile.ts`; `src/lib/env.ts`; `src/middleware.ts`; `src/app/auth/**`; `src/app/api/me/route.ts` only; root `.env.example`, `package.json`, `pnpm-lock.yaml`; `tests/auth/**`                                                                                                   |
| shared-apis / `feat/capture`         | `src/app/api/**` EXCEPT exact `api/me/route.ts`; `src/lib/api.ts`, `data.ts`, `serializers.ts`, `auth/storage.ts`, `db/index.ts`; new `src/lib/server/**`; `src/lib/search/**`, `src/lib/ai/**` only if required for authenticated boundary; `scripts/extend-catalog.ts`, `db/seed/mobile-extension.json`; `tests/server/**` |
| web-client / `feat/search`           | `src/app/**` EXCEPT `api/**` and `auth/**`; `src/components/**` (shared UI append-only); new `src/lib/web/**`; `tests/web/**`                                                                                                                                                                                                |
| mobile-client / `feat/agent`         | all `apps/mobile/**`, including its dependencies/lockfile/env/auth adapter, state/cache, fixture/real mode split, UI and tests                                                                                                                                                                                               |
| final integrator / `feat/collection` | root check configs and `.github/**`, `shared/**`, `src/lib/contracts/**`, `tests/contracts/**`, reference docs; conflict resolution and final hosting/database operations                                                                                                                                                    |

Web does not edit data.ts or serializers.ts. Shared APIs does not edit auth
helpers/env/root lockfile. If a shared API env dependency is needed, authentication
adds it centrally. Auth does not edit web layout or mobile. Web owns sign-in
screen and uses browser SDK; auth owns callback route under `src/app/auth/**`.
Root dependency additions belong to auth; mobile additions belong to mobile.
The bootstrap/guard signatures above let implementations proceed independently.

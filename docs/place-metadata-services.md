# Place metadata integration

The Collection services use the worldwide contracts without schema changes.
All metadata mutations and notes/tags/images/sources reads use verified auth.
The existing anonymous catalog list and base place reads remain available, but
only for public rows and allowlisted catalog facts. Anonymous reads never hydrate
notes, tags or social data. Invalid explicit bearer credentials return auth errors.
Responses are private/no-store, including friend-relative detail reads.

## Catalog and detail

`getPlaces(q?, database?, viewerId?)`, `getSets(database?, viewerId?)`,
`getSet(slug, viewerId?)`, `getPlace(slug, viewerId?)`, and
`requirePlaces(database, ids, viewerId?)` preserve existing call signatures.
Without a viewer they see only public places. Integrators must pass verified
viewer IDs from authenticated bootstrap and personal write callers to include
their private/friends custom places. Those callers are owned by other components.
Search/provider query owners should reuse `placeVisibleTo(viewerId)` on every
catalog lookup; calling the old raw place serializer is not an access check.

`GET /api/places` keeps `{data: PlaceDto[]}` and adds `nextCursor`. It accepts
the frozen catalog filters plus an opaque cursor; page size defaults to 100 and
is bounded to 100. Cursor ordering is `(name,id)`; clients should restart pagination
when filters change. Direct bootstrap helpers remain unbounded for compatibility.
Lists and sets omit unreviewed hero URLs and raw JSON stats/external IDs. Detail
selects hero images from the licensed, unexpired gallery.

`getPlaceDetail(userId, slug, readers?)` returns `PlaceDetailDto`.
`PlaceDetailReaders.metrics(placeId)` supplies materialized metrics;
`availability(placeId)` supplies reviewed documented opening hours. Until wired,
metrics are null and availability is unknown, with the stored timezone only.
Friend counts query current accepted friendships and visible visits/saves live.
The service reads source provenance through the allowlist serializer and reports
expired sources as stale. It never interprets raw provider payloads.

Custom creates use verified owners, private defaults, nullable locality,
actor/body-hash replay and transactional name-key advisory locks. A conservative
duplicate requires the same normalized name/category within 75 metres. Different
names are never silently merged. A 409 exposes `details.existingPlace` only if
accessible to that viewer; private duplicates can coexist across owners.

## Authored metadata

Notes create an activity event in the same transaction. Changes update event
visibility; deletion cascades the event and retains a request tombstone. Notes
default private, and legacy tips cannot be promoted by patching visibility.
Existing preference PUT behavior is unchanged. Tags PUT replaces only the
authenticated actor's set; repeated identical PUTs have the same result.
Suggestions store typed pending corrections and do not change canonical fields.
Notes and visible tags are bounded to 100, gallery and sources to 50.

## Public derivatives

`promotePlaceImage(auth, slug, input, storage?)` requires ownership of the edition,
matching place, a public place, and both explicit consent flags. It reads only
the owned capture via Supabase Storage. Sharp re-encodes a still JPEG/PNG/WebP
to a maximum 1600px WebP, stripping metadata. The private capture is never updated
or exposed. One edition has at most one live derivative.

Provision a **separate public `place-images` bucket** in the authorized deployment
workflow; keep `captures` private. No bucket is created or reconfigured by this
code. Only the server service credential should write/delete derivatives; clients
use the authenticated Next routes. Paths stored in the ledger are
`place-images/<user UUID>/<promotion request UUID>.webp`. Storage object keys
omit the bucket prefix. Existing server Supabase settings are reused; no new
environment variables are required.

Promotion uses a durable request-ledger intent before external storage writes.
A failed upload or metadata transaction leaves the intent available for retry
and cleanup. A replay can never change its body or publish a deleted image again.
Image DELETE removes metadata and records a deletion marker before removing the
public object. A failed remove returns 503; retrying DELETE resumes cleanup.
The original capture survives gallery deletion.

The edition write owner must call
`revokeEditionPlaceImages(tx, userId, editionId)` inside its user-locked deletion
transaction. This removes derivative metadata and records cleanup tombstones.
Run `cleanupPlaceImageObjects()` in an authenticated server maintenance job.
It processes at most 100 orphan/deletion intents older than one hour, locks each
actor, rechecks metadata, and removes only public derivative objects. Failed
removal retains the intent. Completed intents are excluded from later batches.
No scheduler or edition-write modification is included in this ownership slice.
If an account deletion workflow removes request ledgers, drain its derivatives
first so cleanup information is retained. Do not delete ledger rows prematurely.

## Verification

`node tests/server/check-persistence.mjs --build` uses disposable PostgreSQL 16,
applies migrations and runs legacy persistence plus metadata route/transaction
tests. It strips ambient Supabase variables. `pnpm test` includes the real Sharp
transform and mocked Supabase Storage boundary tests. Storage tests never contact
a hosted project. Auth verification itself remains covered by the existing auth
tests; integration tests replace only the identity guard and Storage adapter.

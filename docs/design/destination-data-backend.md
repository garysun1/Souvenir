# Destination data backend: sourcing, user metadata, and frontend wiring

Companion to [mobile-ui-plan.md](./mobile-ui-plan.md) §6 and
[flow1-sponsor-tracks.md](./flow1-sponsor-tracks.md). This plan covers how
Souvenir sources destination names, images, coordinates, and metadata for
places around the world, how user-created metadata attaches to a place, and
which frontend seams consume each piece.

## 0. Where we are today

| Layer                | State                                                                                                                                                    |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Catalog              | 52 rows in `places`, all `city = "Los Angeles"`, seeded from `db/seed/*.json` via `scripts/seed.ts` / `scripts/extend-catalog.ts`. `externalIds = {}`, `heroImageUrl` mostly null. |
| Read APIs            | `GET /api/places?q=` (ILIKE on name/description), `GET /api/places/[slug]`, `GET /api/sets`, `GET /api/search` behind `getSearchService()` (`pg` \| `es`). |
| Conditions           | `GET /api/places/[slug]/conditions` always returns 503 "Live conditions are not connected."                                                           |
| Identify             | `POST /api/capture/identify` returns mock suggestions; flow is location-first per sponsor-tracks doc, so this is not the path to a real provider.       |
| User metadata        | `place_preferences` (favorite, tip), `editions` (photo, note, companions, variant), `wishlists`/`wishlist_saves`, `ranking_groups`. Written via `PUT /api/me/places/[placeId]`, `/api/editions`, `/api/wishlists/*`, `/api/rankings/*`. |
| Mobile               | `apps/mobile/src/fixtures/catalog.ts` bundles the 30 LA fixtures; `lib/bootstrap.ts` overlays the API catalog (`installBootstrapCatalog`). `domain/sources.ts` renders provenance facts from fixtures only. |
| Web                  | `src/lib/web/use-catalog.ts` fetches `/api/places`; `src/app/discover`, `src/app/places/[slug]`.                                                        |

Frozen contracts: `src/lib/db/schema.ts` and `src/lib/schemas` change only in a
`contracts/*` PR, additive columns only. Everything below is additive.

## 1. Data model (contracts PR #1)

### 1.1 `places` — additive columns

```ts
country: text("country"),                 // ISO 3166-1 alpha-2
region: text("region"),                   // state/province, free text
timezone: text("timezone"),               // IANA, needed for hours + capture default
website: text("website"),
wikidataId: text("wikidata_id"),          // canonical cross-provider key
source: text("source").notNull().default("curated"),   // curated | osm | wikidata | google | user
sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
geohash: text("geohash"),                 // precision 6 for cheap nearby prefiltering
```

`externalIds` stays the per-provider ID map (`{ osm: "node/123", wikidata: "Q123", google: "ChIJ..." }`).
`stats` keeps `provenance` / `verified` so existing rows are unchanged.

`city` stays `notNull`: global rows fill it from the provider's locality.

### 1.2 New tables

```ts
// One row per (place, provider) fetch; raw payload kept for re-derivation and TOS audits.
placeSources: {
  id uuid pk,
  placeId uuid -> places.id,
  provider text,                 // osm | wikidata | wikimedia | google | opentripmap
  providerId text,
  payload jsonb,
  fetchedAt timestamptz,
  expiresAt timestamptz,         // Google fields: <= 30 days; OSM/Wikidata: null
  unique(provider, providerId)
}

// Images are first-class so licensing and attribution survive.
placeImages: {
  id uuid pk,
  placeId uuid -> places.id,
  url text, width int, height int,
  provider text,                 // wikimedia | user | google
  license text, attribution text, sourcePageUrl text,
  isHero boolean default false,
  uploadedBy uuid -> users.id null,   // set for user photos promoted to place imagery
  storagePath text null,              // Supabase Storage path for user uploads
  createdAt timestamptz
}

// User-authored, per-place, not per-visit. Editions stay the per-visit record.
placeNotes: {
  id uuid pk,
  placeId uuid -> places.id,
  userId uuid -> users.id,
  kind text,                      // tip | warning | hours | access | story
  body text (<= 600),
  visibility text default "friends",   // private | friends | public
  createdAt, updatedAt timestamptz
}

placeTags: {
  placeId uuid, userId uuid, tag text (slugified, <= 32),
  pk(placeId, userId, tag)
}

// Community-sourced corrections to provider data; never overwrite `places` directly.
placeSuggestions: {
  id uuid pk, placeId uuid, userId uuid,
  field text,                     // name | hours | website | coords | closed
  value jsonb, status text default "pending",   // pending | accepted | rejected
  createdAt timestamptz
}
```

`place_preferences` (favorite, tip) remains; `placeNotes.kind = "tip"` is the
multi-note successor. Migration: keep writing `place_preferences.tip` from the
existing PUT and additionally mirror to `placeNotes` so nothing breaks.

RLS (Supabase): `places`, `place_sources`, `place_images` readable by anon;
`place_notes` readable when `visibility = 'public'`, or `'friends'` and an
accepted friendship exists, or owner; writable by owner only. `place_tags`,
`place_suggestions` owner-write. The Next.js routes already run through
`withApiUser` so RLS is defense in depth, not the primary gate.

### 1.3 Zod (`src/lib/schemas/domain.ts`, `src/lib/contracts/api.ts`)

```ts
placeNoteCreateSchema = { kind: enum, body: string.min(1).max(600), visibility: enum }
placeNotePatchSchema  = placeNoteCreateSchema.partial()
placeTagPutSchema     = { tags: string[].max(10) }        // full replace
placeSuggestionSchema = { field: enum, value: unknown }
placeCreateSchema     = { name, lat, lng, category, description?, externalIds? }  // user-created place
nearbyQuerySchema     = { lat, lng, radiusM: int.min(50).max(50_000).default(1500), category?, limit: int.max(50).default(25) }
```

`shared/api-contract.ts`: extend `PlaceDto` with `country, region, timezone,
website, source, images: PlaceImageDto[]`, add `PlaceNoteDto`, `PlaceDetailDto
= PlaceDto & { notes, tags, myTags, myNote, friendsBeen: number }`.

## 2. Sourcing destinations worldwide

### 2.1 Provider choice

| Provider                    | Gives                                                  | Terms                               | Role                                 |
| --------------------------- | ------------------------------------------------------ | ----------------------------------- | ------------------------------------ |
| OpenStreetMap (Overpass + Nominatim) | name, coords, category tags, website, opening_hours | ODbL, cache freely, attribute       | **Primary** for geometry + metadata  |
| Wikidata                    | canonical ID, multilingual names, description, P18 image, official website, country/admin | CC0                                 | **Primary** for description + image ref |
| Wikimedia Commons           | image URLs, license, attribution                      | per-file license, must attribute    | **Primary** for hero images          |
| Google Places (New)         | rich hours, photos, ratings                            | no caching > 30 d, attribution      | Optional enrichment behind `PLACES_PROVIDER=google` |
| OpenTripMap                 | POI list by bbox with wikidata xids                    | free tier, thin                     | Discovery seed for a bbox            |

Default stack is OSM + Wikidata + Commons: free, cacheable, and consistent with
`SourceChip` provenance labeling. Google is a flag, not a dependency.

### 2.2 Module layout (`src/lib/places/`, owned by Search & Data)

```
src/lib/places/
  index.ts          getPlacesProvider(): PlacesProvider (env.PLACES_PROVIDER = osm|google|mock)
  types.ts          ProviderPlace { providerId, name, lat, lng, category, description?, website?,
                                    openingHours?, wikidataId?, imageRefs[], raw }
  osm.ts            overpassNearby(bbox|radius, categories), nominatimSearch(q, bias)
  wikidata.ts       fetchEntity(qid): description, P18 image, P856 website, P17 country, P421 tz
  wikimedia.ts      resolveImage(fileName): url @ 1280px, license, attribution
  google.ts         optional; respects expiresAt = fetchedAt + 30d
  mock.ts           deterministic fixtures for tests
  categorize.ts     OSM tags -> categoryEnum (tourism=museum -> culture, leisure=park -> nature, ...)
  normalize.ts      ProviderPlace -> places insert + placeSources + placeImages rows; slug from name+city
  dedupe.ts         match on wikidataId, then externalIds, then name-trigram within 150 m
```

`PlacesProvider` interface:

```ts
interface PlacesProvider {
  nearby(q: { lat; lng; radiusM; categories? }): Promise<ProviderPlace[]>;
  search(q: { text; near?: { lat; lng } }): Promise<ProviderPlace[]>;
  details(providerId: string): Promise<ProviderPlace | null>;
}
```

### 2.3 Ingestion paths

1. **Bulk seed (`scripts/ingest-city.ts --city "Lisbon" --bbox ... [--apply]`)** —
   Overpass query for tourism/leisure/historic/amenity=place_of_worship within
   bbox, join Wikidata for description + image, write `places` + `place_sources`
   + `place_images`. Dry-run prints additions like `extend-catalog.ts` does.
   Idempotent through `dedupe.ts`. Never run against the shared project without
   `--apply`, matching existing script conventions.
2. **Lazy nearby fill (runtime)** — `GET /api/places/nearby` first queries `pg`
   (haversine or geohash prefix). If fewer than `MIN_NEARBY=8` results within
   the radius and the area is not marked fetched in a `coverage_cells` table
   (geohash-5, `fetchedAt`), call `provider.nearby`, normalize, insert, then
   re-query. Runtime insert is wrapped in `db.transaction` and rate-limited per
   cell (one provider fetch per cell per 7 days).
3. **User-created place** — `POST /api/places` with `placeCreateSchema`;
   `source = "user"`, `stats.verified = false`, near-duplicate check via
   `dedupe.ts` returns `409 { error: { code: "duplicate", place } }` so the
   client can offer the existing row instead.
4. **Enrichment worker (`scripts/enrich-places.ts`)** — for rows with
   `heroImageUrl IS NULL` or `sourceUpdatedAt` older than 90 days, refetch
   Wikidata/Commons; for Google-sourced rows, purge `place_sources.payload`
   past `expiresAt`. Runs from the maintenance blueprint step or a cron.

### 2.4 Search integration

- `pgFallback.ts`: add `nearby` (haversine in SQL, index on `geohash`) and
  extend text search to `name || city || country`.
- `es.ts`: index `location: geo_point`, `country`, `tags`, `images.count`;
  `nearby` uses `geo_distance`; discovery-frequency aggregation over `editions`
  stays as described in flow1-sponsor-tracks.
- `SearchService` gains `nearby(q: NearbyQuery): Promise<SearchResult[]>`.

## 3. API surface (routes under `src/app/api/places`)

| Route                                       | Method | Auth  | Body / query                     | Returns                    |
| ------------------------------------------- | ------ | ----- | -------------------------------- | -------------------------- |
| `/api/places/nearby`                        | GET    | opt.  | `nearbyQuerySchema`              | `PlaceDto[]` + `provenance: "catalog" \| "provider"` |
| `/api/places`                               | POST   | user  | `placeCreateSchema`              | `PlaceDto` or 409 duplicate |
| `/api/places/[slug]`                        | GET    | opt.  | —                                | `PlaceDetailDto` (notes/tags scoped by auth) |
| `/api/places/[slug]/notes`                  | GET/POST | user | `placeNoteCreateSchema`        | `PlaceNoteDto[]` / `PlaceNoteDto` |
| `/api/places/[slug]/notes/[id]`             | PATCH/DELETE | owner | `placeNotePatchSchema`    | `PlaceNoteDto` / `{ data: null }` |
| `/api/places/[slug]/tags`                   | PUT    | user  | `placeTagPutSchema`              | `{ tags, myTags }`         |
| `/api/places/[slug]/images`                 | POST   | user  | `{ editionId }`                  | `PlaceImageDto` (promotes an edition photo; copies to `place-images` bucket) |
| `/api/places/[slug]/suggestions`            | POST   | user  | `placeSuggestionSchema`          | `{ id, status }`           |
| `/api/places/[slug]/conditions`             | GET    | opt.  | —                                | replace 503 with `openingHours` from OSM/Wikidata when present, else keep 503 |
| `/api/me/places/[placeId]`                  | PUT    | user  | unchanged                        | unchanged; also mirrors `tip` to `placeNotes` |

All routes follow the existing pattern: `apiRoute`/`withApiUser`, Zod parse,
`{ data } | { error }`, `requireNoQuery` where applicable, env via
`src/lib/env.ts` only. New env keys: `PLACES_PROVIDER=osm|google|mock`,
`OVERPASS_URL`, `GOOGLE_PLACES_API_KEY`, `NOMINATIM_USER_AGENT`.

Server modules: `src/lib/server/catalog.ts` gains `getNearby`, `createPlace`,
`getPlaceDetail(slug, viewerId?)`; new `src/lib/server/placeNotes.ts`,
`placeImages.ts`. `serializePlaceDto` extended for new columns and `images`.

## 4. Frontend wiring

### 4.1 Mobile (`apps/mobile`)

| Screen / module                                   | Today                                   | Change                                                                                       |
| ------------------------------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------------- |
| `features/capture/PlaceSearchSheet.tsx`           | `searchCapturePlaces` over fixtures     | Call `api.nearby(coords)` from `platform/location.ts`; fall back to `searchCapturePlaces`; "Add a place" -> `POST /api/places`, handle 409 by offering the match. |
| `domain/capture.ts` `identifyCapture`             | mock identify                           | Location-first: seed `placeId` from top nearby result when distance < 75 m; keep mock as offline fallback. |
| `lib/bootstrap.ts` `installBootstrapCatalog`       | overlays API catalog onto fixtures      | Map new `PlaceDto` fields (`country`, `timezone`, `images`) into `Place`; `heroImageUrl` from first `isHero` image; keep `fixtureId` mapping via `shared/catalog-map.ts`. |
| `app/place/[placeId].tsx`                         | fixtures + `domain/sources.ts` facts    | Fetch `PlaceDetailDto`; render notes list, tag chips, my-tags editor, "Suggest a fix", image gallery with attribution. `factsForPlace` gains real `providerRecordId`/`retrievedAt` from `place_sources`. |
| `features/discovery/PlaceSignals.tsx`, `components.tsx` | fixture signals                     | Add `SourceChip` per provider (`osm`, `wikidata`, `user`) — already planned in flow1 §Cross-cutting. |
| `app/search.tsx`, `features/discovery/MapSearchContext.tsx` | fixture filter                | `GET /api/search` + `/api/places/nearby` on map pan ("Search here" pill); results merge into `state.places`. |
| `lib/mutations.ts`, `state/reducer.ts`            | editions/wishlists mutations            | Add `placeNote/create|patch|delete`, `placeTags/put`, `placeSuggestion/create`, `place/create` with the same optimistic + `requestId` pattern as editions. |
| `domain/types.ts` `Place`                         | fixture shape                           | Additive: `country?, timezone?, images?, source?`. |
| `lib/env.ts`                                      | `EXPO_PUBLIC_API_URL`                   | No new public keys; provider keys stay server-side.                                          |

Tests: extend `tests/api.test.ts` (nearby, create-place 409), `tests/capture.test.ts`
(location-first seeding), new `tests/place-notes.test.ts`.

### 4.2 Web (`src/`)

| Location                                   | Change                                                                                     |
| ------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `src/lib/web/use-catalog.ts`               | Add `useNearby(coords)`, `usePlaceDetail(slug)`; use `navigator.geolocation` with a city-picker fallback. |
| `src/lib/web/collection.ts`                | `putPlaceTags`, `createPlaceNote`, `patchPlaceNote`, `deletePlaceNote`, `createPlace`.    |
| `src/app/discover/discover-content.tsx`    | "Near you" rail from `useNearby`; country/city filter pills once catalog is multi-city.    |
| `src/app/places/[slug]/page.tsx`           | Notes + tags + gallery + attribution footer; "Suggest a fix" form.                          |
| `src/lib/web/capture.ts`                   | Same location-first place seeding as mobile.                                                |
| `src/components/ui/`                       | Append-only: `SourceChip`, `AttributionFooter`, `TagEditor`.                                |

## 5. Delivery order (one PR each, branch per AGENTS.md)

1. `contracts/places-global-metadata` — §1 schema + Zod + `PlaceDto` extension,
   drizzle migration `0005`, RLS SQL. No behavior change.
2. `feat/search` — `src/lib/places/*` (osm, wikidata, wikimedia, mock),
   `normalize`/`dedupe`/`categorize`, `scripts/ingest-city.ts`, unit tests on
   recorded fixtures (no network in CI).
3. `feat/search` — `GET /api/places/nearby`, `SearchService.nearby` for `pg`
   and `es`, lazy fill with `coverage_cells`, `conditions` route using OSM
   `opening_hours`.
4. `feat/collection` — notes / tags / images / suggestions routes,
   `getPlaceDetail`, `POST /api/places` with dedupe, mirror of
   `place_preferences.tip`.
5. `feat/collection` (mobile + web) — §4 wiring, `SourceChip`, tests.
6. `feat/search` — `scripts/enrich-places.ts`, maintenance blueprint step,
   Google provider behind the flag, ES mapping update.

Estimate: steps 1–4 fit one session; 5–6 a second. External waits: a Google
Places key only if the flag is wanted for the demo.

## 6. Open decisions

- Provider default: OSM + Wikidata (free, cacheable) vs Google (richer, 30-day
  cache limit, key required). Plan assumes OSM + Wikidata.
- Note visibility default: `friends` (proposed) vs `public`.
- Whether user-created places are visible to others before any verification
  (proposed: visible to friends, `verified = false` badge, promoted on second
  independent edition).
- Whether to move `place_preferences.tip` to `place_notes` fully in a later
  contracts PR or keep both indefinitely.

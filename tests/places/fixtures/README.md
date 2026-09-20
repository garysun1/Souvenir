# Destination fixtures and local ingest

The eight JSONL files contain **2,000 authored synthetic destinations** (250 per
city), not OSM exports or claims about actual establishments. Coordinates form
deterministic test grids around city centres. Hours, prices, websites, images,
and provider observations are absent. IDs use a separate `synthetic-v1` namespace;
every name starts with `[Fixture]`, and source DTOs identify fixture attribution.
Do not use them as public destination content or account activity.

Regenerate with `pnpm exec tsx tests/places/generate-fixtures.ts`. Test equality
checks keep the checked-in files and generator synchronized. Run full local
ingest/query validation with `node tests/places/check-destinations.mjs`; it
creates and removes its own PostgreSQL 16 container and uses no hosted secrets.

For a separately created, migrated disposable local database:

```sh
DATABASE_URL=postgres://postgres@127.0.0.1:5432/souvenir_disposable \
PLACES_DISPOSABLE_DATABASE_URL=postgres://postgres@127.0.0.1:5432/souvenir_disposable \
pnpm exec tsx scripts/ingest-city.ts --offline --all --apply
```

Use `--city lisbon` instead of `--all` for one city. Both explicit acknowledgement
and loopback URL are required. Tools refuse production mode. Scripts never read
ambient Supabase credentials; run them in a clean environment with these explicit
variables. The fixture provider also requires the acknowledgement.

## Licensed provider operation

The catalog is the default read path. Set `PLACES_LAZY_FILL=true`, `OVERPASS_URL`
and an identifiable `PLACES_USER_AGENT` only after arranging provider capacity.
Production needs a self-hosted or contracted Overpass service and explicit
`OVERPASS_MANAGED_ENDPOINT=true` acknowledgement; no Nominatim
bulk geocoding is used. One lazy refresh fetches at most 250 records in the
centre geohash cell, behind a 60-second lease, 7-day cache, 30-minute failure
backoff and database-wide budget of one refresh per minute / 100 cells per day.
Coverage is cell-local, not a claim that every destination in a radius is known.
The HTTP adapter uses bounded bodies/timeouts/retries and honours Retry-After.
The manual provider ingest mode is one bounded 2 km city-centre query per run.

OSM is ODbL 1.0: show “© OpenStreetMap contributors” with
https://www.openstreetmap.org/copyright and comply with database/share-alike
obligations when distributing a derived database. Attribution alone does not
meet all obligations. Review
https://osmfoundation.org/wiki/Licence/Attribution_Guidelines and
https://wiki.openstreetmap.org/wiki/Overpass_API before deployment.

Wikidata structured data is CC0; retain provenance and identify requests.
See https://www.wikidata.org/wiki/Wikidata:Data_access and
https://www.mediawiki.org/wiki/API:Etiquette.

Enrich an exact database place UUID with:
`pnpm exec tsx scripts/enrich-places.ts --place <uuid> --apply`.
This uses the existing Wikidata identity, never proximity, and returns at most
two Commons candidates without publishing a hero. After reviewing the depicted
place and attribution, rerun with `--confirm-image 'File:Exact title.jpg'`.
The license, source page, artist attribution, restrictions and HTTPS image host
are checked again. No original user capture is read or published.
Commons per-file rights remain the operator's responsibility:
https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia.
Unknown/unreviewed license metadata is rejected.

Source DTOs expose an attribution/retention allowlist, never provider payloads.
OSM/Wikidata licensed data has no arbitrary 30-day expiry. Google is not enabled.
Documented OSM opening hours become stale after 90 days; current opening status,
prices, weather and crowds remain unknown. Run
`pnpm exec tsx scripts/enrich-places.ts --purge-expired --apply` for bounded
payload and remote-image cleanup. This stack never copies provider image bytes
into storage; storage-backed user derivatives belong to the metadata/storage
service and are not deleted by this worker.

Elasticsearch uses index `souvenir-places-v1` with `placeIndexMapping` and
`placeIndexDocument` exported from `src/lib/search/es.ts`; an external indexer
must provision/synchronize it. Reads rehydrate and authorize current PostgreSQL
rows, so stale private/unverified hits cannot escape. Missing/unavailable ES
falls back to PostgreSQL.

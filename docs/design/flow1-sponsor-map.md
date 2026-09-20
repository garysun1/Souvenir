# Flow 1 with sponsor tracks

Companion to [mobile-ui-plan.md](./mobile-ui-plan.md) §6. Maps each stage of
Capture → Locate → Confirm → Reveal → Saved to the HackMIT 2026 sponsor tracks,
and records where each sponsor is introduced versus expanded later.

Legend: **now** = build into Flow 1 on `feat/capture`; **later: Flow N** =
introduce or expand in that flow. Every live integration keeps the plan's
"Demo data" labeling and a mock/`pg` fallback.

## Place matching: the decision

Place matching is location-first (§6.0): nearby places from a provider-backed
catalog, user taps to choose, search and custom-place fallbacks. This replaces
vision-first identification. Consequences for sponsors:

- OpenAI leaves the identify path. Its showcase moves to the planner (Flow 5)
  and query parsing (Flow 3). An optional `suggestPlace` step may rerank the
  nearby list, but it is polish, not a dependency.
- Elastic becomes the retrieval layer over the cached catalog (nearby, text,
  semantic, frequency aggregations) rather than a checkbox.
- A places provider (Google Places, Apple MapKit Server, OpenTripMap, OSM) is a
  new external dependency; `places.externalIds` already holds per-provider IDs.

## Stage by stage

### 1. Capture (camera / gallery / sample → persisted draft)

- **Cognition (now)** — nothing in-product. Every feature lands as a Devin PR
  on a `feat/*` branch; that trail is the "Best Use of Devin" evidence.
- **Dropbox (later: Flow 2 §7.6)** — gallery is the single-photo entry; Dropbox
  import is the bulk version of the same draft pipeline. Design the draft type
  so an imported photo (source ID + content hash) enters at Locate unchanged.

### 2. Locate (coordinates → nearby list → tap / search / add a place)

- **Places provider (now)** — seed the 30 LA places from a provider export;
  `nearbyPlaces` runs on `pg` with a haversine radius. Later: live provider
  call merged with the catalog, results cached with provider terms in mind
  (Google forbids caching most fields > 30 days; Apple is free with a dev
  account; OpenTripMap/OSM are free with thinner data).
- **Elastic (now: boundary only → later: Flow 3 §8.2)** — `nearbyPlaces` and
  "Search all places" sit behind `getSearchService()`. Flow 3 swaps in
  `geo_distance` filter + text/semantic ranking; "12% of collectors" frequency
  is an aggregation over editions.
- **OpenAI (optional, now or later)** — `suggestPlace`: one vision call with
  the photo and the nearby candidate IDs, structured output constrained to
  those IDs, real confidence, at most one highlighted row. Cached by photo
  hash; sample photos skip it. Token Company angle: tiny prompt, cheap model,
  cache.
- **Custom place (now)** — `createCustomPlace` with near-duplicate check. Not a
  sponsor item, but it is what makes the approach robust.

### 3. Confirm (place, date/time, companions, moment, outing)

- **Meta (now: seed → later: Flow 4 §9)** — companions stored on the edition
  are the seed of the social graph. Flow 4 uses them for matching group
  editions, shared wishlists, overlap, and the friend feed; Muse Spark can
  summarize a group's editions into "plans everyone would enjoy" (Meta's own
  example) inside Flow 5.
- **Dropbox (later: Flow 2)** — the Confirm form becomes the per-group review
  screen in import (editable date/place, confidence band, duplicate
  exclusion). Build it as a reusable component with an "imported" date flag.

### 4. Reveal (card flip → personal edition, commits once)

- **Cognition (now)** — the polish showpiece. Invest here.
- **Long Lake (now, framing)** — the "skeptic tries it and it just works"
  moment. Demo script centers on it.
- **Meta Muse Image (later: P2)** — generated edition art / diorama preview,
  labeled generated, off the P0 path.

### 5. Saved (set progress, rate / open edition / next visit)

- **Meta (later: Flow 4)** — the activity event becomes the feed item;
  "Recommend it?" becomes the social recommendation.
- **OpenAI (later: Flow 5 §10)** — "next visit" deep-links to the planner with
  this place as a preferred stop. The planner is the primary OpenAI surface:
  constraint parsing into the editable bar, proposal, revision loop. Codex
  story for the pitch comes from building it.
- **Visa (later: P2 only)** — timed-ticket availability (§8.3) is the hook for
  a booking/checkout preview. Weak fit; only after P1.

## Cross-cutting

- **Provenance (Flow 6 §11)** — every provider-backed row carries a
  `SourceChip` (places provider, Elasticsearch, Dropbox import, Muse summary).
  Build the chip in Flow 1 so later flows inherit it.
- **Meta submission** — 2–3 min demo video, public repo, write-up (who, how it
  strengthens connection, why AI is essential). Video: Capture → Reveal →
  Friends overlap → Group plan.
- **OpenAI submission** — working product, explain API use, one concrete
  Codex story.

## Evolution summary

| Sponsor | Flow 1 (now) | Flow 2 Collection/Import | Flow 3 Search | Flow 4 Friends | Flow 5 Planner | P2 |
|---|---|---|---|---|---|---|
| Cognition | Devin PRs, reveal polish | Devin PRs | Devin PRs | Devin PRs | Devin PRs | — |
| Places provider | Seeded catalog, `pg` nearby | Import matching | Live text search | — | Hours/tickets for feasibility | City picker |
| Elastic | Search boundary on `pg` | — | Geo + semantic search, frequency aggs | — | Candidate stop retrieval | — |
| OpenAI | Optional `suggestPlace` | Import confidence (optional) | Query → filter parsing | — | Constraint parse + revision | — |
| Meta | Companions on edition | Activity events | — | Feed, wishlists, overlap, Muse Spark summary | Group plan synthesis | Muse Image art |
| Dropbox | Draft supports import source | Import simulation → live API | — | — | — | — |
| Token Co. | Suggest cache by hash, mock for samples | — | — | — | Proposal cache, tiered models | — |
| Long Lake | Demo framing | — | — | — | — | — |
| Visa | — | — | Availability/ticket data | — | Budget constraint | Booking preview |

Not a fit: ASUS, Maximor, Voloridge, Arduino, Warp, Espressif, Dimensional,
Runpod, ElevenLabs, Deepgram, GiveCampus, Ramp, SpaceXAI, Arrowstreet,
Hackster, Regeneron.

## Scaling notes

Holds: provider boundaries (`src/lib/ai`, `src/lib/search`), frozen contracts,
shared place vs. personal edition, idempotent commits, content-hash dedupe,
reusable draft/Confirm pipeline.

Fix before scale: catalog seeded from a static export → live provider sync
with terms-compliant caching; `DEV_USER_ID` bypass → real auth + RLS;
synchronous import/plan calls → job queue; per-save recompute of aggregate
stats → materialized view or ES aggregation; photos → object storage keyed by
content hash; user-submitted places → merge/dedupe job.

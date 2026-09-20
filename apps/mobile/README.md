# Souvenir

Souvenir is a deterministic Expo 57 prototype for the loop:

**Discover → Visit → Capture → Reveal → Collect → Inspire the next visit**

It uses a Beli-inspired visual language: Playfair Display headings, Inter interface text, deep teal controls, quiet white surfaces, two-up photography, thin icons, filter chips, segmented views, and pairwise recommendation ranking.

## Included flows

- Discover: taste-based recommendations, transparent semantic-query parsing, hard filters, location fallback, native and schematic maps, and place details.
- Capture and reveal: camera, gallery, bundled sample, deterministic place identification, correction, visit metadata, reveal motion, local media persistence, revisits, and editable personal editions.
- Collection: Been, Want to go, Sets, list, album, map, favorites, private tips, recommendation sentiment, bounded ranking, and a reviewed Dropbox-style sample import.
- Friends: fictional activity, Saturday with Maya, derived overlap, planner handoff, outings, independent matching editions, and an explicit Maya-confirmation simulation.
- Planner: editable constraints, sample hours/weather/travel/access checks, feasible and impossible results, revisions, idempotent acceptance, saved plans, and visit mode.
- Data: curated catalog, provider provenance, source scope/date/unit states, stale/unavailable controls, credits, and clear labels for sample assumptions.
- Profiles and concepts: local profile editing, collection statistics, photo import, pocket diorama, future city editions, and booking-handoff previews.

No production service is connected. Identification, semantic search, weather, routing, imports, social actions, data sources, and planning are bundled simulations. The app never claims a booking, payment, reservation, live forecast, live opening status, or message delivery.

## Run

Node 24 and npm 10 were used during implementation.

```bash
npm install
npm run web
```

For native development:

```bash
npx expo start
```

Use the QR code with a compatible Expo client or choose an installed simulator. Camera, photo-library, location, and persisted-media behavior should be validated on the target device before a production build.

## Validate

```bash
npx expo install --check
npx expo-doctor
npm run lint
npm run typecheck
npm test -- --runInBand
npm run export:web
```

The automated suite covers capture idempotency, revisit and set invariants, media keys, edition deletion, ranking and ties, import deduplication and retries, search filters, map geometry, source-state propagation, planner feasibility and arithmetic, shared-list overlap, participant isolation, persistence migration, and demo controls.

## Demo data

- City: Los Angeles.
- Catalog: 30 destinations in Parks, Cultural, and Landmarks.
- Initial sample: 6 unique places, 7 personal editions, and Downtown Firsts at 1/3.
- Shared list: Saturday with Maya, with two initial overlapping saves.
- Demo clock: September 19, 2026 at 2:00 PM in America/Los_Angeles.
- Photography: 26 attributed Wikimedia images and explicit fallbacks for the four destinations without a verified compatible image. Full attribution appears in Settings → Photography & font credits and in `assets/places/credits.json`.

Choose **Start with an empty collection** on the welcome screen to exercise first-use and import states.

## Verification and current limits

TypeScript, lint, all 152 tests, Expo dependency compatibility, all 21 Expo Doctor checks, and the web export passed. Browser and physical-device end-to-end testing has not yet been performed.

`npm audit` reports 15 moderate advisories through the Expo tooling and routing dependency graph. Its proposed automated fixes include downgrading Expo 57 and Expo Router to incompatible major versions, so those downgrades were not applied.

The GNU Free Documentation License 1.2 text for the two images under that license is included in `assets/places/GFDL-1.2.txt`, copied verbatim from the SPDX license-list-data repository.

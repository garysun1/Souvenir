# Souvenir

Souvenir is an Expo 57 app with shared Supabase account persistence and a separate local demo for the loop:

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

Account mode loads the canonical catalog and account-owned visits, saves, rankings, tips, shared lists and plans from the authenticated Next.js API. Camera/gallery photos upload privately before edition creation. Real accounts use manual place selection and user-entered planning estimates. The sample identification, Dropbox import, fictional friends and automatic planning flows stay in explicit demo mode. No mode claims a booking, payment, reservation, live forecast or live opening status.

## Account configuration

Copy `.env.example` to `.env.local` and provide only the Supabase publishable key, project URL and Next.js API origin. Restart Expo after changes:

- `EXPO_PUBLIC_SUPABASE_URL`: the shared Supabase project origin.
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: an `sb_publishable_…` key; never a database, secret or service-role key.
- `EXPO_PUBLIC_API_URL`: the Next.js origin, reachable from the simulator/device. `localhost` only works when the server is on the same device. For Expo web, the API must allow its exact origin in the bearer CORS allowlist.

The server must implement `shared/api-contract.ts` and the release migration/catalog setup. The private `captures` bucket needs the contract's MIME/size limits. Configure approved email-confirmation destinations during integration. Mobile signup without a session asks the user to confirm email and sign in; it does not pretend confirmation succeeded.

Expo and root Next.js dependencies remain separate. Metro watches only the shared contract/catalog directory outside mobile, avoiding imports of the root React/server dependency graph. Root TypeScript wire contracts are imported type-only.

## Persistence and retries

Supabase Auth persists sessions in AsyncStorage and refreshes them on foreground. Data requests send a bearer token, never ambient cookies. A 401 refreshes the token once and retries the same request body. Further failures display an error without switching to sample data.

Bootstrap replaces account state after sign-in, foregrounding, Refresh/pull-to-refresh and completed writes. Switching accounts clears private memory, aborts requests, rejects stale callbacks and remounts the navigation tree. Only preferences and capture drafts use `souvenir-account-v1:<userId>`; authoritative collection state comes from the server. The old `souvenir-state-v1` demo is never migrated to an account.

Capture drafts hold one UUID per logical visit. The normalized edition payload is saved before upload and frozen for retries. Private uploads use device bytes as an ArrayBuffer and the exact server-provided user/request path. Successful prior uploads skip re-upload; signed read URLs are refreshed and never persisted as permanent photos. If a request might have succeeded, retry the same draft before editing the saved edition. A new capture creates a new UUID for a revisit. Account writes require connectivity; a failed draft remains local.

Shared-list creation and manual plan acceptance reuse their request IDs while the retry screen remains open. Leaving those screens discards the unsaved form; refresh the server list before submitting a new create after an uncertain result. Collection photo drafts remain durable across restarts.

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

The automated suite covers bearer refresh/envelopes, account-generation invalidation, canonical bootstrap/category mapping, cache isolation, immutable capture retries, private upload/path validation, capture revisits, edition deletion, ranking, import deduplication, search, map geometry, source states and demo controls. Shell checks do not replace hosted cross-client or native device acceptance testing.

## Demo data

- City: Los Angeles.
- Catalog: 30 destinations in Parks, Cultural, and Landmarks.
- Initial sample: 6 unique places, 7 personal editions, and Downtown Firsts at 1/3.
- Shared list: Saturday with Maya, with two initial overlapping saves.
- Demo clock: September 19, 2026 at 2:00 PM in America/Los_Angeles.
- Photography: 26 attributed Wikimedia images and explicit fallbacks for the four destinations without a verified compatible image. Full attribution appears in Settings → Photography & font credits and in `assets/places/credits.json`.

Choose **Start with an empty collection** on the welcome screen to exercise first-use and import states.

## Verification and current limits

Browser, hosted cross-client and physical-device end-to-end testing belong to final integration. This component does not apply migrations, create a hosted bucket, run the destructive legacy seed or deploy publicly.

The dependency graph has npm audit advisories. Do not apply an automated fix that downgrades Expo 57 or Expo Router to incompatible major versions.

The GNU Free Documentation License 1.2 text for the two images under that license is included in `assets/places/GFDL-1.2.txt`, copied verbatim from the SPDX license-list-data repository.

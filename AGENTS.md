# Souvenir agent conventions

## Branches and ownership

Use one branch per component: `feat/capture`, `feat/collection`, `feat/search`,
`feat/agent`, `feat/social`, or `feat/dropbox`. Open a PR into `main`; one human
merges it with squash.

| Area                                     | Owner                 |
| ---------------------------------------- | --------------------- |
| capture pages and capture APIs           | Capture & Reveal      |
| collection, map, and places APIs         | Collection & Map      |
| `src/lib/search`, external data adapters | Search & Data         |
| `src/lib/ai`, plan API                   | Agent                 |
| friends, wishlists, outings APIs         | Social                |
| Dropbox import API                       | Dropbox               |
| shared UI primitives                     | Scaffold; append-only |

## Frozen contracts

`src/lib/schemas` and `src/lib/db/schema.ts` are frozen contracts. Change them
only in a dedicated `contracts/*` PR. Additive columns are fine; renames and
breaking changes are not.

Every route validates input with its Zod schema and returns `{ data }` or
`{ error }`. Read environment variables only through `src/lib/env.ts`. Feature
flags are `SEARCH_PROVIDER=pg|es` and `AI_PROVIDER=openai|mock`.

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
| Discover page                            | Search & Data         |
| Profile page                             | Collection & Map      |

## Frozen contracts

`src/lib/schemas` and `src/lib/db/schema.ts` are frozen contracts. Change them
only in a dedicated `contracts/*` PR. Additive columns are fine; renames and
breaking changes are not.

Every route validates input with its Zod schema and returns `{ data }` or
`{ error }`. Read environment variables only through `src/lib/env.ts`. Feature
flags are `SEARCH_PROVIDER=pg|es` and `AI_PROVIDER=openai|mock`.

## Design system

- Tokens live in `src/app/globals.css`; use the serif font for wordmarks,
  headings, and place names, and the sans font for functional text.
- Use `src/components/ui/*` primitives for shared UI. These are append-only.
- Primary navigation is Discover, Collection, Capture, Friends, and Profile.
  Planner entry points live under Discover and Profile rather than in the tab bar.
- Layout is responsive: bottom tab bar below `lg`, `SideNav` at `lg`+; page
  content lives in `PageBody` (max-w-6xl).
- Appeal, discovery frequency, and availability remain three separate rarity
  signals. Sentiment colors are reserved for recommendations.
- Read the design references in
  [docs/design/beli-style-notes.md](docs/design/beli-style-notes.md) and
  [docs/design/mobile-ui-plan.md](docs/design/mobile-ui-plan.md).

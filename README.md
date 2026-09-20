# Souvenir

Collect places. Keep memories. Find your next adventure.

Souvenir is a responsive web PWA (mobile tab bar, desktop sidebar) for turning
places into collectible memories, planning outings, and sharing discoveries.

The app uses a Beli-inspired five-tab shell: Discover, Collection, Capture,
Friends, and Profile. Planner entry points live under Discover and Profile.

## Local development

```bash
pnpm install --frozen-lockfile
docker compose up -d
pnpm db:migrate && pnpm db:seed
pnpm dev
```

Copy `.env.example` to `.env` before running the commands. The seed command is
only for a disposable local database; it deletes existing application data.
Real account flows require the public Supabase configuration even with a local
application database.

## Hosted database (Supabase)

Set `DATABASE_URL` to the Supabase Session pooler URI:
`postgresql://postgres.<ref>:PASSWORD@aws-…pooler.supabase.com:5432/postgres`.
The direct `db.<ref>.supabase.co` host is IPv6-only. Inspect the migration journal
and existing schema before applying `pnpm db:migrate`; an existing database must
have a baseline matching migration `0000` before incremental migrations run.
Never run `db:seed` against a shared project.

Use the reviewed, additive catalog extension and private bucket provisioning:

```bash
pnpm exec tsx scripts/extend-catalog.ts
pnpm exec tsx scripts/provision-captures.ts
# After reviewing the target project and dry-run output:
pnpm exec tsx scripts/extend-catalog.ts --apply
pnpm exec tsx scripts/provision-captures.ts --apply
```

The private `captures` bucket accepts JPEG, PNG and WebP up to 10 MiB.
Reads and writes go through authenticated Next.js APIs; client database access
is denied. See [the API contract](docs/supabase-api.md) and
[Auth/Storage setup](docs/supabase-auth-storage.md).

## Environment

| Variable                               | Required   | Purpose                                               |
| -------------------------------------- | ---------- | ----------------------------------------------------- |
| `DATABASE_URL`                         | Yes        | Postgres connection                                   |
| `SEARCH_PROVIDER`                      | No         | `pg` fallback or `es`                                 |
| `AI_PROVIDER`                          | No         | `mock` or `openai`                                    |
| `DEV_USER_ID`                          | No         | Disposable seed profile only; never authenticates     |
| `NEXT_PUBLIC_SUPABASE_URL`             | Accounts   | Supabase project URL                                  |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Accounts   | Supabase publishable key (`sb_publishable_…`)         |
| `SUPABASE_SECRET_KEY`                  | Photos     | Supabase secret key (`sb_secret_…`), server-side only |
| `APP_ORIGIN`                           | Production | Exact web origin for cookies and callbacks            |
| `CORS_ORIGINS`                         | Expo web   | Comma-separated exact allowed bearer origins          |
| `OPENAI_API_KEY`                       | No         | OpenAI provider                                       |
| `ELASTICSEARCH_URL`                    | No         | Elasticsearch endpoint                                |
| `ELASTICSEARCH_API_KEY`                | No         | Elasticsearch credentials                             |

All environment access is validated in `src/lib/env.ts`.

## Mobile and verification

The Expo SDK 57 app has separate dependencies and configuration. Follow
[its account setup](apps/mobile/README.md), using the same Supabase URL and
publishable key and an API origin reachable from the device. Server database
and secret keys must never use `NEXT_PUBLIC_` or `EXPO_PUBLIC_` prefixes.

Run root checks with `pnpm lint`, `pnpm format:check`, `pnpm typecheck` and
`pnpm test`. Disposable Docker checks are
`node tests/contracts/check-migrations.mjs`,
`node tests/contracts/check-catalog.mjs --build`,
`node tests/auth/check-profiles.mjs` and `node tests/server/check-persistence.mjs`.

With a configured production build running at `APP_ORIGIN`, a server-only key
and an explicit Expo web `CORS_ORIGINS` value, run
`pnpm exec tsx scripts/check-hosted.mjs --apply`. This opt-in HTTP check creates
temporary accounts, exercises cookie/bearer parity and private media, and
cleans up only its own accounts, rows and objects. It does not exercise native
permissions, browser rendering, email delivery or natural token expiration.

## Component ownership

See [AGENTS.md](./AGENTS.md) for branch conventions, ownership, frozen
contracts, response envelopes, and feature flags.

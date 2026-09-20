# Souvenir

Collect places. Keep memories. Find your next adventure.

Souvenir is a responsive web PWA (mobile tab bar, desktop sidebar) for turning
places into collectible memories, planning outings, and sharing discoveries.

The app uses a Beli-inspired five-tab shell: Discover, Collection, Capture,
Friends, and Profile. Planner entry points live under Discover and Profile.

## Start in 3 commands

```bash
docker compose up -d
pnpm db:migrate && pnpm db:seed
pnpm dev
```

Copy `.env.example` to `.env` before running the commands.

## Hosted database (Supabase)

Set `DATABASE_URL` to the Supabase Session pooler URI:
`postgresql://postgres.<ref>:PASSWORD@aws-…pooler.supabase.com:5432/postgres`.
The direct `db.<ref>.supabase.co` host is IPv6-only. Then run:
`pnpm db:migrate && pnpm db:seed`

## Environment

| Variable                               | Required | Purpose                                               |
| -------------------------------------- | -------- | ----------------------------------------------------- |
| `DATABASE_URL`                         | Yes      | Postgres connection                                   |
| `SEARCH_PROVIDER`                      | No       | `pg` fallback or `es`                                 |
| `AI_PROVIDER`                          | No       | `mock` or `openai`                                    |
| `DEV_USER_ID`                          | No       | Development auth bypass UUID                          |
| `NEXT_PUBLIC_SUPABASE_URL`             | No       | Supabase project URL                                  |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | No       | Supabase publishable key (`sb_publishable_…`)         |
| `SUPABASE_SECRET_KEY`                  | No       | Supabase secret key (`sb_secret_…`), server-side only |
| `OPENAI_API_KEY`                       | No       | OpenAI provider                                       |
| `ELASTICSEARCH_URL`                    | No       | Elasticsearch endpoint                                |
| `ELASTICSEARCH_API_KEY`                | No       | Elasticsearch credentials                             |

All environment access is validated in `src/lib/env.ts`.

## Component ownership

See [AGENTS.md](./AGENTS.md) for branch conventions, ownership, frozen
contracts, response envelopes, and feature flags.

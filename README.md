# Souvenir

Collect places. Keep memories. Find your next adventure.

Souvenir is a mobile-first web PWA for turning places into collectible
memories, planning outings, and sharing discoveries.

The app uses a Beli-inspired five-tab shell: Discover, Collection, Capture,
Friends, and Profile. Planner entry points live under Discover and Profile.

## Start in 3 commands

```bash
docker compose up -d
pnpm db:migrate && pnpm db:seed
pnpm dev
```

Copy `.env.example` to `.env` before running the commands.

## Environment

| Variable                        | Required | Purpose                         |
| ------------------------------- | -------- | ------------------------------- |
| `DATABASE_URL`                  | Yes      | Postgres connection             |
| `SEARCH_PROVIDER`               | No       | `pg` fallback or `es`           |
| `AI_PROVIDER`                   | No       | `mock` or `openai`              |
| `DEV_USER_ID`                   | No       | Development auth bypass UUID    |
| `NEXT_PUBLIC_SUPABASE_URL`      | No       | Supabase project URL            |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | No       | Supabase browser auth           |
| `SUPABASE_SERVICE_ROLE_KEY`     | No       | Supabase Storage signed uploads |
| `OPENAI_API_KEY`                | No       | OpenAI provider                 |
| `ELASTICSEARCH_URL`             | No       | Elasticsearch endpoint          |
| `ELASTICSEARCH_API_KEY`         | No       | Elasticsearch credentials       |

All environment access is validated in `src/lib/env.ts`.

## Component ownership

See [AGENTS.md](./AGENTS.md) for branch conventions, ownership, frozen
contracts, response envelopes, and feature flags.

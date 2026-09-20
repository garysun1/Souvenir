# Disposable local load harness

This harness uses real local Supabase Auth, Storage and PostgreSQL, plus a
production Next server. User actions go through bearer-authenticated Next APIs.
It never inserts into `auth.users`, rewrites visit timestamps in SQL, or uses a
service key as a user's bearer token.

**The contracts base supports the core infrastructure smoke. Worldwide
services must be integrated before the 1000-account validation.** Core success
does not establish social metrics, provider coverage or scale success.

## Prerequisites and isolation

Verified on Linux with Node 24.19.0, pnpm 9.15.5, Docker Engine 29.7.2 and pinned
Supabase CLI 2.39.2 (published 2025-08-23). Docker must be available through the local Unix socket,
with enough memory/disk for Supabase PostgreSQL 17, Auth, Storage and Next.
The existing repository blueprint installs Node/pnpm and runs
`pnpm install --frozen-lockfile`; that installs the pinned CLI. No blueprint
changes or hosted credentials are needed. Docker must already be provisioned.

Run from the repository root in an isolated checkout without `.env`,
`.env.local`, `.env.production*` or `.env.development*`. The runner refuses
Next dotenv loading, linked Supabase projects and nonliteral loopback URLs.
Do not copy hosted credentials into this checkout.

```sh
source "$HOME/.nvm/nvm.sh"
nvm use 24.19.0
pnpm install --frozen-lockfile
```

Every command below uses `exec.mjs`, which drops ambient hosted database,
Supabase, provider and proxy variables before loading TypeScript. Child tools
also receive an explicit environment allowlist. The app environment is built
from local CLI status held only in memory. The wrapper never prints CLI keys.
Passwords are random and memory-only; resume verifies the recorded Auth ID,
email and run marker, then rotates the password through the admin API.

The fixed local project is `souvenir-load`. Its dedicated Docker bridge binds
published ports to `127.0.0.1`: API/Auth/Storage 56321, PostgreSQL 56322,
mail catcher 56324. Next binds 3300. The harness fixes Docker to the local
Unix socket and default context. It refuses an existing bridge without the
loopback binding. Do not share this stack with another task.

Global Auth signup is disabled. The email provider remains enabled for
password sign-in; admin creation uses `email_confirm: true`. Email is caught
locally, with no SMTP provider configured. Studio/Realtime/Edge/analytics
services are disabled. The CLI uses the official Docker Hub image mirror
because public ECR returned a data-limit error in the verified environment.

## Offline and service checks

```sh
# Lint, formatting, typecheck and all unit tests; no network or Docker required.
node scripts/load/exec.mjs check

# Existing fast service integration suite, isolated PostgreSQL 16.
node scripts/load/exec.mjs service
```

The unit suite includes failure recovery using mocked admin responses; it is
not an Auth/Storage validation. The service suite preserves the existing fast
CI path and starts its own disposable Postgres container. Pre-pull its image
when preparing an offline CI machine. Neither command downloads photos or
contacts external providers. Browser testing belongs to the final integrator.

## Stock pool and full-stack smoke

Download the pool explicitly outside CI:

```sh
node scripts/load/exec.mjs photos
node scripts/load/exec.mjs smoke --apply
```

`photos` downloads eight explicit Lorem Picsum source IDs and actual JPEG
bytes. It records source ID, photographer, source page, license URL,
attribution, dimensions, byte length, SHA-256 and fetch time. Subsequent calls
verify existing bytes instead of re-fetching them. A seeded URL is **not**
a byte-stability guarantee. Preserve the cached bytes plus manifest to replay
the identical media pool; changed bytes or metadata require a new run ID.

The smoke command starts/prepares local Supabase, builds Next and owns its
temporary Next process. Port 3300 must be free. It creates a four-account,
12-edition run plus an independent two-account sentinel run, using real Auth,
signed uploads and signed downloads. It exercises API replay/resume, owner
isolation, direct PostgREST revocation, private Storage, collection SQL parity,
FK/RLS checks and EXPLAIN index eligibility. Cleanup is repeated, then the
sentinel is verified to detect cleanup crossing run boundaries. All six
accounts and their recorded objects/data are removed in `finally`. Reports
remain available. The local Supabase stack stays running until explicit stop.

The committed `fixtures.ts` and `licenses.json` describe authored synthetic
data and media usage. Fixtures cover Los Angeles, New York, Mexico City,
Lisbon, Paris, Cairo, Tokyo and Sydney (20 points per city). They are explicitly
synthetic, not provider results or destination recommendations. Coordinates
are around city centers; they do not claim real venues, prices or hours.
Heroes remain null. Stock bytes are labeled synthetic private capture photos
and are never promoted to destination heroes. Avatars are generated local SVGs,
stored in the run directory without an external service or data URI.

## Integrated 1000-account run

Once the backend is integrated, first run the smoke, then:

```sh
node scripts/load/exec.mjs start --apply
node scripts/load/exec.mjs prepare --apply
node scripts/load/exec.mjs photos
node scripts/load/exec.mjs build

# Terminal A; foreground process, only the local configuration is injected.
node scripts/load/exec.mjs serve

# Terminal B; explicit final target, no mock Auth or Storage.
node scripts/load/exec.mjs run --apply \
  --run-id worldwide-1000-v1 --seed souvenir-v1 \
  --accounts 1000 --mode worldwide --concurrency 4 --photos sparse
```

Omit `--editions` to produce exactly 35,000 editions for 1000 accounts:
40% casual (15), 40% regular (40), 20% explorer (65). Accepted `capturedAt`
values cover historical visits; the manifest fixes their anchor instant.
Personas also write rankings, saves, notes/tags and pairwise friendships.
All accounts sign in and call `/api/me`. Each capture has its authenticated
owner's unique object path, even when reusing identical stock bytes.

`--photos pool` uploads a stock capture for every edition. `sparse` uploads
on visits 0, 20, 40, 60 as applicable (2,000 objects at the default scale);
every account therefore exercises real signed upload. `none` is available
only for smaller development runs. A 1000-account run requires worldwide
mode and `pool` or `sparse`. Account counts above 1000, concurrency above 16
and per-account overrides above 120 editions are rejected.

Start with `--accounts 8 --editions 8` for a small integrated validation.
Worldwide mode needs at least three accounts. Use a fresh run ID after
changing fixture data, account options or photo manifest. Runs with different
IDs are isolated, but running them simultaneously changes global cohort and
rank statistics; SQL comparisons intentionally include those eligible users.

### Required integration endpoints

Preflight calls `/api/me` (with stats), `/api/me/stats`, `/api/friends`,
`/api/feed` and `/api/leaderboard`. Missing stats or missing handlers fail
before provisioning the remaining accounts. The first account's intent and
UUID are still recorded for cleanup.

The workload additionally needs:

- Existing editions, capture/upload, rankings, wishlists and profile APIs to
  persist the accepted visibility and locality fields.
- `POST /api/places/[slug]/notes` and `PUT /api/places/[slug]/tags`.
- `PUT/DELETE /api/friends/[userId]` with convergent pair locking.
- `GET /api/places/[slug]` with `PlaceDetailDto.metrics`, `social`, null fixture
  hero and allowlisted sources.
- `GET /api/users/[userId]`, `/api/feed`, `/api/leaderboard`,
  `/api/me` and `/api/me/stats` with live authorization and actual statistics.
- Atomic activity events, visibility/delete invalidation, stable cursor
  ordering and the contracts' indexes.

Typed inputs/DTOs come from `shared/api-contract.ts`; no app/server/schema
implementation is supplied by this component. No endpoint is emulated.
The current contract has no incremental/full recomputation command:
the report explicitly marks that comparison blocked. The integrator must
supply an entrypoint to test incremental rebuild drift. The existing metric
oracles compare API results to full SQL ground truth on each verification.

## Resume, verify, report and cleanup

```sh
node scripts/load/exec.mjs resume --apply --run-id worldwide-1000-v1

# Only if a killed process left a stale lock. Refuses a live owner's PID.
node scripts/load/exec.mjs resume --apply --recover --run-id worldwide-1000-v1

# Re-signs sampled users and runs API + SQL checks; may rotate passwords and
# reversibly mutate sampled visibility/friendship state in worldwide mode.
node scripts/load/exec.mjs verify --apply --run-id worldwide-1000-v1

# Read-only display of the latest persisted report.
node scripts/load/exec.mjs report --run-id worldwide-1000-v1

node scripts/load/exec.mjs cleanup --apply --run-id worldwide-1000-v1
# Add --recover only for a stale lock left by a dead process.

# Stop Terminal A before this: destroys this local project's Docker volumes.
node scripts/load/exec.mjs stop --apply
```

The append-only journal fsyncs intents before external writes, records returned
UUIDs before downstream actions, and drops only an incomplete final journal
line during recovery. Auth recovery matches a recorded email intent and
`app_metadata.load_run_id`; it never sweeps unrelated users by a broad prefix.
Edition/wishlist/note replay uses deterministic request IDs. Storage object
paths are recorded before requesting a signed upload. Completed visits are
skipped, while unfinished API sequences replay their stable IDs.

Cleanup verifies Auth ownership before removing recorded objects, deletes
relational data scoped to recorded user IDs, deletes Auth accounts through
the admin API, and removes only deterministic recorded placeholder places.
It does not issue broad prefix deletion or empty the capture bucket.
Repeated cleanup is supported. Keep manifests until cleanup completes.
A cleaned run cannot resume. `stop --apply` is a separate destructive action
for the whole disposable project; it is not a replacement for the scoped
cleanup assertion.

## Evidence and oracle scope

Artifacts live under the root's existing ignored `out/` directory:

| Path                                            | Contents                                         |
| ----------------------------------------------- | ------------------------------------------------ |
| `out/load/cache/pool.json`                      | Photo provenance and downloaded-byte hashes      |
| `out/load/cache/<sha256>.jpg`                   | Actual stock bytes, never committed              |
| `out/load/runs/<runId>/manifest.json`           | Seed, anchor, bounds and fixture/pool hashes     |
| `out/load/runs/<runId>/journal.jsonl`           | Resource intents/IDs, no credentials             |
| `out/load/runs/<runId>/avatar-*.svg`            | Local geometric avatars                          |
| `out/load/runs/<runId>/report.json`             | Latest API/SQL/latency report                    |
| `out/load/runs/<runId>/report-<timestamp>.json` | Prior verification snapshots                     |
| `out/load/runs/<runId>/failure.json`            | Last failed command, if any                      |
| `out/load/runs/smoke-result.json`               | Last smoke and sentinel run IDs, cleanup outcome |

Reports contain counts, check names, statuses, route latency percentiles and
response-status counts, SQL query plans and sampled indexes. They do not
contain tokens, passwords, signed URLs, note bodies or raw provider payloads.
Latency describes requests made in that process (including verification);
archived reports preserve earlier workload timings across resume. There is
no implicit SLO or claim of production capacity.

SQL oracles check sampled owner edition/place/city/streak counts; public
place counts, distinct city cohorts, sentiment suppression, eight complete
UTC-week trends; friends counts; global leaderboard ordering; live feed
visibility and five cursor pages; non-friend stats/capture isolation;
friend convergence and old-cursor privacy after revocation; visibility-change
metric freshness; FK/event integrity and RLS/revoked grants.
The entire run's edition count is checked, while profile/metric API parity is
sampled. This is not an exhaustive privacy proof or a provider quality audit.

EXPLAIN uses ordered probes with `enable_seqscan=off` and `enable_sort=off`
to establish index eligibility, not production cost selection. Small datasets
can legitimately prefer an older single-column index for an unordered count;
that is not treated as evidence that the composite index is missing.
The contracts' descending indexes use `NULLS LAST`; the
matching feed/leaderboard ordering in the EXPLAIN probes is explicit.
Core mode marks unimplemented worldwide checks blocked and can pass the
infrastructure smoke. Worldwide mode fails on missing required endpoints or
failed assertions and separately reports the missing recomputation interface.

## Reviewed API and license references

- [Supabase admin createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser)
- [Supabase admin updateUserById](https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid)
- [Supabase admin deleteUser](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser)
- [Signed upload](https://supabase.com/docs/reference/javascript/file-buckets-uploadtosignedurl)
- [CLI configuration](https://supabase.com/docs/guides/local-development/cli/config)
- [Docker bridge host bindings](https://docs.docker.com/engine/network/drivers/bridge/)
- [Lorem Picsum source metadata/download API](https://picsum.photos/)
- [Unsplash license](https://unsplash.com/license)

The stock pool uses Picsum-delivered Unsplash photos for private local synthetic
tests. The license does not authorize resale without significant modification
or a competing stock service. This harness makes no claims about Google
retention, OSM/ODbL compliance, provider refresh quotas, or licensed Commons
destination photography; those remain provider-adapter responsibilities.

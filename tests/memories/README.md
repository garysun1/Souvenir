# Import and taste backend checks

`pnpm exec vitest run tests/memories` runs deterministic tests without a database,
provider, or storage account. The SDK/storage doubles verify boundaries; they do
not replace database permission, concurrency, or hosted media verification.

## Disposable integration gate

After obtaining permission to apply migrations to a new local disposable database:

```sh
node tests/memories/check-backend.mjs --allow-disposable-db
```

The runner starts its own `postgres:16` Docker container on loopback with a random
port, applies the checked-in schema, passes only that URL to Vitest, and removes
the container in `finally`. It never reads an environment file or uses an existing
`DATABASE_URL`. Its tests use synthetic accounts, bytes, and deterministic provider
and storage doubles. They exercise the real Drizzle queries and transactions.
Never point the integration configuration at hosted or persistent account data.

## Opt-in semantic evaluation

All fixture descriptions and SVG source artwork in `eval-fixtures.ts` were
authored for this repository and are dedicated under CC0-1.0. No photos, faces,
identities, or private user content are included.

```sh
pnpm exec tsx tests/memories/run-eval.ts
```

This default command renders three synthetic PNGs and writes an inventory marked
`not_run` under ignored `tests/memories/eval-output/`. It never calls a provider.

Only after approval, with `OPENAI_API_KEY` configured on the server:

```sh
pnpm exec tsx tests/memories/run-eval.ts --live
```

That executes the six text cases. To execute the three image cases, place only the
generated synthetic PNGs in an approved existing artifact/storage system, then
supply its HTTPS directory with `--images-base-url=...`. The runner never deploys
or uploads files. Never substitute real user photos. Each case calls the actual
adapter once; SDK retries are disabled.

The report retains individual outputs, expected-category misses, unsupported
categories, abstention behavior, rejected results, and latency. Schema/source
validation runs in the production adapter. Free text still needs human review
for unsupported claims, sensitive inference, and appropriate uncertainty.
Offline harness tests are not a semantic quality score.

## Integration notes

The API follows `docs/memories-contracts.md`. Analyze imports in groups of at most
five items, with two provider calls in flight per request, and no more than three
attempts per item. Taste refresh accepts up to 100 selected sources and at most
five consented photo sources. The default is
`TASTE_MODEL=gpt-4o-mini-2024-07-18`; the only other accepted model is
`gpt-4o-2024-08-06`. No mock fallback is used in runtime routes.

Refresh the returned version before a new mutation. Reusing an analysis request
ID retries failed/expired work; a completed replay does not call the provider.
Changing that request's payload is a conflict. A superseded/expired taste result
returns a conflict and cannot overwrite edits or source deletion. Manually
reviewing an image after provider failure permits saving without AI.

Publication is a separate explicit snapshot. Updating a draft does not silently
republish it. Source exclusions/removals invalidate derived evidence and sharing.
Friend comparison reads only approved facets, and media collage IDs are a
separate explicit grant consumed by the shared-moment backend.

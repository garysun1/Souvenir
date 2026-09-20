# Social service integration

All routes use verified Next API authentication and private/no-store responses.
The existing `/api/me` profile response remains compatible; `/api/me/stats`
returns `ProfileStatsDto` with viewer-specific statistics.

## Metadata hooks

Import from `src/lib/server/activity.ts` and invoke inside the transaction that
writes the target:

```ts
await syncNoteActivity(tx, verifiedUserId, noteId);
await afterPlaceChange(tx, placeId, { city: previousCity, country: previousCountry });
```

Call `syncNoteActivity` after note insert and patch. Note deletion cascades its
event automatically. Legacy private tips never appear in the feed.

Call `afterPlaceChange` after locality or visibility edits. Supply the previous
city/country when moving a place so both city cohorts refresh. It also refreshes
affected collectors' private projections and invalidates set completion events.
All edition, ranking and wishlist mutations already call their hooks.

For the authorized place-detail response, import from `src/lib/server/stats.ts`:

```ts
const metrics = await getPlaceMetrics(viewerId, placeId);
const social = await getPlaceSocial(viewerId, placeId);
```

Both functions verify place access. Metrics include only public contributions
on public places and are null for nonpublic places. Friend counts must be fetched
per viewer, never placed in shared caches. Original rarity attributes,
personal appeal and documented availability are not overwritten. Do not use
legacy `places.stats` as an account's activity metrics.

## Recompute and freshness

```sh
# Explicit disposable local DATABASE_URL; no dotenv or hosted credentials loaded.
corepack pnpm exec tsx scripts/recompute-stats.ts
corepack pnpm exec tsx scripts/recompute-stats.ts 2026-09-20T00:00:00Z
node tests/server/check-social.mjs
```

The script rejects non-loopback database hosts. The integration harness creates,
migrates and removes its own PostgreSQL 16 container, drops ambient credentials,
runs real service/route queries, and executes the recompute script.

`recomputeStats({ placeIds?, userIds?, previousLocalities?, now?,
expandLocalities? }, transaction?)` supports both full and scoped rebuilds.
Omitting both ID arrays rebuilds all aggregates. Empty arrays mean no work.
Edition writes refresh the touched place, its city/country peers and one user's
projection. Rankings and saves pass `expandLocalities: false`. Advisory locks
serialize city updates; place writes batch in groups of 500. These writes never
calculate global ranks. Leaderboards calculate audience-filtered ranks on read.

Place metrics and trending refresh on read after five minutes; the local full
script can also be run by the integrating maintenance process to roll windows.
The five-minute `computedAt` window is an explicit freshness bound. Profile
statistics and ranks are evaluated on read and never use another viewer's cache.
The `user_stats` table holds owner-only counts; its rank columns remain unset,
because global/city ranks require current visibility filtering.

Frequency uses distinct collectors in the same 90-day window and city+country,
including the target place, with a minimum cohort of five. Sentiment uses the
normalized ranking row, not ranking-group JSON. Trend compares last-seven-day
unique collectors with eight complete UTC ISO weeks. Streaks use each edition's
IANA timezone for its ISO week; the latest included edition's timezone determines
the current week. A streak stays current during the week following the last
recorded week. Unknown city/country never enters city ranks.

## Friendship and feed behavior

The frozen friendship schema encodes the requester in `user_id` while pending.
All pair operations acquire the same sorted unordered-pair advisory lock.
Acceptance stores a single sorted pair, including simultaneous cross requests;
deletion removes either orientation. The database's existing revoke trigger
removes friendship events on deletion or downgrade.

User-detail editions are available only to self or accepted friends, further
filtered by edition and place visibility. Profile statistics additionally
respect `statsVisibility`. Global/city leaderboards include only public
statistics profiles and public contributions. Friends boards apply the
viewer's permissions. Equal counts share a rank, with UUID ordering for stable
pagination.

Feed pages recheck accepted friendship, target visibility and target existence.
Their cursor preserves PostgreSQL microseconds and sorts by timestamp then
event UUID descending. Profiles/editions use allowlist serializers. Feed place
projections omit legacy stats, raw external IDs and hero-image URLs; the feed
does not sign private captures. Set completion events require every member
place to have an accessible nonprivate edition. Removing the final qualifying
visit revokes the completion event.

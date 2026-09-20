# Shared memory API integration

Run `node tests/memory-sharing/check.mjs` after `pnpm install --frozen-lockfile`.
Docker and PostgreSQL's `postgres:16` image are required. The harness creates a
fresh container bound only to loopback, applies the repository's migration
journal, injects synthetic provider configuration, runs Vitest, and removes the
container in `finally`. It does not load `.env` files or contact hosted services.
The test config refuses non-loopback databases and requires the harness marker.

Tests exercise real Drizzle/PostgreSQL queries, constraints, transactions,
authentication handlers, account bootstrap, CSRF checks, request validation,
DTOs, and API envelopes. Supabase's identity/storage SDKs and Next's cookie store
are mocked; these tests do not verify live token issuance, bucket configuration,
object existence, or browser behavior. All users, places, and media references
are synthetic. The default `pnpm test` suite is separate from this DB harness.

## Endpoints

All requests use verified bearer or cookie authentication and return
`Cache-Control: private, no-store`. Successes are `{ data }`; errors use the
existing `{ error, message? }` envelope. Bodies/UUID params are validated against
`src/lib/contracts/memories.ts`; wire types are `shared/memories-contract.ts`.

| Path                                     | Methods            |
| ---------------------------------------- | ------------------ |
| `/api/albums`                            | GET, POST          |
| `/api/albums/:albumId`                   | GET, PATCH, DELETE |
| `/api/albums/:albumId/members`           | GET, POST          |
| `/api/albums/:albumId/members/:memberId` | PATCH              |
| `/api/albums/:albumId/moments`           | GET                |
| `/api/album-invitations`                 | GET                |
| `/api/moments`                           | GET, POST          |
| `/api/moments/:momentId`                 | GET, PATCH, DELETE |
| `/api/moments/:momentId/photo`           | GET                |
| `/api/moments/:momentId/tags`            | GET, POST          |
| `/api/moments/:momentId/tags/:tagId`     | PATCH              |
| `/api/moment-tag-invitations`            | GET                |

List GETs accept `limit` (default 25, max 50) and optional UUID `cursor`, return
`{ items, nextCursor }`, and order UUIDs ascending. Invitation cursors use the
membership/tag ID, not the album/moment ID.

Creation/invitation POSTs use `requestId`. Retries replay the original response
without reviving removed grants; changed payloads reject with
`409 idempotency_conflict`. Refresh the resource after replay when the current
version/state matters. PATCH/DELETE require `expectedVersion`; stale or duplicate
state transitions return `409 conflict`. New/reinvited records return 201;
existing active invitations and exact request replays return 200.

## Permissions and integration boundaries

- Album owners are implicit. Only they edit/delete an album or invite accepted
  friends. Pending invitees receive only title/owner and their membership DTO.
  A recipient must accept before album feed/member access or contributions.
- Accepted album membership is independent of current friendship. Leaving or
  removal hides that author's album contributions from remaining members until
  an explicit reinvitation and acceptance. Authors retain their own moments.
- Only authors edit/withdraw moments. Deleting an album detaches all moments,
  increments their versions, and preserves source media and independent tags.
- Moment creation never creates an edition. Sources must belong to the actor.
  Edition stops come from the stored visit; conflicting replacements reject.
  Import sources require uploaded/ready/committed state and an owned active
  batch. `confirmedStop`, `groupKey`, and album `outingId` preserve associations.
  An import item can have only one moment, including moments created by import
  commit; a second direct creation returns a conflict.
- Only an author can tag an accepted friend, with `confirmShare: true`.
  Pending/accepted recipients see exactly that moment and their own tag, not
  its album feed/member list, other tags, or original edition API. Only a
  recipient accepts/declines; either party may remove an active tag.
- Tag and published-collage reads recheck accepted friendship every time.
  Publishing only grants media listed in `tasteProfiles.published.collageMomentIds`
  while `sharing = friends`; draft collage IDs grant nothing.
- `memory-sharing-access.ts` exports `requireAlbum`, `lockAlbum`, `momentDto`,
  `albumAccess`, `activeAlbumAuthor`, `availableMomentSource`, and `momentAccess`
  for integration. `requireAlbum` accepts a transaction. Other transaction-based
  album writers should lock the album before checking current membership.
- Import commit must write the contract's author/source columns consistently;
  the media reader checks both source and batch ownership. Imported photo paths
  must equal `<authorId>/<item.requestId>.jpg|png|webp`. Captured edition paths use
  the edition's request ID. Imported editions retain the original upload path,
  verified against the owner's durable `import.item.create` receipt, including
  after the import item is deleted. Sources that are removed, cancelled, or no
  longer complete cannot be read through a surviving moment.
  Deleting an edition or import removes its photo only after no edition or import
  item references the path; the cleanup holds the owner's account lock.
- Photo GET authorizes first, resolves the owned source server-side, validates
  the exact private object identity, rechecks access, then signs `captures` for
  300 seconds. It returns only `url`/`expiresAt`. It never uses external `photoUrl`.
  Existing `getEditionPhoto` and owner-only storage validation are unchanged.
  Revocation prevents subsequent signing; already issued URLs live until expiry,
  and downloaded copies cannot be recalled.

Coverage includes third-user isolation, both directions of accepted friendship,
pending/removed/declined grants, reinvitation, forged source/path/owner fields,
cross-author mutation attempts, cookie/bearer parity and new-account bootstrap,
unverified bearer rejection, no cookie fallback, CSRF, concurrent request replay,
duplicate acceptance, stale writes, withdrawal, cancellation, source deletion,
album deletion, authorized pagination, and private no-store errors.

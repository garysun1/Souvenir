# Taste and memories contract v1

Shared transport exports: `shared/memories-contract.ts`. Server schemas:
`src/lib/contracts/memories.ts`. Every success below is wrapped in `{ data: T }`;
errors use existing `ApiResult<T>` error codes. DTO dates are ISO instants, never
`Date`. All IDs are UUIDs. Auth is verified cookie/bearer with account bootstrap.
Every response is private/no-store. Never broaden the existing edition/photo API.

## Route inventory

`:batchId`, `:itemId`, `:albumId`, `:memberId`, `:momentId`, `:tagId`, and `:userId`
use respectively `importBatchParamsSchema`, `importItemParamsSchema`,
`albumParamsSchema`, `albumMemberParamsSchema`, `momentParamsSchema`,
`momentTagParamsSchema`, and `tasteUserParamsSchema`. Combined params schemas
include their parent ID. All list GETs use `memoryPageQuerySchema` /
`MemoryPageQuery` and return `MemoryPageDto<T>` with `items`, `nextCursor`.
Order by UUID ascending, limit defaults to 25, maximum 50.

| Method and path                                   | Request schema / wire type                        | Data response                         |
| ------------------------------------------------- | ------------------------------------------------- | ------------------------------------- |
| POST /api/imports                                 | importBatchCreateSchema / ImportBatchCreate       | ImportBatchDto                        |
| GET /api/imports                                  | memoryPageQuerySchema / MemoryPageQuery           | MemoryPageDto<ImportBatchDto>         |
| GET /api/imports/:batchId                         | none                                              | ImportBatchDto                        |
| DELETE /api/imports/:batchId                      | memoryVersionSchema / MemoryMutation              | MemoryDeletedDto                      |
| POST /api/imports/:batchId/items                  | importItemCreateSchema / ImportItemCreate         | ImportItemUploadDto                   |
| PATCH /api/imports/:batchId/items/:itemId         | importItemPatchSchema / ImportItemPatch           | ImportItemDto                         |
| DELETE /api/imports/:batchId/items/:itemId        | memoryVersionSchema / MemoryMutation              | MemoryDeletedDto                      |
| POST /api/imports/:batchId/items/:itemId/complete | memoryVersionSchema / MemoryMutation              | ImportItemDto                         |
| GET /api/imports/:batchId/items/:itemId/photo     | none                                              | MemoryPhotoDto                        |
| POST /api/imports/:batchId/analyze                | importAnalyzeSchema / ImportAnalyzeRequest        | ImportBatchDto                        |
| POST /api/imports/:batchId/commit                 | importCommitSchema / ImportCommitRequest          | ImportCommitDto                       |
| GET /api/taste                                    | none                                              | TasteProfileDto                       |
| PATCH /api/taste                                  | tasteProfilePatchSchema / TasteProfilePatch       | TasteProfileDto                       |
| DELETE /api/taste                                 | memoryVersionSchema / MemoryMutation              | MemoryDeletedDto                      |
| POST /api/taste/analyze                           | tasteAnalyzeSchema / TasteAnalyzeRequest          | TasteProfileDto                       |
| POST /api/taste/publish                           | tastePublishSchema / TastePublishRequest          | TasteProfileDto                       |
| GET /api/users/:userId/taste                      | none                                              | TasteSharedProfileDto                 |
| GET /api/users/:userId/taste-comparison           | tasteComparisonQuerySchema / TasteComparisonQuery | TasteComparisonDto                    |
| POST /api/albums                                  | tripAlbumCreateSchema / TripAlbumCreate           | TripAlbumDto                          |
| GET /api/albums                                   | memoryPageQuerySchema / MemoryPageQuery           | MemoryPageDto<TripAlbumDto>           |
| GET /api/albums/:albumId                          | none                                              | TripAlbumDto                          |
| PATCH /api/albums/:albumId                        | tripAlbumPatchSchema / TripAlbumPatch             | TripAlbumDto                          |
| DELETE /api/albums/:albumId                       | memoryVersionSchema / MemoryMutation              | MemoryDeletedDto                      |
| GET /api/albums/:albumId/members                  | memoryPageQuerySchema / MemoryPageQuery           | MemoryPageDto<AlbumMemberDto>         |
| POST /api/albums/:albumId/members                 | albumMemberInviteSchema / AlbumMemberInvite       | AlbumMemberDto                        |
| PATCH /api/albums/:albumId/members/:memberId      | invitationRespondSchema / InvitationRespond       | AlbumMemberDto                        |
| GET /api/album-invitations                        | memoryPageQuerySchema / MemoryPageQuery           | MemoryPageDto<AlbumInvitationDto>     |
| GET /api/albums/:albumId/moments                  | memoryPageQuerySchema / MemoryPageQuery           | MemoryPageDto<MemoryMomentDto>        |
| POST /api/moments                                 | memoryMomentCreateSchema / MemoryMomentCreate     | MemoryMomentDto                       |
| GET /api/moments                                  | memoryPageQuerySchema / MemoryPageQuery           | MemoryPageDto<MemoryMomentDto>        |
| GET /api/moments/:momentId                        | none                                              | MemoryMomentDto                       |
| PATCH /api/moments/:momentId                      | memoryMomentPatchSchema / MemoryMomentPatch       | MemoryMomentDto                       |
| DELETE /api/moments/:momentId                     | memoryVersionSchema / MemoryMutation              | MemoryDeletedDto                      |
| GET /api/moments/:momentId/photo                  | none                                              | MemoryPhotoDto                        |
| GET /api/moments/:momentId/tags                   | memoryPageQuerySchema / MemoryPageQuery           | MemoryPageDto<MomentTagDto>           |
| POST /api/moments/:momentId/tags                  | momentTagCreateSchema / MomentTagCreate           | MomentTagDto                          |
| PATCH /api/moments/:momentId/tags/:tagId          | invitationRespondSchema / InvitationRespond       | MomentTagDto                          |
| GET /api/moment-tag-invitations                   | memoryPageQuerySchema / MemoryPageQuery           | MemoryPageDto<MomentTagInvitationDto> |

## Persistence, imports, and replay

Tables: `importBatches`, `importItems`, `tasteProfiles`, `tasteEvidence`,
`tripAlbums`, `tripAlbumMembers`, `memoryMoments`, `momentPersonTags`. All have
RLS enabled with no browser policies: access is exclusively through authorized
server handlers. Provider calls are outside transactions. Versions start at 1.
Mutations with `expectedVersion` atomically compare/increment it (409 `conflict`).
Use existing `apiRequests` for request hash/replay; a repeated requestId with
different content is 409 `idempotency_conflict`. Retry responses precede version
checks. Batch item changes also increment the batch version.

Imports are owner-only. Register at most 20 items per batch under a batch lock.
POST items returns an existing upload contract (`captures` bucket, owner path)
or `upload:null` for duplicates. The server computes/verifies SHA256 on complete,
sniffs bytes, bounds decoded pixels, verifies size, and transitions
pending_upload → uploaded. Identical owner/hash files across batches are
duplicate references, never cross-owner references. Existing items can be retried
with the original request identity to renew upload credentials.

Analysis handles up to 5 selected items per call, with bounded provider
concurrency. Persist item processing lease/token/expiry and attempts; release or
expire leases on failure, at most 3 attempts per item. Response contains current
persisted progress (processing is allowed); GET resumes inspection, POST retries
failed/expired work. Validate `MemoryAnalysis` with `memoryAnalysisSchema`.
The service must also ground outputs in selected, owned IDs and enforce image
consent. Errors are sanitized into item error code/message/retryable.

Metadata is a suggestion, not a visit. `confirmedStop` is a separately confirmed
place + instant + IANA timezone; null means unresolved. `groupKey` supports
merge/split by assigning the same/different opaque user-editable key. Group by
confirmed local calendar day then place then group key; unresolved moments are
separate. No ambient device location may confirm historical photos.

POST commit accepts an explicit `target` (private or album with confirmShare).
It atomically creates one moment per selected ready/uploaded item; duplicate
items cannot commit. `createVisit:true` additionally requires a persisted
confirmedStop and creates an owner-only edition via existing capture semantics;
never create another member's visit. Store resulting editionId on the item.
Responses include the created moments and editionIds for linking client flows.
An item can commit once. Batches allow subsequent commits of remaining items;
state is committed when all nonduplicate items have committed. Album creation is
separate: POST /api/albums with optional owned `sourceBatchId`/authorized
`outingId`, then pass its ID to commit. Album links grant no source batch access.
Deleting an import item/batch revokes derived moment/evidence access; committed
editions remain independent visits (their private media is not deleted blindly).

## Taste, overrides, and comparison

GET /api/taste lazily creates an empty version-1 profile. Only the owner receives
draft, evidence, preferences, selected/excluded sources, or override records.
Source IDs mean edition ID, import item ID, or place ID for saved_place,
favorite, recommendation (validate the actor's save/preference/ranking).
An edition source without consentImages permits existing text/place facts only,
never provider image bytes. import_item sources require explicit image consent.
Optional notes are untrusted context; they cannot fabricate source IDs.
AI cannot infer preferences, sensitive traits, faces, identities, or emotions.
Validate provider output with `tasteAnalysisResultSchema` / `TasteAnalysisResult`;
every observation's source must also belong to the authorized selected set.
The model returns observations, never evidence IDs, profile revisions, or sharing.

Generate only controlled TASTE_INTERESTS. Persist analysis lease/version and
selected sources before provider work. A late result must match both lease and
profile version; an intervening edit/deletion/exclusion wins. Photo observations
are weak evidence; deduplicate hashes and cap each visit before aggregation.
Manual overrides survive refresh: prefer outranks inference, dismiss removes a
facet. A null titleOverride restores generated title. PATCH arrays replace
their complete field; excluded sources invalidate their evidence immediately.
Publishing copies only user-approved title/facets/collage IDs. Private publish
revokes sharing immediately. Collage IDs are a separate explicit media grant;
only owner-authored moments may be selected. Published title/facets never carry
evidence, notes, preferences, metadata, coordinates, or private photo paths.
Deleting a profile removes evidence and all profile-derived sharing.

GET shared taste requires accepted friendship and friends sharing. Comparison
additionally requires both parties' published friends profiles; otherwise 404.
Only their published facets enter deterministic definitionVersion=1 scoring.
No shared published facets: insufficient. At least 2 facets per party are needed
for ready coverage; common-interest Jaccard >= 0.5 is strong, >0 is some, zero is
different; below coverage threshold overlap is insufficient. Intent must match
for an interest to count as common; strength is displayed but not scored in v1.
Return at most 2 accessible catalog suggestions with matched interests/reason;
retain the PlaceDto's existing known/unknown availability semantics. Do not
replace legacy shared-visit `tasteOverlap`. Recheck friendship on every read.

## Albums, tags, and signed media permissions

Album owner is implicit, not a membership row. Invite accepted friends only;
pending invitees see invitation title/owner but cannot list members or moments.
Only owner invites or edits/deletes the album. Recipient accepts/declines a
pending invitation; recipient can remove their own pending/accepted association,
and owner can remove another member. Declined/removed rows require a new explicit
owner invitation (same row, version increment) to return to pending. Contributions
require accepted membership, visible author attribution, and author-owned media.
Only their author edits/withdraws a moment. Owner can delete the album but not
another person's source media; moments detach into author-private records and
independent explicit tags remain. Leaving/removal ends that member's album
contributions' visibility to remaining members until they explicitly rejoin.
GET /api/moments lists only the actor's authored moments.

POST /api/moments accepts one owner-controlled edition/import_item and explicit
target. It never creates visits. Direct import-item moments require complete
uploaded/ready/committed bytes. `confirmedStop` is optional; an edition source
uses its stored confirmed place/date. Any supplied conflicting stop is rejected.

Tags are separate from album membership. Only the moment author sends a tag to
an accepted friend with confirmShare:true. Pending/accepted recipient may GET
exactly that moment and its signed photo to review the invitation. They cannot
read its album, other moments, source edition, or other tags. Author lists all
tags; a recipient sees only their own tag. Recipient accepts/declines/removes;
sender can remove; no sender may accept on someone else's behalf. Declined or
removed tags cease access immediately, and reinvite needs new explicit consent.

GET moment/photo signs only after checking one of: author; active album
membership plus active author's membership (or album owner); pending/accepted
explicit tag; or accepted friendship plus an explicitly published collage grant.
Accepted friendship is also required for tag-derived reads; friend removal
revokes tags/comparisons/collage reads, but separately accepted album membership
is independent. No tag state confers album membership. Signed responses contain
only url/expiresAt (maximum 300 seconds), never private path. Withdrawal/deletion
revokes subsequent signing; previously downloaded copies cannot be recalled.
Unknown/inaccessible resource IDs return 404; unauthorized sessions 401.

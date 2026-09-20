import type { Instant, PhotoUploadDto, PlaceDto, UUID } from "./api-contract";

export const MEMORY_LIMITS = {
  batchItems: 20,
  imageBytes: 10 * 1024 * 1024,
  analysisItems: 5,
  sourceCount: 100,
  interests: 20,
  collageItems: 6,
  pageSize: 50,
} as const;
export const MEMORY_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const TASTE_INTERESTS = [
  "gardens",
  "architecture",
  "museums",
  "street_food",
  "waterfronts",
  "hiking",
  "beaches",
  "parks",
  "art",
  "history",
  "cafes",
  "markets",
  "live_music",
  "theater",
  "local_food",
  "photography",
  "scenic_views",
  "wildlife",
  "cycling",
  "bookshops",
] as const;
export type TasteInterest = (typeof TASTE_INTERESTS)[number];
export type MemoryMimeType = (typeof MEMORY_MIME_TYPES)[number];
export type ImportBatchState = "open" | "processing" | "ready" | "committed" | "cancelled";
export type ImportItemState =
  | "pending_upload"
  | "uploaded"
  | "processing"
  | "ready"
  | "failed"
  | "duplicate"
  | "committed";
export type InvitationState = "pending" | "accepted" | "declined" | "removed";
export type TasteIntent = "enjoyed" | "want_to_try";
export type TasteSourceKind =
  | "edition"
  | "import_item"
  | "saved_place"
  | "favorite"
  | "recommendation";
export interface TasteSourceRef {
  kind: TasteSourceKind;
  id: UUID;
}
export interface MemoryPageQuery {
  cursor?: UUID;
  limit: number;
}
export interface MemoryPageDto<T> {
  items: T[];
  nextCursor: UUID | null;
}
export interface MemoryMutation {
  expectedVersion: number;
}
export interface MemoryDeletedDto {
  deleted: true;
}
export interface MemoryPhotoDto {
  url: string;
  expiresAt: Instant;
}

export interface ImportMetadata {
  capturedAt: Instant | null;
  timezone: string | null;
  latitude: number | null;
  longitude: number | null;
  accuracyM: number | null;
  origin: "exif" | "manual" | "unknown";
}
export interface ConfirmedMemoryStop {
  placeId: UUID;
  capturedAt: Instant;
  timezone: string;
}
export interface MemoryAnalysis {
  version: 1;
  interests: TasteInterest[];
  scene: string | null;
  confidence: number;
}
export interface ImportBatchCreate {
  requestId: UUID;
  title: string;
}
export interface ImportItemCreate {
  requestId: UUID;
  sha256: string;
  fileName: string;
  contentType: MemoryMimeType;
  sizeBytes: number;
  metadata: ImportMetadata;
}
export interface ImportItemDto {
  id: UUID;
  batchId: UUID;
  fileName: string;
  contentType: MemoryMimeType;
  sizeBytes: number;
  sha256: string;
  state: ImportItemState;
  metadata: ImportMetadata;
  analysis: MemoryAnalysis | null;
  groupKey: string | null;
  confirmedStop: ConfirmedMemoryStop | null;
  duplicateOfItemId: UUID | null;
  editionId: UUID | null;
  error: { code: string; message: string; retryable: boolean } | null;
  version: number;
  createdAt: Instant;
  updatedAt: Instant;
}
export interface ImportBatchDto {
  id: UUID;
  title: string;
  state: ImportBatchState;
  version: number;
  items: ImportItemDto[];
  createdAt: Instant;
  updatedAt: Instant;
}
export interface ImportItemUploadDto {
  item: ImportItemDto;
  upload: PhotoUploadDto | null;
}
export interface ImportItemPatch extends MemoryMutation {
  groupKey?: string | null;
  confirmedStop?: ConfirmedMemoryStop | null;
  metadata?: ImportMetadata;
}
export interface ImportAnalyzeRequest extends MemoryMutation {
  requestId: UUID;
  itemIds: UUID[];
  consentImages: true;
}
export type MemoryTarget =
  | { kind: "private" }
  | { kind: "album"; albumId: UUID; confirmShare: true };
export interface ImportCommitRequest extends MemoryMutation {
  requestId: UUID;
  target: MemoryTarget;
  items: { itemId: UUID; createVisit: boolean; note: string | null }[];
}
export interface ImportCommitDto {
  batch: ImportBatchDto;
  moments: MemoryMomentDto[];
  editionIds: UUID[];
}

export interface TasteFacet {
  interest: TasteInterest;
  intent: TasteIntent;
  strength: 1 | 2 | 3;
}
export interface TasteDraftFacet extends TasteFacet {
  evidenceIds: UUID[];
}
export interface TastePreferences {
  pace: "relaxed" | "balanced" | "busy" | null;
  budget: "free" | "moderate" | "flexible" | null;
  accessibility: string | null;
}
export interface TasteOverride {
  interest: TasteInterest;
  intent: TasteIntent;
  action: "prefer" | "dismiss";
  strength: 1 | 2 | 3;
}
export interface TasteDraft {
  title: string | null;
  facets: TasteDraftFacet[];
  coverage: "insufficient" | "ready";
}
export interface TastePublished {
  title: string | null;
  facets: TasteFacet[];
  collageMomentIds: UUID[];
  publishedAt: Instant;
}
export interface TasteEvidenceDto {
  id: UUID;
  source: TasteSourceRef;
  interest: TasteInterest;
  intent: TasteIntent;
  confidence: number;
  explanation: string;
  analysisVersion: number;
  excluded: boolean;
}
export interface TasteAnalysisResult {
  title: string | null;
  observations: {
    source: TasteSourceRef;
    interest: TasteInterest;
    intent: TasteIntent;
    confidence: number;
    explanation: string;
  }[];
}
export interface TasteProfileDto {
  userId: UUID;
  version: number;
  draft: TasteDraft | null;
  published: TastePublished | null;
  sharing: "private" | "friends";
  overrides: TasteOverride[];
  preferences: TastePreferences;
  titleOverride: string | null;
  selectedSources: TasteSourceRef[];
  excludedSources: TasteSourceRef[];
  collageMomentIds: UUID[];
  evidence: TasteEvidenceDto[];
  analysisState: "idle" | "processing" | "ready" | "failed";
  analysisVersion: number;
  updatedAt: Instant;
}
export interface TasteAnalyzeRequest extends MemoryMutation {
  requestId: UUID;
  sources: TasteSourceRef[];
  note?: string;
  consentImages: boolean;
}
export interface TasteProfilePatch extends MemoryMutation {
  titleOverride?: string | null;
  overrides?: TasteOverride[];
  preferences?: TastePreferences;
  excludedSources?: TasteSourceRef[];
  collageMomentIds?: UUID[];
}
export interface TastePublishRequest extends MemoryMutation {
  sharing: "private" | "friends";
  title: string | null;
  facets: TasteFacet[];
  collageMomentIds: UUID[];
  confirmShare: boolean;
}
export interface TasteSharedProfileDto {
  userId: UUID;
  version: number;
  published: TastePublished;
}
export interface TasteComparisonQuery {
  city?: string;
  country?: string;
}
export interface TasteComparisonDto {
  definitionVersion: 1;
  commonInterests: TasteInterest[];
  overlap: "insufficient" | "some" | "strong" | "different";
  coverage: "insufficient" | "ready";
  explanation: string;
  suggestions: { place: PlaceDto; matchedInterests: TasteInterest[]; reason: string }[];
}

export interface TripAlbumCreate {
  requestId: UUID;
  title: string;
  description?: string | null;
  outingId?: UUID | null;
  sourceBatchId?: UUID | null;
}
export interface TripAlbumPatch extends MemoryMutation {
  title?: string;
  description?: string | null;
}
export interface TripAlbumDto {
  id: UUID;
  ownerId: UUID;
  title: string;
  description: string | null;
  outingId: UUID | null;
  sourceBatchId: UUID | null;
  role: "owner" | "contributor";
  version: number;
  createdAt: Instant;
  updatedAt: Instant;
}
export interface AlbumMemberInvite {
  requestId: UUID;
  userId: UUID;
}
export interface InvitationRespond extends MemoryMutation {
  state: "accepted" | "declined" | "removed";
}
export interface AlbumMemberDto {
  id: UUID;
  albumId: UUID;
  userId: UUID;
  invitedBy: UUID;
  state: InvitationState;
  role: "contributor";
  version: number;
  createdAt: Instant;
  updatedAt: Instant;
}
export interface AlbumInvitationDto {
  membership: AlbumMemberDto;
  albumTitle: string;
  ownerId: UUID;
}
export type MemoryMediaSource = { kind: "edition"; id: UUID } | { kind: "import_item"; id: UUID };
export interface MemoryMomentCreate {
  requestId: UUID;
  source: MemoryMediaSource;
  target: MemoryTarget;
  confirmedStop?: ConfirmedMemoryStop | null;
  groupKey?: string | null;
  note?: string | null;
}
export interface MemoryMomentPatch extends MemoryMutation {
  note?: string | null;
  groupKey?: string | null;
  confirmedStop?: ConfirmedMemoryStop | null;
}
export interface MemoryMomentDto {
  id: UUID;
  authorId: UUID;
  albumId: UUID | null;
  source: MemoryMediaSource;
  confirmedStop: ConfirmedMemoryStop | null;
  groupKey: string | null;
  note: string | null;
  version: number;
  createdAt: Instant;
  updatedAt: Instant;
}
export interface MomentTagCreate {
  requestId: UUID;
  userId: UUID;
  confirmShare: true;
}
export interface MomentTagDto {
  id: UUID;
  momentId: UUID;
  senderId: UUID;
  userId: UUID;
  state: InvitationState;
  version: number;
  createdAt: Instant;
  updatedAt: Instant;
}
export interface MomentTagInvitationDto {
  tag: MomentTagDto;
  moment: MemoryMomentDto;
}

/**
 * All responses use ApiResult<T>; private/no-store, verified cookie or bearer auth.
 * Lists use MemoryPageQuery/MemoryPageDto<T>, ordered by UUID ascending.
 * Expected versions reject stale writes with conflict (409). Request IDs replay the
 * original result; changed payloads return idempotency_conflict (409).
 */
export const MEMORIES_API = {
  imports: "/api/imports",
  importBatch: "/api/imports/:batchId",
  importItems: "/api/imports/:batchId/items",
  importItem: "/api/imports/:batchId/items/:itemId",
  importItemComplete: "/api/imports/:batchId/items/:itemId/complete",
  importItemPhoto: "/api/imports/:batchId/items/:itemId/photo",
  importAnalyze: "/api/imports/:batchId/analyze",
  importCommit: "/api/imports/:batchId/commit",
  taste: "/api/taste",
  tasteAnalyze: "/api/taste/analyze",
  tastePublish: "/api/taste/publish",
  sharedTaste: "/api/users/:userId/taste",
  comparison: "/api/users/:userId/taste-comparison",
  albums: "/api/albums",
  album: "/api/albums/:albumId",
  albumMembers: "/api/albums/:albumId/members",
  albumMember: "/api/albums/:albumId/members/:memberId",
  albumInvitations: "/api/album-invitations",
  albumMoments: "/api/albums/:albumId/moments",
  moments: "/api/moments",
  moment: "/api/moments/:momentId",
  momentPhoto: "/api/moments/:momentId/photo",
  momentTags: "/api/moments/:momentId/tags",
  momentTag: "/api/moments/:momentId/tags/:tagId",
  tagInvitations: "/api/moment-tag-invitations",
} as const;

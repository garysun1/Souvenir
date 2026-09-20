export type UUID = string;
export type Instant = string;
export type Category = "nature" | "culture" | "food" | "landmark" | "hidden_gem";
export type Sentiment = "recommend" | "depends" | "skip";
export type Variant = "standard" | "revisit" | "group" | "seasonal";
export type RankingStatus = "settled" | "provisional" | "unranked";
export type ErrorCode =
  | "invalid_json"
  | "invalid_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "idempotency_conflict"
  | "resource_deleted"
  | "photo_not_uploaded"
  | "payload_too_large"
  | "rate_limited"
  | "service_unavailable"
  | "internal_error";
export type ApiResult<T> =
  | { data: T }
  | { error: ErrorCode; message?: string; details?: Record<string, unknown> };

export interface ProfileDto {
  id: UUID;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  homeCity: string | null;
  createdAt: Instant;
}
export interface PlaceDto {
  id: UUID;
  slug: string;
  name: string;
  category: Category;
  lat: number;
  lng: number;
  city: string;
  description: string;
  heroImageUrl: string | null;
  rarityTier: "common" | "uncommon" | "rare" | "epic" | "legendary";
  rarityAppeal: number;
  rarityDiscoveryFreq: number;
  rarityAvailability: number;
  externalIds: Record<string, string> | null;
  stats: Record<string, unknown> | null;
  createdAt: Instant;
}
export interface SetDto {
  id: UUID;
  slug: string;
  name: string;
  description: string;
  coverImageUrl: string | null;
  city: string;
  places: PlaceDto[];
}
export interface SignedPhotoDto {
  path: string;
  url: string;
  expiresAt: Instant;
}
export interface EditionDto {
  id: UUID;
  userId: UUID;
  placeId: UUID;
  requestId: UUID;
  capturedAt: Instant;
  timezone: string;
  note: string | null;
  companions: string[];
  variant: Variant;
  visitSequence: number;
  origin: "capture" | "import" | "legacy";
  importSourceId: string | null;
  outingId: UUID | null;
  photo: SignedPhotoDto | null;
  createdAt: Instant;
}
export interface CollectionEntryDto extends EditionDto {
  place: PlaceDto;
}
export interface EditionCreate {
  requestId: UUID;
  placeId: UUID;
  capturedAt: Instant;
  timezone: string;
  note?: string | null;
  companions?: string[];
  variant?: Variant;
  photoPath?: string | null;
  origin?: "capture" | "import";
  importSourceId?: string | null;
  outingId?: UUID | null;
}
export interface EditionPatch {
  capturedAt?: Instant;
  timezone?: string;
  note?: string | null;
  companions?: string[];
}
export interface PhotoUploadRequest {
  requestId: UUID;
  contentType: "image/jpeg" | "image/png" | "image/webp";
  size: number;
}
export interface PhotoUploadDto {
  bucket: "captures";
  path: string;
  token: string;
  signedUrl: string;
}
export interface WishlistEntryDto {
  placeId: UUID;
  saverIds: UUID[];
  completedBy: UUID[];
}
export interface WishlistDto {
  id: UUID;
  ownerId: UUID;
  name: string;
  isShared: boolean;
  isDefault: boolean;
  memberIds: UUID[];
  entries: WishlistEntryDto[];
}
export interface WishlistCreate {
  requestId: UUID;
  name: string;
  isShared?: boolean;
}
export interface WishlistItemPut {
  placeId: UUID;
  saved: boolean;
  completed?: boolean;
}
export interface RankingDto {
  placeId: UUID;
  sentiment: Sentiment;
  ranking: RankingStatus;
  comparedTo: UUID | null;
  tiedWith: UUID | null;
  rankScore: number | null;
}
export interface RankingGroupDto {
  category: Category;
  sentiment: Sentiment;
  placeIds: UUID[];
  provisionalIds: UUID[];
  ties: [UUID, UUID][];
}
export interface RankingPut {
  sentiment: Sentiment;
  ranking: RankingStatus;
  comparedTo?: UUID | null;
  tiedWith?: UUID | null;
  group?: RankingGroupDto;
}
export interface PlacePreferenceDto {
  placeId: UUID;
  favorite: boolean;
  tip: string;
}
export interface PlacePreferencePut {
  favorite?: boolean;
  tip?: string;
}
export interface PlanConstraintsDto {
  participantIds: UUID[];
  date: string;
  startMinute: number;
  endMinute: number;
  budgetCents: number;
  transport: "walk" | "transit";
  interests: Category[];
  rain: boolean;
  excludedPlaceIds: UUID[];
  preferredPlaceIds: UUID[];
}
export interface PlanStopDto {
  placeId: UUID;
  arrivalMinute: number;
  departureMinute: number;
  costCents: number;
  travelMinutes: number;
}
export interface PlanContent {
  title: string;
  constraints: PlanConstraintsDto;
  stops: PlanStopDto[];
  totalCostCents: number;
  totalMinutes: number;
  checks: string[];
  version: number;
  provenance: "simulation" | "manual";
}
export interface PlanCreate {
  requestId: UUID;
  wishlistId?: UUID | null;
  plan: PlanContent;
}
export interface PlanDto extends PlanCreate {
  id: UUID;
  createdBy: UUID;
  memberIds: UUID[];
  status: "accepted" | "completed";
  createdAt: Instant;
}
export interface BootstrapDto {
  user: ProfileDto;
  places: PlaceDto[];
  sets: SetDto[];
  collection: CollectionEntryDto[];
  wishlists: WishlistDto[];
  rankings: RankingDto[];
  rankingGroups: RankingGroupDto[];
  placePreferences: PlacePreferenceDto[];
  plans: PlanDto[];
}
export interface ProfilePatch {
  displayName?: string;
  homeCity?: string | null;
}
export interface AuthContext {
  userId: UUID;
  email: string | null;
  mode: "cookie" | "bearer";
}
export type AuthResult = { auth: AuthContext } | { response: Response };
export type RequireApiUser = (request: Request) => Promise<AuthResult>;
export type GetCurrentUserId = () => Promise<UUID | null>;
export type EnsureUserProfile = (auth: AuthContext) => Promise<ProfileDto>;
export type GetBootstrap = (userId: UUID) => Promise<BootstrapDto>;
export type CreateCaptureUpload = (
  auth: AuthContext,
  input: PhotoUploadRequest,
) => Promise<PhotoUploadDto>;
export type SignCapturePhoto = (auth: AuthContext, path: string) => Promise<SignedPhotoDto>;
export type DeleteCapturePhoto = (auth: AuthContext, path: string) => Promise<void>;

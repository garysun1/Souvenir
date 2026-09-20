import type {
  Category,
  Instant,
  PlaceDto,
  ProfileDto,
  Sentiment,
  UUID,
  Variant,
} from "./api-contract";

export type Visibility = "private" | "friends" | "public";
export type PlaceSource =
  | "curated"
  | "osm"
  | "wikidata"
  | "wikimedia"
  | "google"
  | "opentripmap"
  | "user"
  | "placeholder";
export type SampleStatus = "unavailable" | "insufficient" | "ready" | "stale";
export type RetentionPolicy = "metadata_only" | "do_not_store" | "expiring" | "licensed";
export type PlaceNoteKind = "tip" | "warning" | "hours" | "access" | "story";
export type SuggestionStatus = "pending" | "accepted" | "rejected";
export type PlaceCorrection =
  | { field: "name"; value: string }
  | { field: "hours"; value: { text: string; timezone?: string } }
  | { field: "website"; value: string | null }
  | { field: "coords"; value: { lat: number; lng: number } }
  | { field: "closed"; value: boolean };
export type PlaceCorrectionValue = PlaceCorrection["value"];
export type PlaceSuggestionCreate = PlaceCorrection & { requestId: UUID };
export interface PlaceSuggestionDto {
  id: UUID;
  placeId: UUID;
  status: SuggestionStatus;
  createdAt: Instant;
}
export interface PlaceCreate {
  requestId: UUID;
  name: string;
  category: Category;
  lat: number;
  lng: number;
  city?: string | null;
  country?: string | null;
  region?: string | null;
  timezone?: string | null;
  website?: string | null;
  description?: string;
  visibility?: Visibility;
}
export interface PlaceNoteCreate {
  requestId: UUID;
  kind: PlaceNoteKind;
  body: string;
  visibility?: Visibility;
}
export interface PlaceNotePatch {
  kind?: PlaceNoteKind;
  body?: string;
  visibility?: Visibility;
}
export interface PlaceNoteDto {
  id: UUID;
  placeId: UUID;
  userId: UUID;
  kind: PlaceNoteKind;
  body: string;
  visibility: Visibility;
  createdAt: Instant;
  updatedAt: Instant;
}
export interface PlaceTagPut {
  tags: string[];
  visibility?: Visibility;
}
export interface PlaceTagsDto {
  tags: string[];
  myTags: string[];
}
export interface PlaceImagePromote {
  requestId: UUID;
  editionId: UUID;
  confirmPublic: true;
  rightsConfirmed: true;
  license: "CC0-1.0" | "CC-BY-4.0" | "CC-BY-SA-4.0";
  attribution: string;
}
export interface PlaceImageDto {
  id: UUID;
  placeId: UUID;
  url: string;
  width: number | null;
  height: number | null;
  provider: PlaceSource;
  license: string;
  licenseUrl: string | null;
  attribution: string;
  sourcePageUrl: string;
  isHero: boolean;
  fetchedAt: Instant | null;
  expiresAt: Instant | null;
}
export interface PlaceSourceDto {
  id: UUID;
  provider: PlaceSource;
  providerId: string;
  sourceUrl: string | null;
  fetchedAt: Instant;
  expiresAt: Instant | null;
  status: SampleStatus;
  license: string | null;
  licenseUrl: string | null;
  attribution: string | null;
}
export interface BoundingBox {
  south: number;
  west: number;
  north: number;
  east: number;
}
export interface NearbyQuery {
  lat: number;
  lng: number;
  radiusM: number;
  category?: Category;
  limit: number;
  country?: string;
}
export interface NearbyPlaceDto {
  place: PlaceDto;
  distanceM: number;
}
export interface NearbyDto {
  places: NearbyPlaceDto[];
  provenance: "catalog" | "provider" | "mixed";
  coverage: "ready" | "pending" | "unavailable";
}
export interface DocumentedAvailabilityDto {
  status: "known" | "unknown" | "stale";
  openingHours: string | null;
  timezone: string | null;
  sourceId: UUID | null;
  fetchedAt: Instant | null;
}
export interface PlaceMetricsDto {
  provenance: "souvenir-activity";
  definitionVersion: 1;
  computedAt: Instant;
  sampleStatus: SampleStatus;
  collectors: number;
  editions: number;
  saves: number;
  discoveryFreq: number | null;
  frequency: {
    status: SampleStatus;
    visitors90d: number;
    cityVisitors90d: number;
    city: string | null;
    country: string | null;
    windowStart: Instant;
    windowEnd: Instant;
    minimumCohort: 5;
  };
  recommendRate: number | null;
  sentiment: {
    status: SampleStatus;
    recommend: number;
    depends: number;
    skip: number;
    minimumSample: 5;
  };
  trendingScore: number | null;
  trend: {
    status: SampleStatus;
    collectors7d: number;
    weeklyCollectors8w: number[];
    collectors8wAvg: number | null;
    baselineStart: Instant;
    baselineEnd: Instant;
  };
}
export type PlaceStatsDto = PlaceMetricsDto;
export interface PlaceSocialDto {
  friendsBeen: number;
  friendsSaved: number;
}
export interface PlaceDetailDto extends PlaceDto, PlaceTagsDto {
  notes: PlaceNoteDto[];
  myNotes: PlaceNoteDto[];
  images: PlaceImageDto[];
  sources: PlaceSourceDto[];
  metrics: PlaceMetricsDto | null;
  social: PlaceSocialDto;
  availability: DocumentedAvailabilityDto;
}
export interface CityRankDto {
  city: string;
  country: string;
  rank: number;
  placesVisited: number;
}
export interface UserStatsDto {
  placesVisited: number;
  editions: number;
  citiesVisited: number;
  currentStreakWeeks: number;
  longestStreakWeeks: number;
  globalRank: number | null;
  cityRanks: CityRankDto[];
  computedAt: Instant;
  provenance: "souvenir-activity";
  definitionVersion: 1;
  sampleStatus: SampleStatus;
}
export interface SetCompletionDto {
  setId: UUID;
  visited: number;
  total: number;
  rate: number | null;
}
export interface SocialProfileDto {
  id: UUID;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
}
export interface FriendDto {
  user: SocialProfileDto;
  status: "accepted" | "incoming" | "outgoing";
  tasteOverlap: number | null;
}
export interface FriendsDto {
  friends: FriendDto[];
}
export interface SocialEditionDto {
  id: UUID;
  userId: UUID;
  placeId: UUID;
  capturedAt: Instant;
  variant: Variant;
}
export interface UserDetailDto {
  user: SocialProfileDto;
  relationship: "self" | "accepted" | "incoming" | "outgoing" | "none";
  stats: UserStatsDto | null;
  setCompletion: SetCompletionDto[];
  tasteOverlap: number | null;
  editions: SocialEditionDto[];
}
export interface ProfileStatsDto extends ProfileDto {
  stats: UserStatsDto | null;
}
export type ActivityEventDto = {
  id: UUID;
  user: SocialProfileDto;
  createdAt: Instant;
} & (
  | { kind: "edition"; place: PlaceDto; edition: SocialEditionDto }
  | { kind: "ranking"; place: PlaceDto; sentiment: Sentiment }
  | { kind: "note"; place: PlaceDto; note: PlaceNoteDto }
  | { kind: "set_complete"; completion: SetCompletionDto }
  | { kind: "friend"; friend: SocialProfileDto }
);
export interface FeedCursor {
  createdAt: Instant;
  id: UUID;
}
export interface FeedQuery {
  cursor?: string;
  limit: number;
}
export interface FeedDto {
  events: ActivityEventDto[];
  nextCursor: string | null;
}
export interface LeaderboardQuery {
  scope: "friends" | "city" | "global";
  city?: string;
  country?: string;
  limit: number;
  offset: number;
}
export interface LeaderboardEntryDto {
  user: SocialProfileDto;
  rank: number;
  placesVisited: number;
}
export interface LeaderboardDto {
  entries: LeaderboardEntryDto[];
  scope: LeaderboardQuery["scope"];
  city: string | null;
  country: string | null;
  computedAt: Instant | null;
}
export interface TrendingQuery {
  city: string;
  country: string;
  limit: number;
}
export interface TrendingDto {
  places: PlaceDto[];
  city: string;
  country: string;
  computedAt: Instant | null;
}
export interface DeleteDto {
  deleted: true;
}

export const WORLDWIDE_ROUTES = {
  nearby: "/api/places/nearby",
  places: "/api/places",
  place: "/api/places/[slug]",
  notes: "/api/places/[slug]/notes",
  note: "/api/places/[slug]/notes/[id]",
  tags: "/api/places/[slug]/tags",
  images: "/api/places/[slug]/images",
  suggestions: "/api/places/[slug]/suggestions",
  sources: "/api/places/[slug]/sources",
  conditions: "/api/places/[slug]/conditions",
  trending: "/api/places/trending",
  friends: "/api/friends",
  friend: "/api/friends/[userId]",
  friendSearch: "/api/friends/search",
  user: "/api/users/[userId]",
  feed: "/api/feed",
  me: "/api/me",
  profileStats: "/api/me/stats",
  leaderboard: "/api/leaderboard",
} as const;

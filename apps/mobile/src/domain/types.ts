export type Category = 'park' | 'cultural' | 'landmark' | 'food' | 'hidden_gem';
export type Sentiment = 'recommend' | 'depends' | 'skip';
export type SourceStatus = 'sample' | 'unavailable' | 'stale';
export type EvidenceValue<T> =
  | { status: 'known'; value: T; sourceRecordId: string; mode: 'sample' | 'verified-snapshot'; observedAt: string }
  | { status: 'unknown'; reason: string }
  | { status: 'not-applicable'; reason: string };
export interface Place {
  id: string; name: string; category: Category; neighborhood: string; summary: string;
  latitude: number; longitude: number; tags: string[]; priceCents: number;
  durationMinutes: number; openHour: number; closeHour: number;
  discoveryCount: number; cohort: number; sourceIds: string[]; bookingRequired: boolean;
  canonical?: boolean; fixtureId?: string; heroImageUrl?: string;
  slug?: string; city?: string | null; country?: string | null; region?: string | null;
  timezone?: string | null; website?: string | null;
  source?: import('../../../../shared/worldwide-contract').PlaceSource;
  images?: import('../../../../shared/worldwide-contract').PlaceImageDto[];
  sources?: import('../../../../shared/worldwide-contract').PlaceSourceDto[];
  metrics?: import('../../../../shared/worldwide-contract').PlaceMetricsDto | null;
}
export interface User { id: string; name: string; initials: string; color: string; tastes: Category[] }
export interface Edition {
  id: string; requestId: string; placeId: string; ownerId: string; photoUri?: string;
  visitedAt: string; timezone: string; companions: string[]; moment: string; sequence: number;
  origin: 'capture' | 'import' | 'seed'; outingId?: string; importSourceId?: string;
  photoPath?: string; photoExpiresAt?: string;
  variant?: 'standard' | 'revisit' | 'group' | 'seasonal';
}
export interface CaptureDraft {
  id: string; placeId?: string; photoUri?: string; visitedAt: string; companions: string[];
  moment: string; outingId?: string; status: 'photo' | 'identify' | 'confirm' | 'reveal' | 'saved';
  editionId?: string;
  timezone?: string;
  submittedEdition?: import('../../../../shared/api-contract').EditionCreate;
}
export interface Wishlist { id: string; title: string; memberIds: string[]; entries: { placeId: string; saverIds: string[]; completedBy: string[] }[]; isDefault?: boolean; ownerId?: string; isShared?: boolean }
export interface Assessment { placeId: string; sentiment: Sentiment; ranking: 'settled' | 'provisional' | 'unranked'; comparedTo?: string; tiedWith?: string; editionId?: string }
export interface Ranking { key: string; placeIds: string[]; provisionalIds: string[]; ties: [string, string][] }
export interface PlanConstraints {
  participantIds: string[]; date: string; startMinute: number; endMinute: number;
  budgetCents: number; transport: 'walk' | 'transit'; interests: Category[];
  rain: boolean; excludedPlaceIds: string[]; preferredPlaceIds: string[];
}
export interface PlanStop { placeId: string; arrivalMinute: number; departureMinute: number; costCents: number; travelMinutes: number }
export interface Plan {
  id: string; requestId: string; title: string; constraints: PlanConstraints; stops: PlanStop[];
  totalCostCents: number; totalMinutes: number; checks: string[]; version: number;
  status: 'accepted' | 'completed'; createdAt: string;
  wishlistId?: string; createdBy?: string; provenance?: 'manual' | 'simulation';
}
export interface Outing { id: string; planId: string; title: string; participantIds: string[]; placeIds: string[] }
export interface ImportItem { id: string; placeId: string; visitedAt: string; selected: boolean; status: 'eligible' | 'duplicate' | 'unresolved' | 'unsupported' }
export interface Preferences {
  onboardingComplete: boolean; tastes: Category[]; collectionView: 'list' | 'album' | 'map';
  collectionSection: 'been' | 'saved' | 'sets'; offline: boolean; reducedMotion: boolean;
  sourceStatus: SourceStatus; identifyFailure: boolean; name: string; handle: string; bio: string;
  homeCity?: string;
}
export interface AppState {
  version: 1; mode: 'sample' | 'empty' | 'account'; clock: string; preferences: Preferences;
  editions: Edition[]; sequences: Record<string, number>; wishlists: Wishlist[];
  favorites: string[]; tips: Record<string, string>; assessments: Assessment[]; rankings: Ranking[];
  plans: Plan[]; outings: Outing[]; captureDraft: CaptureDraft | null;
  importItems: ImportItem[]; importedSourceIds: string[];
}
export type Action =
  | { type: 'RESET'; mode: 'sample' | 'empty' }
  | { type: 'PREFERENCES'; patch: Partial<Preferences> }
  | { type: 'CLOCK'; clock: string }
  | { type: 'SAVE_PLACE'; placeId: string; wishlistId: string; userId?: string }
  | { type: 'COMPLETE_WISHLIST'; placeId: string; wishlistId: string }
  | { type: 'FAVORITE'; placeId: string }
  | { type: 'TIP'; placeId: string; text: string }
  | { type: 'DRAFT'; draft: CaptureDraft | null }
  | { type: 'ADD_EDITION'; edition: Omit<Edition, 'sequence'> }
  | { type: 'EDIT_EDITION'; id: string; patch: Pick<Edition, 'moment' | 'visitedAt' | 'companions'> }
  | { type: 'DELETE_EDITION'; id: string }
  | { type: 'ASSESS'; assessment: Assessment; ranking?: Ranking }
  | { type: 'ACCEPT_PLAN'; plan: Plan }
  | { type: 'UPDATE_PLAN'; plan: Plan }
  | { type: 'DELETE_PLAN'; id: string }
  | { type: 'CREATE_WISHLIST'; requestId: string; name: string; isShared: boolean }
  | { type: 'ADD_MEMBER'; wishlistId: string; handle: string }
  | { type: 'REMOVE_MEMBER'; wishlistId: string; userId: string }
  | { type: 'IMPORT_ITEMS'; items: ImportItem[] };

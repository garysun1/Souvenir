import type { BootstrapDto, CollectionEntryDto, PlaceDto } from "../../shared/api-contract";

export const userId = "11111111-1111-4111-8111-111111111111";
export const requestId = "22222222-2222-4222-8222-222222222222";
export const placeId = "33333333-3333-4333-8333-333333333333";
export const otherPlaceId = "44444444-4444-4444-8444-444444444444";
export const thirdPlaceId = "55555555-5555-4555-8555-555555555555";
export const editionId = "66666666-6666-4666-8666-666666666666";

export const place: PlaceDto = {
  id: placeId,
  slug: "test-place",
  name: "Test place",
  category: "culture",
  lat: 34,
  lng: -118,
  city: "Los Angeles",
  description: "Catalog description",
  heroImageUrl: null,
  rarityTier: "common",
  rarityAppeal: 0,
  rarityDiscoveryFreq: 0,
  rarityAvailability: 0,
  externalIds: null,
  stats: { provenance: "prototype-catalog" },
  createdAt: "2026-09-19T12:00:00.000Z",
};

export const edition: CollectionEntryDto = {
  id: editionId,
  userId,
  requestId,
  placeId,
  place,
  capturedAt: "2026-09-19T12:00:00.000Z",
  timezone: "America/Los_Angeles",
  note: "A moment",
  companions: ["Taylor"],
  variant: "standard",
  visitSequence: 1,
  origin: "capture",
  importSourceId: null,
  outingId: null,
  photo: null,
  createdAt: "2026-09-19T13:00:00.000Z",
};

export const snapshot: BootstrapDto = {
  user: {
    id: userId,
    handle: "test",
    displayName: "Test user",
    avatarUrl: null,
    homeCity: null,
    createdAt: "2026-09-19T12:00:00.000Z",
  },
  places: [place],
  sets: [],
  collection: [edition],
  wishlists: [],
  rankings: [],
  rankingGroups: [],
  placePreferences: [],
  plans: [],
};

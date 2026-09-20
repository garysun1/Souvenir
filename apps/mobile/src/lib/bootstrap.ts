import type { BootstrapDto, Category as ApiCategory, EditionDto, PlanDto } from '../../../../shared/api-contract';
import { mobileFixtureToSlug } from '../../../../shared/catalog-map';
import type { AppState, Category, Edition, Place, Plan, Preferences } from '@/domain/types';
import { installCatalog } from '@/fixtures/catalog';

const categoryMap: Record<ApiCategory, Category> = { nature: 'park', culture: 'cultural', landmark: 'landmark', food: 'food', hidden_gem: 'hidden_gem' };
export const canonicalCategory: Record<Category, ApiCategory> = { park: 'nature', cultural: 'culture', landmark: 'landmark', food: 'food', hidden_gem: 'hidden_gem' };
export const mobileCategory = (category: ApiCategory) => categoryMap[category];
export const defaultPreferences = (): Preferences => ({
  onboardingComplete: true, tastes: [], collectionView: 'list', collectionSection: 'been',
  offline: false, reducedMotion: false, sourceStatus: 'unavailable', identifyFailure: false,
  name: '', handle: '', bio: '',
});
export function emptyAccount(): AppState {
  return { version: 1, mode: 'account', clock: new Date().toISOString(), preferences: defaultPreferences(), editions: [], sequences: {}, wishlists: [], favorites: [], tips: {}, assessments: [], rankings: [], plans: [], outings: [], captureDraft: null, importItems: [], importedSourceIds: [] };
}
export function mapEdition(edition: EditionDto, userId: string): Edition {
  if (edition.userId !== userId) throw new Error('The server returned an edition belonging to another account.');
  return {
    id: edition.id, requestId: edition.requestId, placeId: edition.placeId, ownerId: 'you',
    photoUri: edition.photo?.url, photoPath: edition.photo?.path, photoExpiresAt: edition.photo?.expiresAt,
    visitedAt: edition.capturedAt, timezone: edition.timezone, companions: edition.companions,
    moment: edition.note ?? '', sequence: edition.visitSequence, variant: edition.variant, origin: edition.origin === 'legacy' ? 'seed' : edition.origin,
    outingId: edition.outingId ?? undefined, importSourceId: edition.importSourceId ?? undefined,
  };
}
export function mapPlan(plan: PlanDto, userId: string): Plan {
  const member = (id: string) => id === userId ? 'you' : id;
  return {
    ...plan.plan, id: plan.id, requestId: plan.requestId, createdAt: plan.createdAt, status: plan.status,
    wishlistId: plan.wishlistId ?? undefined, createdBy: member(plan.createdBy),
    constraints: { ...plan.plan.constraints, participantIds: plan.plan.constraints.participantIds.map(member), interests: plan.plan.constraints.interests.map(mobileCategory) },
  };
}
export function mapBootstrap(data: BootstrapDto, userId: string, local = emptyAccount()): AppState {
  if (data.user.id !== userId) throw new Error('Account data did not match the signed-in user.');
  const member = (id: string) => id === userId ? 'you' : id;
  const editions = data.collection.map(edition => mapEdition(edition, userId));
  const plans = data.plans.map(plan => mapPlan(plan, userId));
  const draft = local.captureDraft;
  const savedDraft = draft && editions.find(edition => edition.requestId === draft.id);
  return {
    ...emptyAccount(), preferences: { ...local.preferences, name: data.user.displayName, handle: data.user.handle, homeCity: data.user.homeCity ?? '' },
    captureDraft: draft ? savedDraft ? { ...draft, status: 'saved', editionId: savedDraft.id } : draft : null,
    editions, sequences: Object.fromEntries(editions.map(edition => [`you:${edition.placeId}`, Math.max(...editions.filter(item => item.placeId === edition.placeId).map(item => item.sequence))])),
    wishlists: data.wishlists.map(list => ({ id: list.id, title: list.name, ownerId: member(list.ownerId), isShared: list.isShared, isDefault: list.isDefault, memberIds: list.memberIds.map(member), entries: list.entries.map(entry => ({ ...entry, saverIds: entry.saverIds.map(member), completedBy: entry.completedBy.map(member) })) })),
    favorites: data.placePreferences.filter(item => item.favorite).map(item => item.placeId),
    tips: Object.fromEntries(data.placePreferences.map(item => [item.placeId, item.tip])),
    assessments: data.rankings.map(item => ({ ...item, comparedTo: item.comparedTo ?? undefined, tiedWith: item.tiedWith ?? undefined })),
    rankings: data.rankingGroups.map(group => ({ key: `${mobileCategory(group.category)}:${group.sentiment}`, placeIds: group.placeIds, provisionalIds: group.provisionalIds, ties: group.ties })),
    plans, outings: data.plans.map(plan => ({ id: plan.id, planId: plan.id, title: plan.plan.title, participantIds: plan.memberIds.map(member), placeIds: plan.plan.stops.map(stop => stop.placeId) })),
    importedSourceIds: editions.flatMap(edition => edition.importSourceId ? [edition.importSourceId] : []),
  };
}
export function installBootstrapCatalog(data: BootstrapDto) {
  const catalog: Place[] = data.places.map(place => {
    const fixtureId = Object.entries(mobileFixtureToSlug).find(([, slug]) => slug === place.slug)?.[0];
    return {
      id: place.id, name: place.name, category: mobileCategory(place.category), neighborhood: place.city ?? '',
      summary: place.description, latitude: place.lat, longitude: place.lng, tags: [],
      priceCents: NaN, durationMinutes: NaN, openHour: NaN, closeHour: NaN, discoveryCount: NaN, cohort: NaN,
      sourceIds: [], bookingRequired: false, canonical: true, fixtureId, heroImageUrl: place.heroImageUrl ?? undefined,
    };
  });
  const memberIds = [...new Set(data.wishlists.flatMap(list => list.memberIds).concat(data.plans.flatMap(plan => plan.memberIds)))];
  installCatalog(catalog, data.sets.map(set => ({ id: set.id, title: set.name, description: set.description, placeIds: set.places.map(place => place.id) })), [
    { id: 'you', name: data.user.displayName, initials: data.user.displayName.slice(0, 1), color: '#D5E3DC', tastes: [] },
    ...memberIds.filter(id => id !== data.user.id).map(id => ({ id, name: `Member ${id.slice(0, 8)}`, initials: 'M', color: '#D5E3DC', tastes: [] })),
  ]);
}

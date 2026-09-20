import type { AppState, Edition, Plan, Sentiment, Wishlist } from '@/domain/types';
import { placeById, places, users } from '@/fixtures/catalog';
import { overlapIds } from '@/state/selectors';

/** Read-only fictional public visits, not another store and never your collection. */
export const fictionalEditions: readonly Edition[] = [
  { id: 'social-maya-moca', ownerId: 'maya', placeId: 'la-moca', visitedAt: '2026-09-19T18:30:00.000Z', moment: 'One gallery, then another. Somehow the whole morning disappeared.' },
  { id: 'social-jordan-venice', ownerId: 'jordan', placeId: 'la-venice-canals', visitedAt: '2026-09-18T23:00:00.000Z', moment: 'Took the long way home. Always take the little footbridge.' },
  { id: 'social-sam-library', ownerId: 'sam', placeId: 'la-central-library', visitedAt: '2026-09-18T19:00:00.000Z', moment: 'Came for a book. Stayed for the ceilings.' },
  { id: 'social-maya-getty', ownerId: 'maya', placeId: 'la-getty', visitedAt: '2026-09-16T20:00:00.000Z', moment: 'A sketchbook, the garden, and absolutely no hurry.' },
  { id: 'social-jordan-barnsdall', ownerId: 'jordan', placeId: 'la-barnsdall', visitedAt: '2026-09-15T23:00:00.000Z', moment: 'A patch of grass with a very good view.' },
].map(edition => ({ ...edition, requestId: edition.id, photoUri: `sample:${edition.placeId}`, timezone: 'America/Los_Angeles', companions: [], sequence: 1, origin: 'seed' }));

const fictionalRecommendations: Record<string, Sentiment> = {
  'social-maya-moca': 'recommend', 'social-sam-library': 'recommend', 'social-maya-getty': 'recommend',
};

export function publicEditions(state: AppState): Edition[] {
  const persistedIds = new Set(state.editions.map(edition => edition.id));
  return [...fictionalEditions.filter(edition => !persistedIds.has(edition.id)), ...state.editions]
    .filter(edition => edition.origin !== 'import' && !!placeById(edition.placeId) && users.some(user => user.id === edition.ownerId))
    .sort((a, b) => b.visitedAt.localeCompare(a.visitedAt) || a.id.localeCompare(b.id));
}

export type SocialActivity =
  | { kind: 'edition'; id: string; at: string; edition: Edition; sentiment?: Sentiment }
  | { kind: 'plan'; id: string; at: string; plan: Plan; outingId: string };

/** Feed entries follow saved records. Importing a private memory never publishes it. */
export function socialActivity(state: AppState): SocialActivity[] {
  const visits: SocialActivity[] = publicEditions(state).map(edition => ({
    kind: 'edition', id: edition.id, at: edition.visitedAt, edition,
    sentiment: edition.ownerId === 'you'
      ? state.assessments.find(item => item.placeId === edition.placeId)?.sentiment
      : fictionalRecommendations[edition.id],
  }));
  const plans: SocialActivity[] = state.plans.flatMap(plan => {
    const outing = state.outings.find(item => item.planId === plan.id);
    return outing && outing.participantIds.length > 1
      ? [{ kind: 'plan' as const, id: `activity-${plan.id}`, at: plan.createdAt, plan, outingId: outing.id }]
      : [];
  });
  return [...visits, ...plans].sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
}

export function friendSummary(state: AppState, userId: string) {
  const editions = publicEditions(state).filter(edition => edition.ownerId === userId);
  const placeIds = [...new Set(editions.map(edition => edition.placeId))];
  const savedIds = [...new Set(state.wishlists.flatMap(list => list.entries.filter(entry => entry.saverIds.includes(userId)).map(entry => entry.placeId)))];
  return { editions, placeIds, savedIds };
}

export const memberNames = (ids: string[]) => ids.map(id => users.find(user => user.id === id)?.name ?? 'Unknown member').join(' & ');

export function wishlistOverlap(list: Wishlist): string[] {
  return list.memberIds.length < 2 ? [] : [...new Set(overlapIds(list))].filter(id => !!placeById(id));
}

export function wishlistPlannerParams(list: Wishlist) {
  return {
    wishlistId: list.id,
    participantIds: [...new Set(list.memberIds)].filter(id => users.some(user => user.id === id)).join(','),
    placeIds: [...new Set(list.entries.filter(entry => entry.saverIds.some(id => list.memberIds.includes(id))).map(entry => entry.placeId))].filter(id => !!placeById(id)).join(','),
  };
}

export function searchSocialPlaces(query: string) {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return places.filter(place => words.every(word => `${place.name} ${place.neighborhood} ${place.tags.join(' ')}`.toLowerCase().includes(word)));
}

export function outingDetails(state: AppState, outingId: string) {
  const outing = state.outings.find(item => item.id === outingId);
  const plan = outing && state.plans.find(item => item.id === outing.planId);
  return outing && plan ? { outing, plan } : undefined;
}

export function matchingEditions(state: AppState, outingId: string, placeId: string) {
  const details = outingDetails(state, outingId);
  if (!details || !details.outing.placeIds.includes(placeId)) return [];
  return details.outing.participantIds.map(ownerId => ({
    ownerId,
    edition: state.editions.filter(edition => edition.outingId === outingId && edition.placeId === placeId && edition.ownerId === ownerId && edition.origin !== 'import')
      .sort((a, b) => b.sequence - a.sequence)[0] as Edition | undefined,
  }));
}

/** Requires an explicit UI action. Stable per outing/stop, including rapid retries. */
export function mayaConfirmation(state: AppState, outingId: string, placeId: string): Omit<Edition, 'sequence'> | undefined {
  const details = outingDetails(state, outingId);
  if (!details || !placeById(placeId) || !details.outing.placeIds.includes(placeId) || !details.outing.participantIds.includes('maya') || !details.outing.participantIds.includes('you')) return undefined;
  const members = matchingEditions(state, outingId, placeId);
  const yours = members.find(member => member.ownerId === 'you')?.edition;
  if (!yours || members.find(member => member.ownerId === 'maya')?.edition) return undefined;
  const requestId = `simulate-maya:${outingId}:${placeId}`;
  return {
    id: `edition-${requestId}`, requestId, ownerId: 'maya', placeId, outingId,
    // Independent catalog sample, never a copy of your personal photograph.
    photoUri: `sample:${placeId}`, visitedAt: yours.visitedAt, timezone: yours.timezone,
    companions: details.outing.participantIds.filter(id => id !== 'maya'),
    moment: `My own little memory of ${placeById(placeId)!.name}. Glad we made time for this.`, origin: 'capture',
  };
}

export const invitationToken = (wishlistId: string) => `souvenir-demo:wishlist:${wishlistId}`;
export const resolveInvitation = (state: AppState, token: string) => state.wishlists.find(list => invitationToken(list.id) === token.trim());
export const clockTime = (minute: number) => `${Math.floor(minute / 60).toString().padStart(2, '0')}:${(minute % 60).toString().padStart(2, '0')}`;
export const activityDate = (iso: string) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

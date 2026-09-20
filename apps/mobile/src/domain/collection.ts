import type { AppState, Category, Edition, Place } from '@/domain/types';
import { places } from '@/fixtures/catalog';
import { collectedPlaceIds, latestEdition, ownEditions, savedPlaceIds } from '@/state/selectors';

export interface CollectionFilters {
  outingId?: string;
  category: Category | 'all'; favorites: boolean; companion: string; after: string; before: string; sort: 'recent' | 'name' | 'ranking';
}
export const defaultCollectionFilters: CollectionFilters = { category: 'all', favorites: false, companion: '', after: '', before: '', sort: 'recent' };
export function validDay(day: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(day) && Number.isFinite(Date.parse(`${day}T12:00:00Z`)) && new Date(`${day}T12:00:00Z`).toISOString().slice(0, 10) === day;
}
export function visitDay(edition: Edition): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: edition.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(edition.visitedAt));
}
export function matchingEditions(state: AppState, filters: CollectionFilters): Edition[] {
  return ownEditions(state).filter(edition => (!filters.outingId || edition.outingId === filters.outingId) && (!filters.companion || edition.companions.includes(filters.companion)) && (!filters.after || visitDay(edition) >= filters.after) && (!filters.before || visitDay(edition) <= filters.before));
}
export function collectionPlaces(state: AppState, section: 'been' | 'saved', filters: CollectionFilters): Place[] {
  const ids = section === 'been' ? collectedPlaceIds(state) : savedPlaceIds(state);
  const visitFiltered = !!(filters.companion || filters.after || filters.before || filters.outingId);
  const matching = new Set(matchingEditions(state, filters).map(edition => edition.placeId));
  return places.filter(place => ids.includes(place.id) && (filters.category === 'all' || place.category === filters.category) && (!filters.favorites || state.favorites.includes(place.id)) && (!visitFiltered || matching.has(place.id))).sort((a, b) => {
    if (filters.sort === 'name') return a.name.localeCompare(b.name);
    if (filters.sort === 'ranking') {
      if (a.category !== b.category) return a.category.localeCompare(b.category);
      const score = (id: string) => {
        const assessment = state.assessments.find(item => item.placeId === id);
        const ranking = state.rankings.find(item => item.placeIds.includes(id));
        if (!assessment || assessment.ranking !== 'settled' || !ranking) return 10000;
        return ['recommend', 'depends', 'skip'].indexOf(assessment.sentiment) * 100 + ranking.placeIds.indexOf(id);
      };
      return score(a.id) - score(b.id) || a.name.localeCompare(b.name);
    }
    return (latestEdition(state, b.id)?.visitedAt ?? '').localeCompare(latestEdition(state, a.id)?.visitedAt ?? '') || a.name.localeCompare(b.name);
  });
}
export function editionMonths(state: AppState, placeIds: string[], filters: CollectionFilters) {
  const groups = new Map<string, Edition[]>();
  matchingEditions(state, filters).filter(edition => placeIds.includes(edition.placeId)).sort((a, b) => b.visitedAt.localeCompare(a.visitedAt) || a.id.localeCompare(b.id)).forEach(edition => {
    const month = visitDay(edition).slice(0, 7);
    groups.set(month, [...(groups.get(month) ?? []), edition]);
  });
  return [...groups].map(([month, editions]) => ({ month, editions }));
}
export function wishlistMemberships(state: AppState, placeId: string) { return state.wishlists.filter(list => list.entries.some(entry => entry.placeId === placeId && entry.saverIds.includes('you'))); }
export const sentimentLabels = { recommend: 'Recommended', depends: 'It depends', skip: 'Would skip' } as const;
export function recommendationLabel(state: AppState, placeId: string): string {
  const assessment = state.assessments.find(item => item.placeId === placeId);
  if (!assessment) return 'Not recommended yet';
  const rank = state.rankings.find(item => item.placeIds.includes(placeId));
  const status = !rank || assessment.ranking === 'unranked' ? 'Unranked' : rank.provisionalIds.includes(placeId) ? 'Provisional rank' : rank.ties.some(pair => pair.includes(placeId)) ? 'Tied rank' : `#${rank.placeIds.indexOf(placeId) + 1} in category`;
  return `${sentimentLabels[assessment.sentiment]} · ${status}`;
}

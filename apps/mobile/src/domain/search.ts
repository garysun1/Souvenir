import type { AppState, Category, Place, SourceStatus } from './types';

export interface Coordinates { latitude: number; longitude: number }
export interface MapBounds { north: number; south: number; east: number; west: number }
export const DOWNTOWN_ORIGIN: Coordinates = { latitude: 34.0505, longitude: -118.2552 };
export interface SearchFilters {
  categories: Category[]; tags: string[]; maxPriceCents?: number; radiusKm?: number;
  openNow: boolean; text: string; bounds?: MapBounds;
}
export interface SearchContext { state: AppState; origin?: Coordinates }
export interface SearchHit { place: Place; distanceKm: number; score: number; reason: string }
export interface SearchChip { key: string; label: string }
export const emptyFilters = (): SearchFilters => ({ categories: [], tags: [], openNow: false, text: '' });
const normalize = (value: string) => value.toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9$ .-]/g, ' ').replace(/\s+/g, ' ').trim();

/** Transparent phrase parsing, not a semantic/embedding provider. */
export function parseSearch(query: string): { filters: SearchFilters; explanation: string } {
  const filters = emptyFilters();
  let rest = normalize(query);
  const take = (pattern: RegExp, apply: () => void) => {
    if (pattern.test(rest)) { apply(); rest = rest.replace(pattern, ' '); }
  };
  take(/\bunder\s+\$?\s*(\d+(?:\.\d{1,2})?)\b/g, () => {
    const amount = rest.match(/\bunder\s+\$?\s*(\d+(?:\.\d{1,2})?)\b/);
    filters.maxPriceCents = Math.round(Number(amount?.[1]) * 100) - 1;
  });
  take(/\bfree\b/g, () => { filters.maxPriceCents = 0; });
  take(/\b(?:near us|near me|nearby)\b/g, () => { filters.radiusKm = 8; });
  take(/\bwithin\s+(\d+(?:\.\d+)?)\s*km\b/g, () => {
    filters.radiusKm = Number(rest.match(/\bwithin\s+(\d+(?:\.\d+)?)\s*km\b/)?.[1]);
  });
  take(/\bopen now\b/g, () => { filters.openNow = true; });
  take(/\b(?:cultural|culture|museums?)\b/g, () => { filters.categories.push('cultural'); });
  take(/\bparks?\b/g, () => { filters.categories.push('park'); });
  take(/\blandmarks?\b/g, () => { filters.categories.push('landmark'); });
  for (const [pattern, tag] of [
    [/\bquiet\b/g, 'quiet'], [/\bart\b/g, 'art'], [/\b(?:outdoors?|outside)\b/g, 'outdoors'],
    [/\bgardens?\b/g, 'garden'], [/\bindoor[s]?\b/g, 'indoors'], [/\barchitecture\b/g, 'architecture'],
    [/\bhistory\b/g, 'history'], [/\bscenic\b/g, 'scenic'],
  ] as [RegExp, string][]) take(pattern, () => { filters.tags.push(tag); });
  rest = rest.replace(/\b(?:find|me|us|a|an|the|and|or|some|something|place|places|to|visit|please|with|for|that|is)\b/g, ' ');
  filters.text = rest.replace(/\s+/g, ' ').trim();
  return { filters, explanation: filters.text
    ? `I interpreted these filters. “${filters.text}” is matched literally to names, areas and tags; other language may need manual filters.`
    : 'I interpreted these filters using the bundled Los Angeles catalog. Nothing is live-verified.' };
}

export function queryForFilters(filters: SearchFilters): string {
  const budget = filters.maxPriceCents === undefined ? '' : filters.maxPriceCents === 0 ? 'free' : `under $${((filters.maxPriceCents + 1) / 100).toFixed(2)}`;
  return [...filters.categories, ...filters.tags, budget, filters.radiusKm === undefined ? '' : `within ${filters.radiusKm} km`, filters.openNow ? 'open now' : '', filters.text].filter(Boolean).join(' ');
}

export function filterChips(filters: SearchFilters): SearchChip[] {
  const chips = filters.categories.map(category => ({ key: `category:${category}`, label: category === 'park' ? 'Parks' : category === 'cultural' ? 'Culture' : 'Landmarks' }));
  filters.tags.forEach(tag => chips.push({ key: `tag:${tag}`, label: tag[0].toUpperCase() + tag.slice(1) }));
  if (filters.maxPriceCents !== undefined) chips.push({ key: 'budget', label: filters.maxPriceCents === 0 ? 'Free admission' : filters.maxPriceCents % 100 === 99 ? `Under $${(filters.maxPriceCents + 1) / 100}` : `$${filters.maxPriceCents / 100} or less` });
  if (filters.radiusKm !== undefined) chips.push({ key: 'radius', label: `Within ${filters.radiusKm} km` });
  if (filters.openNow) chips.push({ key: 'hours', label: 'Open at demo time' });
  if (filters.text) chips.push({ key: 'text', label: `Text: ${filters.text}` });
  if (filters.bounds) chips.push({ key: 'area', label: 'This map area' });
  return chips;
}

export function removeFilter(filters: SearchFilters, key: string): SearchFilters {
  const next = { ...filters };
  if (key.startsWith('category:')) next.categories = filters.categories.filter(category => key !== `category:${category}`);
  if (key.startsWith('tag:')) next.tags = filters.tags.filter(tag => key !== `tag:${tag}`);
  if (key === 'budget') delete next.maxPriceCents;
  if (key === 'radius') delete next.radiusKm;
  if (key === 'hours') next.openNow = false;
  if (key === 'text') next.text = '';
  if (key === 'area') delete next.bounds;
  return next;
}

export function distanceKm(from: Coordinates, to: Coordinates): number {
  const radians = (angle: number) => angle * Math.PI / 180;
  const latitude = radians(to.latitude - from.latitude);
  const longitude = radians(to.longitude - from.longitude);
  const a = Math.sin(latitude / 2) ** 2 + Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.sin(longitude / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
}

export function demoMinute(clock: string): number | undefined {
  if (!Number.isFinite(Date.parse(clock))) return undefined;
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(clock));
  return Number(parts.find(part => part.type === 'hour')?.value) * 60 + Number(parts.find(part => part.type === 'minute')?.value);
}

export function isOpenAtDemoTime(place: Place, clock: string, sourceStatus: SourceStatus): boolean | undefined {
  const minute = demoMinute(clock);
  if (sourceStatus !== 'sample' || minute === undefined || !Number.isFinite(place.openHour) || !Number.isFinite(place.closeHour) || place.openHour === place.closeHour) return undefined;
  const opens = place.openHour * 60;
  const closes = place.closeHour * 60;
  return closes > opens ? minute >= opens && minute < closes : minute >= opens || minute < closes;
}

export function availabilityLabel(place: Place, state: AppState): string {
  const open = isOpenAtDemoTime(place, state.clock, state.preferences.sourceStatus);
  return open === undefined ? 'Hours unknown' : open ? 'Open at demo time' : 'Closed at demo time';
}

export function appealFor(place: Place, state: AppState): { label: string; explanation: string } {
  const assessment = state.assessments.find(item => item.placeId === place.id);
  if (assessment?.sentiment === 'recommend') return { label: 'High for you', explanation: 'You recommended this place. This is your personal signal, not a public rating.' };
  if (assessment?.sentiment === 'skip') return { label: 'Worth a look', explanation: 'You marked this place “Would skip,” so it is lowered in your recommendations. Appeal is not discovery frequency.' };
  if (state.preferences.tastes.includes(place.category)) return { label: 'High for you', explanation: 'This matches a category in your preferences. Change your tastes in Settings to tune recommendations.' };
  if (state.editions.some(edition => edition.ownerId === 'you' && edition.placeId === place.id)) return { label: 'Worth a look', explanation: 'You have a personal edition here. Your next recommendation helps us learn more.' };
  return { label: 'Still learning', explanation: 'There is not enough personal evidence yet. Explore, visit, or update your tastes; no universal score is implied.' };
}

export function recommendationReason(place: Place, state: AppState): string {
  if (state.assessments.some(item => item.placeId === place.id && item.sentiment === 'recommend')) return 'A place you recommended';
  if (state.wishlists.some(list => list.entries.some(entry => entry.placeId === place.id && entry.saverIds.includes('maya')))) return 'Saved by Maya';
  if (state.preferences.tastes.includes(place.category)) return `You enjoy ${place.category === 'cultural' ? 'cultural places' : place.category === 'park' ? 'parks & outdoors' : 'landmarks'}`;
  return 'A curated Los Angeles discovery';
}

/** Hard constraints run before ranking. No budget, tag, hours or radius relaxation. */
export function searchPlaces(catalog: Place[], filters: SearchFilters, { state, origin = DOWNTOWN_ORIGIN }: SearchContext): SearchHit[] {
  const visited = new Set(state.editions.filter(edition => edition.ownerId === 'you').map(edition => edition.placeId));
  const enjoyedTags = catalog.filter(place => state.assessments.some(item => item.placeId === place.id && item.sentiment === 'recommend')).flatMap(place => place.tags);
  return catalog.flatMap(place => {
    const distance = distanceKm(origin, place);
    if (filters.categories.length && !filters.categories.includes(place.category)) return [];
    if (filters.maxPriceCents !== undefined && place.priceCents > filters.maxPriceCents) return [];
    if (filters.radiusKm !== undefined && distance > filters.radiusKm) return [];
    if (filters.openNow && isOpenAtDemoTime(place, state.clock, state.preferences.sourceStatus) !== true) return [];
    if (!filters.tags.every(tag => place.tags.includes(tag))) return [];
    if (filters.bounds && !inBounds(place, filters.bounds)) return [];
    const words = normalize(filters.text).split(' ').filter(Boolean);
    const searchable = normalize(`${place.name} ${place.neighborhood} ${place.tags.join(' ')}`);
    if (!words.every(word => searchable.includes(word))) return [];
    const sentiment = state.assessments.find(item => item.placeId === place.id)?.sentiment;
    const score = (state.preferences.tastes.includes(place.category) ? 12 : 0)
      + filters.tags.reduce((total, tag) => total + (place.tags.includes(tag) ? 4 : 0), 0)
      + Math.min(3, place.tags.filter(tag => enjoyedTags.includes(tag)).length)
      + (visited.has(place.id) ? 0 : 2) + (sentiment === 'recommend' ? 4 : sentiment === 'skip' ? -40 : 0)
      - Math.min(distance, 100) / 20;
    return [{ place, distanceKm: distance, score, reason: recommendationReason(place, state) }];
  }).sort((a, b) => b.score - a.score || a.place.id.localeCompare(b.place.id));
}

export function inBounds(point: Coordinates, bounds: MapBounds): boolean {
  return point.latitude >= bounds.south && point.latitude <= bounds.north && point.longitude >= bounds.west && point.longitude <= bounds.east;
}

/** Mock request boundary. A caller's request ID must be checked before rendering. */
export async function requestSearch(catalog: Place[], filters: SearchFilters, context: SearchContext, requestId: number) {
  await new Promise(resolve => setTimeout(resolve, 80));
  return { requestId, hits: searchPlaces(catalog, filters, context) };
}
export function createRequestGate() {
  let latest = 0;
  return { next: () => ++latest, isCurrent: (id: number) => id === latest };
}

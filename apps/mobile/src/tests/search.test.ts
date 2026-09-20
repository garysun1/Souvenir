import { appealFor, availabilityLabel, createRequestGate, distanceKm, DOWNTOWN_ORIGIN, emptyFilters, filterChips, isOpenAtDemoTime, parseSearch, queryForFilters, removeFilter, requestSearch, searchPlaces } from '@/domain/search';
import { places, placeById } from '@/fixtures/catalog';
import { createSeed } from '@/state/seed';
import { reducer } from '@/state/reducer';
import { clusterPoints, fitMapBounds, projectPoint, viewportBounds } from '@/components/map/geometry';
import { downtownLocation, requestDiscoveryLocation } from '@/platform/location';
import * as Location from 'expo-location';

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(), getCurrentPositionAsync: jest.fn(), Accuracy: { Balanced: 3 },
}));

const library = placeById('la-central-library')!;
describe('transparent geo-semantic search', () => {
  test('quiet free cultural nearby guarantees Central Library and only exact hard-filter matches', () => {
    const filters = parseSearch('Quiet, free cultural place near us').filters;
    expect(filters).toMatchObject({ tags: ['quiet'], categories: ['cultural'], maxPriceCents: 0, radiusKm: 8 });
    const hits = searchPlaces(places, filters, { state: createSeed() });
    expect(hits[0].place.id).toBe(library.id);
    expect(hits.every(hit => hit.place.tags.includes('quiet') && hit.place.category === 'cultural' && hit.place.priceCents === 0 && hit.distanceKm <= 8)).toBe(true);
  });
  test('paid interior is excluded even if its name says park', () => {
    const paid = { ...library, id: 'paid', name: 'Quiet Garden Park Museum', priceCents: 1600 };
    expect(searchPlaces([paid], parseSearch('free cultural').filters, { state: createSeed() })).toEqual([]);
  });
  test('under budget is strict; free overrides a wider budget', () => {
    expect(parseSearch('under $10').filters.maxPriceCents).toBe(999);
    expect(parseSearch('under $10 free').filters.maxPriceCents).toBe(0);
    expect(searchPlaces([{ ...library, priceCents: 1000 }], parseSearch('under $10').filters, { state: createSeed() })).toEqual([]);
  });
  test('impossible strict budgets stay impossible and manual filters survive navigation encoding', () => {
    expect(searchPlaces(places, parseSearch('under $0').filters, { state: createSeed() })).toEqual([]);
    const filters = { ...emptyFilters(), categories: ['park' as const], tags: ['garden'], radiusKm: 3, maxPriceCents: 1000, openNow: true };
    expect(parseSearch(queryForFilters(filters)).filters).toEqual(filters);
  });
  test('tags are AND constraints and categories form an OR group', () => {
    const hits = searchPlaces(places, parseSearch('quiet outdoors garden park').filters, { state: createSeed() });
    expect(hits.map(hit => hit.place.id)).toEqual(['la-rose-garden']);
    expect(parseSearch('museum landmark').filters.categories).toEqual(['cultural', 'landmark']);
  });
  test('one parsed chip is removable without mutating other constraints', () => {
    const original = parseSearch('quiet free cultural nearby open now').filters;
    const changed = removeFilter(original, 'tag:quiet');
    expect(changed.tags).toEqual([]);
    expect(original.tags).toEqual(['quiet']);
    expect(changed.maxPriceCents).toBe(0);
    expect(filterChips(changed).map(chip => chip.key)).toEqual(['category:cultural', 'budget', 'radius', 'hours']);
  });
  test('literal names work and unsupported language is explained, not guessed', () => {
    const name = parseSearch('Central Library');
    expect(searchPlaces(places, name.filters, { state: createSeed() }).map(hit => hit.place.id)).toEqual([library.id]);
    const unsupported = parseSearch('romantic teleportation');
    expect(unsupported.explanation).toContain('matched literally');
    expect(searchPlaces(places, unsupported.filters, { state: createSeed() })).toEqual([]);
  });
  test('radius is enforced without fallback expansion', () => {
    expect(searchPlaces(places, { ...emptyFilters(), radiusKm: 0.01 }, { state: createSeed() }).map(hit => hit.place.id)).toEqual([library.id]);
    expect(distanceKm(DOWNTOWN_ORIGIN, library)).toBe(0);
    expect(distanceKm(DOWNTOWN_ORIGIN, placeById('la-getty')!)).toBeGreaterThan(15);
  });
  test('map-area bounds are a hard intersection, not an ownership mutation', () => {
    const state = createSeed();
    const hits = searchPlaces(places, { ...emptyFilters(), bounds: { north: 34.051, south: 34.05, west: -118.256, east: -118.254 } }, { state });
    expect(hits.map(hit => hit.place.id)).toEqual([library.id]);
    expect(state.editions).toHaveLength(7);
    expect(removeFilter({ ...emptyFilters(), bounds: { north: 1, south: 0, west: 0, east: 1 } }, 'area').bounds).toBeUndefined();
  });
  test('ties use stable IDs independent of catalog ordering', () => {
    const catalog = [{ ...library, id: 'b' }, { ...library, id: 'a' }];
    expect(searchPlaces(catalog, emptyFilters(), { state: createSeed('empty') }).map(hit => hit.place.id)).toEqual(['a', 'b']);
  });
  test('source failures and stale hours cannot satisfy open now', () => {
    for (const sourceStatus of ['unavailable', 'stale'] as const) {
      const state = reducer(createSeed(), { type: 'PREFERENCES', patch: { sourceStatus } });
      expect(searchPlaces(places, parseSearch('open now').filters, { state })).toEqual([]);
      expect(availabilityLabel(library, state)).toBe('Hours unknown');
    }
  });
  test('hours use LA timezone and exclusive closing boundary, including overnight fixtures', () => {
    expect(isOpenAtDemoTime(library, '2026-09-19T21:00:00Z', 'sample')).toBe(true);
    expect(isOpenAtDemoTime(library, '2026-09-20T01:00:00Z', 'sample')).toBe(false);
    expect(isOpenAtDemoTime({ ...library, openHour: 22, closeHour: 2 }, '2026-09-20T08:00:00Z', 'sample')).toBe(true);
    expect(isOpenAtDemoTime(library, 'invalid', 'sample')).toBeUndefined();
    expect(isOpenAtDemoTime({ ...library, closeHour: NaN }, createSeed().clock, 'sample')).toBeUndefined();
  });
  test('changing preferences changes recommendations and cold-start appeal', () => {
    const state = createSeed('empty');
    const landmark = reducer(state, { type: 'PREFERENCES', patch: { tastes: ['landmark'] } });
    const culture = reducer(state, { type: 'PREFERENCES', patch: { tastes: ['cultural'] } });
    expect(searchPlaces(places, emptyFilters(), { state: landmark })[0].place.category).toBe('landmark');
    expect(searchPlaces(places, emptyFilters(), { state: culture })[0].place.category).toBe('cultural');
    expect(appealFor(library, landmark).label).toBe('Still learning');
    expect(appealFor(library, culture).label).toBe('High for you');
  });
  test('corrected recommendations recalculate ordering without changing frequency', () => {
    const skipped = reducer(createSeed(), { type: 'ASSESS', assessment: { placeId: library.id, sentiment: 'skip', ranking: 'unranked' } });
    expect(searchPlaces(places, emptyFilters(), { state: skipped }).at(-1)?.place.id).toBe(library.id);
    expect(library.discoveryCount).toBe(placeById(library.id)?.discoveryCount);
    expect(appealFor(library, skipped).explanation).toContain('Would skip');
  });
  test('a shared-list save is isolated to that list and preserves Maya', () => {
    let state = createSeed();
    state = reducer(state, { type: 'SAVE_PLACE', placeId: 'la-the-broad', wishlistId: 'personal' });
    expect(state.wishlists.find(list => list.id === 'saturday-maya')?.entries.find(entry => entry.placeId === 'la-the-broad')?.saverIds).toEqual(['maya']);
    state = reducer(state, { type: 'SAVE_PLACE', placeId: 'la-the-broad', wishlistId: 'saturday-maya' });
    expect(state.wishlists.find(list => list.id === 'saturday-maya')?.entries.find(entry => entry.placeId === 'la-the-broad')?.saverIds).toEqual(['maya', 'you']);
  });
  test('stale asynchronous results are rejected by request ID', async () => {
    const gate = createRequestGate();
    const old = gate.next();
    const pending = requestSearch(places, emptyFilters(), { state: createSeed() }, old);
    const current = gate.next();
    const response = await pending;
    expect(gate.isCurrent(response.requestId)).toBe(false);
    expect(gate.isCurrent(current)).toBe(true);
  });
  test('favorite and private-tip mutations do not create a visit or shared save', () => {
    const seed = createSeed('empty');
    const favorite = reducer(seed, { type: 'FAVORITE', placeId: library.id });
    const tip = reducer(favorite, { type: 'TIP', placeId: library.id, text: 'a'.repeat(300) });
    expect(tip.favorites).toContain(library.id);
    expect(tip.tips[library.id]).toHaveLength(280);
    expect(tip.editions).toEqual([]);
    expect(tip.wishlists).toEqual(seed.wishlists);
  });
});

describe('geographically projected maps', () => {
  test('fit includes all result coordinates with padding, even distant San Pedro', () => {
    const bounds = fitMapBounds(places);
    for (const place of places) {
      const point = projectPoint(place, bounds, 340, 360);
      expect(point.x).toBeGreaterThan(0); expect(point.x).toBeLessThan(340);
      expect(point.y).toBeGreaterThan(0); expect(point.y).toBeLessThan(360);
    }
  });
  test('projection runs west to east and north to south', () => {
    const bounds = { west: 0, east: 10, north: 10, south: 0 };
    expect(projectPoint({ latitude: 10, longitude: 0 }, bounds, 100, 200)).toEqual({ x: 0, y: 0 });
    expect(projectPoint({ latitude: 0, longitude: 10 }, bounds, 100, 200)).toEqual({ x: 100, y: 200 });
  });
  test('viewport bounds invert zoom and pan for Search this area', () => {
    const bounds = { west: 0, east: 10, north: 10, south: 0 };
    expect(viewportBounds(bounds, 100, 100, 1, { x: 0, y: 0 })).toEqual(bounds);
    expect(viewportBounds(bounds, 100, 100, 2, { x: 0, y: 0 })).toEqual({ west: 2.5, east: 7.5, north: 7.5, south: 2.5 });
    expect(viewportBounds(bounds, 100, 100, 1, { x: 20, y: 0 }).west).toBe(-2);
  });
  test('overlap groups preserve exactly the list IDs without duplicates or dropped points', () => {
    const hits = searchPlaces(places, parseSearch('free nearby').filters, { state: createSeed() });
    const bounds = fitMapBounds(hits.map(hit => hit.place));
    const projected = hits.map(hit => ({ id: hit.place.id, ...projectPoint(hit.place, bounds, 340, 360) }));
    const groups = clusterPoints(projected, 30);
    expect(groups.some(group => group.length > 1)).toBe(true);
    expect(groups.flat().map(point => point.id).sort()).toEqual(hits.map(hit => hit.place.id).sort());
    expect(clusterPoints(projected, 0)).toHaveLength(hits.length);
  });
});

describe('optional foreground location', () => {
  beforeEach(() => jest.clearAllMocks());
  test('default location requires no permission and is clearly sample', () => {
    expect(downtownLocation()).toMatchObject({ origin: DOWNTOWN_ORIGIN, device: false });
    expect(downtownLocation().label).toContain('sample');
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });
  test('denied permission keeps the Downtown origin and never requests coordinates', async () => {
    jest.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValue({ status: 'denied' } as Awaited<ReturnType<typeof Location.requestForegroundPermissionsAsync>>);
    const result = await requestDiscoveryLocation();
    expect(result.device).toBe(false);
    expect(result.message).toContain('not allowed');
    expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
  });
  test('granted location changes distance origin without changing the demo clock', async () => {
    jest.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValue({ status: 'granted' } as Awaited<ReturnType<typeof Location.requestForegroundPermissionsAsync>>);
    jest.mocked(Location.getCurrentPositionAsync).mockResolvedValue({ coords: { latitude: 34.07, longitude: -118.26 } } as Awaited<ReturnType<typeof Location.getCurrentPositionAsync>>);
    const result = await requestDiscoveryLocation();
    expect(result).toMatchObject({ device: true, origin: { latitude: 34.07, longitude: -118.26 } });
    expect(result.message).toContain('still sample');
  });
  test('unavailable device service has a recoverable sample fallback', async () => {
    jest.mocked(Location.requestForegroundPermissionsAsync).mockRejectedValue(new Error('Unavailable'));
    expect(await requestDiscoveryLocation()).toMatchObject({ device: false, origin: DOWNTOWN_ORIGIN });
  });
});

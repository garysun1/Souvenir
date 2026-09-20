import { collectionPlaces, defaultCollectionFilters, editionMonths, validDay } from '@/domain/collection';
import { createSeed } from '@/state/seed';

test('collection filters return one deduplicated ID set usable by list, album, and map', () => {
  const state = createSeed();
  const filters = { ...defaultCollectionFilters, category: 'cultural' as const, favorites: true };
  expect(collectionPlaces(state, 'been', filters).map(place => place.id)).toEqual(['la-central-library']);
  expect(collectionPlaces(state, 'been', { ...filters, category: 'all', favorites: false })).toHaveLength(6);
});
test('companion and date filters operate on edition days and month groups stay authoritative', () => {
  const state = createSeed(); const filters = { ...defaultCollectionFilters, companion: 'maya', after: '2026-09-12' };
  const result = collectionPlaces(state, 'been', filters);
  expect(result.map(place => place.id)).toEqual(['la-griffith-observatory', 'la-getty', 'la-union-station']);
  expect(editionMonths(state, result.map(place => place.id), filters).flatMap(group => group.editions)).toHaveLength(3);
});
test('date validation rejects rolled calendar dates', () => { expect(validDay('2026-02-29')).toBe(false); expect(validDay('2026-08-02')).toBe(true); });

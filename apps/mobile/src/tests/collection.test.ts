import { collectionPlaces, defaultCollectionFilters, editionMonths, matchingEditions, validDay } from '@/domain/collection';
import { createSeed } from '@/state/seed';
import { visitDate } from '@/state/selectors';

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
test.each([
  ['2026-08-20T01:45:00Z', 'UTC', 'Aug 20, 2026'],
  ['2026-08-20T01:45:00Z', 'America/Los_Angeles', 'Aug 19, 2026'],
  ['2026-03-01T01:45:00Z', 'UTC', 'Mar 1, 2026'],
  ['2026-03-01T01:45:00Z', 'America/Los_Angeles', 'Feb 28, 2026'],
  ['2026-08-20T20:00:00Z', 'Asia/Tokyo', 'Aug 21, 2026'],
  ['2026-01-01T01:45:00Z', 'America/Los_Angeles', 'Dec 31, 2025'],
])('visit labels honor the recorded timezone: %s in %s', (instant, timezone, expected) => {
  expect(visitDate(instant, timezone)).toBe(expected);
});
test('LA drafts and planner labels retain the city timezone default', () => {
  expect(visitDate('2026-08-20T01:45:00Z')).toBe('Aug 19, 2026');
});
test('date filters, album months and date labels agree across a timezone month boundary', () => {
  const state = createSeed('empty');
  const sample = createSeed().editions[0];
  const utc = { ...sample, id: 'utc', visitedAt: '2026-09-01T01:45:00Z', timezone: 'UTC' };
  const la = { ...utc, id: 'la', timezone: 'America/Los_Angeles' };
  state.editions = [utc, la];
  expect(matchingEditions(state, { ...defaultCollectionFilters, after: '2026-09-01', before: '2026-09-01' })).toEqual([utc]);
  expect(matchingEditions(state, { ...defaultCollectionFilters, after: '2026-08-31', before: '2026-08-31' })).toEqual([la]);
  const groups = editionMonths(state, [sample.placeId], defaultCollectionFilters);
  expect(groups).toHaveLength(2);
  expect(groups.find(group => group.month === '2026-09')?.editions).toEqual([utc]);
  expect(groups.find(group => group.month === '2026-08')?.editions).toEqual([la]);
  expect(visitDate(utc.visitedAt, utc.timezone)).toBe('Sep 1, 2026');
  expect(visitDate(la.visitedAt, la.timezone)).toBe('Aug 31, 2026');
});

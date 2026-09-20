import { createSeed } from '@/state/seed';
import { reducer } from '@/state/reducer';
import { collectedPlaceIds, ownEditions, overlapIds, setProgress } from '@/state/selectors';
import type { Edition } from '@/domain/types';
import { migrateStoredState } from '@/state/migrations';
const edition: Omit<Edition, 'sequence'> = { id: 'broad-1', requestId: 'capture-1', ownerId: 'you', placeId: 'la-the-broad', visitedAt: '2026-09-19T21:00:00.000Z', timezone: 'America/Los_Angeles', companions: ['maya'], moment: 'Loved it.', origin: 'capture' };
test('capture, idempotent retry, and revisits preserve unique-place and set invariants', () => {
  let state = createSeed();
  expect([collectedPlaceIds(state).length, ownEditions(state).length, setProgress(state)]).toEqual([6, 7, 1]);
  state = reducer(state, { type: 'ADD_EDITION', edition });
  state = reducer(state, { type: 'ADD_EDITION', edition });
  expect([collectedPlaceIds(state).length, ownEditions(state).length, setProgress(state)]).toEqual([7, 8, 2]);
  state = reducer(state, { type: 'ADD_EDITION', edition: { ...edition, id: 'broad-2', requestId: 'capture-2' } });
  expect([collectedPlaceIds(state).length, ownEditions(state).length, setProgress(state)]).toEqual([7, 9, 2]);
});
test('Maya editions never increase current-user counts', () => {
  const state = reducer(createSeed(), { type: 'ADD_EDITION', edition: { ...edition, ownerId: 'maya' } });
  expect(ownEditions(state)).toHaveLength(7);
  expect(collectedPlaceIds(state)).toHaveLength(6);
});
test('shared wishlist derives overlap from member saves', () => {
  const before = createSeed();
  expect(overlapIds(before.wishlists[1])).toHaveLength(2);
  const after = reducer(before, { type: 'SAVE_PLACE', placeId: 'la-the-broad', wishlistId: 'saturday-maya' });
  expect(overlapIds(after.wishlists[1])).toHaveLength(3);
});
test('version-zero local state migrates with new defaults and preserved memories', () => {
  const legacy = createSeed();
  const migrated = migrateStoredState({ ...legacy, version: 0, preferences: { onboardingComplete: true, tastes: ['park'], name: 'Eric' }, importedSourceIds: undefined });
  expect(migrated).not.toBeNull();
  expect(migrated?.version).toBe(1);
  expect(migrated?.preferences).toMatchObject({ onboardingComplete: true, tastes: ['park'], name: 'Eric', sourceStatus: 'sample' });
  expect(migrated?.editions).toHaveLength(7);
  expect(migrated?.importedSourceIds).toEqual([]);
});
test('unknown or malformed persisted versions fail closed', () => {
  expect(migrateStoredState({ version: 7 })).toBeNull();
  expect(migrateStoredState({ version: 1, editions: [] })).toBeNull();
  expect(migrateStoredState('not state')).toBeNull();
});

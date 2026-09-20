import { captureToEdition } from '@/domain/capture';
import { collectionPlaces, defaultCollectionFilters, matchingEditions } from '@/domain/collection';
import { encodeLocal, restoreLocal } from '@/lib/local';
import { createSeed } from '@/state/seed';
import { reducer } from '@/state/reducer';
import type { CaptureDraft } from '@/domain/types';

const draft: CaptureDraft = {
  id: 'new-memory', placeId: 'la-the-broad', visitedAt: '2026-09-19T20:30:00.000Z',
  timezone: 'America/Los_Angeles', companions: [], moment: 'Sun through the gallery',
  outingId: 'shared-afternoon', status: 'confirm',
};

test('visit audience defaults to private and survives draft persistence before reveal', () => {
  const state = createSeed('empty');
  expect(captureToEdition(draft, state.clock).visibility).toBe('private');
  const restored = restoreLocal(encodeLocal({ ...state, captureDraft: { ...draft, visibility: 'friends' } }));
  expect(captureToEdition(restored.captureDraft!, state.clock)).toMatchObject({ visibility: 'friends', outingId: draft.outingId, requestId: draft.id });
});

test('outing albums contain only matching personal visits, including revisits', () => {
  let state = createSeed('empty');
  const first = captureToEdition(draft, state.clock);
  state = reducer(state, { type: 'ADD_EDITION', edition: first });
  state = reducer(state, { type: 'ADD_EDITION', edition: { ...first, id: 'another-day', requestId: 'another-day', outingId: 'another-trip' } });
  const filters = { ...defaultCollectionFilters, outingId: draft.outingId };
  expect(matchingEditions(state, filters).map(edition => edition.requestId)).toEqual([draft.id]);
  expect(collectionPlaces(state, 'been', filters).map(place => place.id)).toEqual([draft.placeId]);
  expect(collectionPlaces(state, 'been', { ...filters, outingId: 'missing' })).toEqual([]);
});

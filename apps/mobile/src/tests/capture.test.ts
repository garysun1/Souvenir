import { captureToEdition, editionStamp, exifSuggestion, identifyAfterDelay, identifyCapture, localVisitInput, mediaFingerprint, mediaKey, nextOutingStop, parseLocalVisit, samplePhoto, suspectedDuplicate, validateVisit } from '@/domain/capture';
import type { CaptureDraft, Edition } from '@/domain/types';
import { reducer } from '@/state/reducer';
import { createSeed } from '@/state/seed';
import { collectedPlaceIds, ownEditions, setProgress } from '@/state/selectors';

const draft: CaptureDraft = { id: 'capture-test', placeId: 'la-the-broad', photoUri: samplePhoto('la-the-broad'), visitedAt: '2026-09-19T20:30:00.000Z', companions: ['maya', 'maya', 'unknown'], moment: '  A bright afternoon.  ', status: 'reveal' };

test('identification only auto-selects fixture or explicit context and never claims certainty', () => {
  expect(identifyCapture({ photoUri: samplePhoto('la-grand-park') }).selectedId).toBe('la-grand-park');
  const arbitrary = identifyCapture({ photoUri: 'media:3-abc-def.jpg' });
  expect(arbitrary.selectedId).toBeUndefined();
  expect(arbitrary.reason).toContain('not identified');
  expect(identifyCapture({ photoUri: samplePhoto('la-the-broad') }, true).candidates).toEqual([]);
});

test('future visit validation follows the demo clock rather than the device clock', () => {
  const clock = '2026-09-19T21:00:00.000Z';
  expect(validateVisit('2026-09-19T21:00:01.000Z', clock)).toContain('future');
  expect(validateVisit('2026-09-19T21:00:00.000Z', clock)).toBeUndefined();
  expect(validateVisit('invalid', clock)).toContain('valid');
  expect(validateVisit(clock, clock, 'x'.repeat(161))).toContain('160');
});

test('Los Angeles local inputs round-trip and reject a daylight-saving gap', () => {
  const iso = '2026-09-19T21:15:00.000Z';
  expect(localVisitInput(iso)).toBe('2026-09-19T14:15');
  expect(parseLocalVisit('2026-09-19T14:15')).toBe(iso);
  expect(parseLocalVisit('2026-03-08T02:30')).toBeUndefined();
});

test('capture conversion creates a stable idempotency request and sanitized metadata', () => {
  const edition = captureToEdition(draft, '2026-09-19T21:00:00.000Z');
  expect(edition).toMatchObject({ id: 'edition-capture-test', requestId: 'capture-test', ownerId: 'you', placeId: 'la-the-broad', companions: ['maya'], moment: 'A bright afternoon.', origin: 'capture' });
  expect(() => captureToEdition({ ...draft, placeId: 'missing' }, '2026-09-19T21:00:00.000Z')).toThrow('catalog');
});

test('idempotent save and revisit retain unique-place and monotonic sequence invariants', () => {
  let state = createSeed();
  const edition = captureToEdition(draft, state.clock);
  state = reducer(state, { type: 'DRAFT', draft });
  state = reducer(state, { type: 'ADD_EDITION', edition });
  state = reducer(state, { type: 'ADD_EDITION', edition });
  expect(state.captureDraft).toMatchObject({ status: 'saved', editionId: edition.id });
  expect([collectedPlaceIds(state).length, ownEditions(state).length, setProgress(state)]).toEqual([7, 8, 2]);
  state = reducer(state, { type: 'ADD_EDITION', edition: { ...edition, id: 'edition-return', requestId: 'capture-return', visitedAt: '2026-09-19T20:45:00.000Z' } });
  const visits = ownEditions(state).filter(item => item.placeId === 'la-the-broad');
  expect(visits.map(item => item.sequence)).toEqual([1, 2]);
  expect(editionStamp(visits[1].sequence)).toBe('Return visit · Edition 02');
  expect([collectedPlaceIds(state).length, setProgress(state)]).toEqual([7, 2]);
});

test('same photo and time is suspected, but a different visit is not', () => {
  const edition: Edition = { ...captureToEdition(draft, '2026-09-19T21:00:00.000Z'), sequence: 1 };
  const state = { ...createSeed(), editions: [edition] };
  expect(suspectedDuplicate(state, { ...draft, id: 'another' })?.id).toBe(edition.id);
  expect(suspectedDuplicate(state, { ...draft, id: 'another', visitedAt: '2026-09-19T20:31:00.000Z' })).toBeUndefined();
});

test('media identities are deterministic and reject traversal or malformed ids', () => {
  const bytes = new Uint8Array([1, 2, 3, 4]);
  expect(mediaFingerprint(bytes)).toBe(mediaFingerprint(new Uint8Array(bytes)));
  expect(mediaFingerprint(bytes)).not.toBe(mediaFingerprint(new Uint8Array([1, 2, 3, 5])));
  expect(mediaKey(`media:${mediaFingerprint(bytes)}.jpg`)).toBe(`${mediaFingerprint(bytes)}.jpg`);
  expect(mediaKey('media:../../secret.jpg')).toBeUndefined();
});

test('optional EXIF metadata suggests a place/date, without changing the demo clock', () => {
  const suggestion = exifSuggestion({ DateTimeOriginal: '2026:09:19 15:15:00', GPSLatitude: 34.0544, GPSLongitude: -118.2506 });
  expect(suggestion).toEqual({ visitedAt: '2026-09-19T22:15:00.000Z', placeId: 'la-the-broad' });
  expect(validateVisit(suggestion.visitedAt!, createSeed().clock)).toContain('future');
  expect(exifSuggestion(undefined)).toEqual({});
  expect(exifSuggestion({ GPSLatitude: 0, GPSLongitude: 0 }).placeId).toBeUndefined();
});

test('identification ignores canceled late results and resolves only after the demo delay', async () => {
  jest.useFakeTimers();
  try {
    const controller = new AbortController();
    const canceled = identifyAfterDelay(draft, false, controller.signal);
    controller.abort();
    await expect(canceled).rejects.toThrow('canceled');
    jest.advanceTimersByTime(1000);
    const result = identifyAfterDelay(draft, false, new AbortController().signal);
    jest.advanceTimersByTime(900);
    await expect(result).resolves.toMatchObject({ selectedId: 'la-the-broad' });
  } finally { jest.useRealTimers(); }
});

test('correcting a sample match changes edition identity and set attribution, not its photo', () => {
  const state = createSeed();
  const corrected = captureToEdition({ ...draft, placeId: 'la-grand-park' }, state.clock);
  expect(corrected.photoUri).toBe(samplePhoto('la-the-broad'));
  const next = reducer(state, { type: 'ADD_EDITION', edition: corrected });
  expect(collectedPlaceIds(next)).toContain('la-grand-park');
  expect(collectedPlaceIds(next)).not.toContain('la-the-broad');
  expect(setProgress(next)).toBe(2);
});

test('last-edition deletion removes visit ranks but retains place favorites and tips; numbers are not reused', () => {
  let state = createSeed();
  const edition = captureToEdition(draft, state.clock);
  state = reducer(state, { type: 'ADD_EDITION', edition });
  state = reducer(state, { type: 'FAVORITE', placeId: edition.placeId });
  state = reducer(state, { type: 'TIP', placeId: edition.placeId, text: 'Keep this note.' });
  state = reducer(state, { type: 'ASSESS', assessment: { placeId: edition.placeId, sentiment: 'recommend', ranking: 'unranked' } });
  state = reducer(state, { type: 'DELETE_EDITION', id: edition.id });
  expect(setProgress(state)).toBe(1);
  expect(state.assessments.find(item => item.placeId === edition.placeId)).toBeUndefined();
  expect(state.favorites).toContain(edition.placeId);
  expect(state.tips[edition.placeId]).toBe('Keep this note.');
  state = reducer(state, { type: 'ADD_EDITION', edition: { ...edition, id: 'new-visit', requestId: 'new-request' } });
  expect(state.editions.find(item => item.id === 'new-visit')?.sequence).toBe(2);
});

test('next outing stop skips only captures linked to the same outing', () => {
  let state = createSeed();
  state = { ...state, outings: [{ id: 'outing-test', planId: 'plan-test', title: 'Test', participantIds: ['you'], placeIds: ['la-the-broad', 'la-grand-park'] }] };
  expect(nextOutingStop(state, 'outing-test')).toBe('la-the-broad');
  const first = { ...captureToEdition({ ...draft, outingId: 'outing-test' }, state.clock), outingId: 'outing-test' };
  state = reducer(state, { type: 'ADD_EDITION', edition: first });
  expect(nextOutingStop(state, 'outing-test')).toBe('la-grand-park');
});

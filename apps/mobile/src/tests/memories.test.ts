import type { MemoryMomentDto } from '../../../../shared/memories-contract';
import { assertUploadDestination, confirmedStop, groupMoments, importMetadata, memoryGroupKey, parseMemoryInstant, sameSource, toggleId } from '@/domain/memories';

const moment = (id: string, instant: string | null, groupKey: string | null = null): MemoryMomentDto => ({
  id, authorId: 'alice', albumId: null, source: { kind: 'edition', id: 'edition' }, note: null, groupKey,
  confirmedStop: instant ? { placeId: 'garden', capturedAt: instant, timezone: 'America/Los_Angeles' } : null,
  version: 1, createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z',
});
test('metadata never invents an offset or ambient device location', () => {
  expect(importMetadata()).toEqual({ capturedAt: null, timezone: null, latitude: null, longitude: null, accuracyM: null, origin: 'unknown' });
  expect(importMetadata({ DateTimeOriginal: '2025:05:01 12:30:00' }).capturedAt).toBeNull();
  expect(importMetadata({ GPSLatitude: 34 }).latitude).toBeNull();
});
test('valid EXIF offset and hemispheres become suggestions without a confirmed stop', () => {
  expect(importMetadata({ DateTimeOriginal: '2025:05:01 12:30:00', OffsetTimeOriginal: '-07:00', GPSLatitude: 34, GPSLongitude: 118, GPSLatitudeRef: 'N', GPSLongitudeRef: 'W' }))
    .toEqual({ capturedAt: '2025-05-01T19:30:00.000Z', timezone: null, latitude: 34, longitude: -118, accuracyM: null, origin: 'exif' });
});
test.each(['2025-02-29T00:00:00Z', '2025-04-31T00:00:00Z', '2025-13-01T00:00:00Z', '2025-05-01T24:00:00Z', '2025-05-01T12:00', '2025-05-01T12:00:00+14:30', 'garbage'])
('rejects invalid or ambiguous historical instant %s', value => expect(parseMemoryInstant(value)).toBeNull());
test('leap days and explicit offsets normalize correctly', () => {
  expect(parseMemoryInstant('2024-02-29T23:00:00-08:00')).toBe('2024-03-01T07:00:00.000Z');
  expect(parseMemoryInstant('2025-05-01T00:00Z')).toBe('2025-05-01T00:00:00.000Z');
  expect(importMetadata({ DateTimeOriginal: '2025:02:30 00:00:00', OffsetTimeOriginal: '+00:00' }).capturedAt).toBeNull();
});
test('confirmed stops need a catalog place, actual timezone and past explicit instant', () => {
  expect(() => confirmedStop('', '2025-01-01T00:00:00Z', 'UTC')).toThrow('catalog');
  expect(() => confirmedStop('place', '2025-01-01T00:00:00Z', 'Guess/Here')).toThrow('IANA');
  expect(() => confirmedStop('place', '2999-01-01T00:00:00Z', 'UTC')).toThrow('future');
  expect(confirmedStop('place', '2025-01-01T00:00:00-08:00', 'America/Los_Angeles')).toEqual({ placeId: 'place', capturedAt: '2025-01-01T08:00:00.000Z', timezone: 'America/Los_Angeles' });
});
test('grouping uses historical local calendar days, place and explicit group key', () => {
  const a = moment('a', '2025-01-02T01:00:00Z');
  const b = moment('b', '2025-01-02T07:00:00Z');
  const nextDay = moment('c', '2025-01-02T09:00:00Z');
  const split = moment('d', '2025-01-02T01:00:00Z', 'second-stop');
  const otherPlace = { ...a, id: 'e', confirmedStop: { ...a.confirmedStop!, placeId: 'museum' } };
  expect(memoryGroupKey(a)).toBe(memoryGroupKey(b));
  expect(new Set([a, nextDay, split, otherPlace].map(memoryGroupKey)).size).toBe(4);
  expect(groupMoments([a, b, nextDay, split, otherPlace]).map(group => group.items.length).sort()).toEqual([1, 1, 1, 2]);
});
test('unresolved moments are always separate even when group keys match', () => {
  expect(groupMoments([moment('a', null, 'together'), moment('b', null, 'together')])).toHaveLength(2);
});
test('interest and collage selections preserve bounds and allow deselection at the limit', () => {
  expect(toggleId(['a', 'b'], 'c', 2)).toEqual(['a', 'b']);
  expect(toggleId(['a', 'b'], 'a', 2)).toEqual(['b']);
  expect(sameSource({ kind: 'edition', id: 'one' }, { kind: 'import_item', id: 'one' })).toBe(false);
});
test.each([['public', 'alice/photo.jpg'], ['captures', 'bob/photo.jpg'], ['captures', 'alice/../photo.jpg'], ['captures', 'alice/photo.jpg/extra'], ['captures', 'alice/photo.svg']])
('rejects unowned or unexpected upload destination %s/%s', (bucket, path) => expect(() => assertUploadDestination(bucket, path, 'alice')).toThrow('destination'));
test('only a flat owned capture path is accepted', () => expect(() => assertUploadDestination('captures', 'alice/abc-123.webp', 'alice')).not.toThrow());

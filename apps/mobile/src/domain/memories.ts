import type { ConfirmedMemoryStop, ImportItemDto, ImportMetadata, MemoryMomentDto, TasteInterest, TasteSourceRef } from '../../../../shared/memories-contract';
import { validTimezone } from './capture';

export const tasteInterests: readonly TasteInterest[] = [
  'gardens', 'architecture', 'museums', 'street_food', 'waterfronts', 'hiking', 'beaches', 'parks',
  'art', 'history', 'cafes', 'markets', 'live_music', 'theater', 'local_food', 'photography',
  'scenic_views', 'wildlife', 'cycling', 'bookshops',
];
export const interestLabel = (interest: string) => interest.replace(/_/g, ' ');
export const sourceKey = (source: TasteSourceRef) => `${source.kind}:${source.id}`;
export const sameSource = (a: TasteSourceRef, b: TasteSourceRef) => sourceKey(a) === sourceKey(b);
export const toggleId = (ids: string[], id: string, limit = 100) => ids.includes(id) ? ids.filter(value => value !== id) : ids.length < limit ? [...ids, id] : ids;
export const canCommitItem = (item: ImportItemDto) => ['uploaded', 'ready'].includes(item.state);

export function parseMemoryInstant(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(\.\d{1,3})?)?(Z|([+-])(\d{2}):(\d{2}))$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute, second, , , , offsetHour, offsetMinute] = match;
  const days = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
  if (Number(year) < 1 || Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > days ||
    Number(hour) > 23 || Number(minute) > 59 || Number(second ?? 0) > 59 ||
    Number(offsetHour ?? 0) > 14 || Number(offsetMinute ?? 0) > 59 ||
    (Number(offsetHour) === 14 && Number(offsetMinute) !== 0)) return null;
  return Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
}
export function confirmedStop(placeId: string, instant: string, timezone: string): ConfirmedMemoryStop {
  if (!placeId) throw new Error('Choose the historical place from the catalog.');
  if (!validTimezone(timezone)) throw new Error('Enter an IANA timezone, for example America/Los_Angeles.');
  const capturedAt = parseMemoryInstant(instant);
  if (!capturedAt) {
    throw new Error('Enter a date and time with an explicit offset, for example 2025-07-20T15:30:00-07:00.');
  }
  if (Date.parse(instant) > Date.now()) throw new Error('A memory cannot be confirmed in the future.');
  return { placeId, capturedAt, timezone };
}

function finite(value: unknown) { return typeof value === 'number' && Number.isFinite(value) ? value : null; }
function gps(value: unknown, direction: unknown, max: number) {
  const number = finite(value);
  if (number === null) return null;
  const signed = direction === 'S' || direction === 'W' ? -Math.abs(number) : number;
  return Math.abs(signed) <= max ? signed : null;
}
export function importMetadata(exif?: Record<string, unknown> | null): ImportMetadata {
  const date = exif?.DateTimeOriginal;
  const offset = exif?.OffsetTimeOriginal;
  let capturedAt: string | null = null;
  if (typeof date === 'string' && /^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}$/.test(date) &&
    typeof offset === 'string' && /^[+-](0\d|1[0-4]):[0-5]\d$/.test(offset)) {
    const iso = `${date.slice(0, 10).replace(/:/g, '-')}T${date.slice(11)}${offset}`;
    capturedAt = parseMemoryInstant(iso);
  }
  const latitude = gps(exif?.GPSLatitude, exif?.GPSLatitudeRef, 90);
  const longitude = gps(exif?.GPSLongitude, exif?.GPSLongitudeRef, 180);
  const located = latitude !== null && longitude !== null;
  return {
    capturedAt, timezone: null, latitude: located ? latitude : null, longitude: located ? longitude : null,
    accuracyM: null, origin: capturedAt || located ? 'exif' : 'unknown',
  };
}

export function memoryGroupKey(moment: Pick<MemoryMomentDto, 'id' | 'confirmedStop' | 'groupKey'>) {
  const stop = moment.confirmedStop;
  if (!stop || !validTimezone(stop.timezone) || !Number.isFinite(Date.parse(stop.capturedAt))) return `unresolved:${moment.id}`;
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: stop.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(stop.capturedAt));
  return JSON.stringify([day, stop.placeId, moment.groupKey]);
}
export function groupMoments(moments: MemoryMomentDto[]) {
  const groups = new Map<string, MemoryMomentDto[]>();
  for (const moment of moments) {
    const key = memoryGroupKey(moment);
    groups.set(key, [...(groups.get(key) ?? []), moment]);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, items]) => ({ key, items }));
}

export function assertUploadDestination(bucket: string, path: string, userId: string) {
  if (bucket !== 'captures' || !path.startsWith(`${userId}/`) || path.split('/').length !== 2 ||
    !/^[a-zA-Z0-9_-]+\.(jpe?g|png|webp)$/.test(path.split('/')[1])) {
    throw new Error('The private upload destination is invalid.');
  }
}

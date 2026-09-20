import { randomUUID } from 'expo-crypto';
import type { AppState, CaptureDraft, Edition } from '@/domain/types';
import { placeById, places, users } from '@/fixtures/catalog';

export const CAPTURE_TIMEZONE = 'America/Los_Angeles';
export function validTimezone(value: string) {
  try { new Intl.DateTimeFormat('en', { timeZone: value }).format(); return !!value; } catch { return false; }
}
export const samplePhoto = (placeId: string) => `sample:${placeId}`;
export const samplePlaceId = (uri?: string) => uri?.startsWith('sample:') ? uri.slice(7) : undefined;
export const newCaptureId = () => randomUUID();

export function identifyCapture(draft: Pick<CaptureDraft, 'photoUri' | 'placeId'>, failure = false) {
  if (failure) return { candidates: [] as string[], selectedId: undefined, reason: 'Demo identification is unavailable. Your photo is safe; choose a place yourself.' };
  const sample = samplePlaceId(draft.photoUri);
  const known = sample && placeById(sample) ? sample : draft.placeId && placeById(draft.placeId) ? draft.placeId : undefined;
  return {
    candidates: [...new Set([known, 'la-the-broad', 'la-grand-park', 'la-central-library'].filter((id): id is string => !!id && !!placeById(id)))],
    selectedId: known,
    reason: sample && known ? 'This sample photograph is linked to a catalog place. Please confirm it.' : known
      ? 'Suggested from capture context or available photo metadata, not from analysis of the pixels.'
      : 'These are fixture suggestions, not identified matches. Choose the place you visited.',
  };
}

/** An aborted operation never produces a result, including after backgrounding. */
export function identifyAfterDelay(draft: Pick<CaptureDraft, 'photoUri' | 'placeId'>, failure: boolean, signal: AbortSignal) {
  return new Promise<ReturnType<typeof identifyCapture>>((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new Error('Identification canceled')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); if (!signal.aborted) resolve(identifyCapture(draft, failure)); }, 900);
    if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true });
  });
}

export function searchCapturePlaces(query: string) {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return places.filter(place => words.every(word => `${place.name} ${place.neighborhood} ${place.tags.join(' ')}`.toLocaleLowerCase().includes(word)));
}

export function validateVisit(visitedAt: string, clock: string, moment = '', maxLength = 160): string | undefined {
  if (!visitedAt || !Number.isFinite(Date.parse(visitedAt))) return 'Choose a valid visit date and time.';
  if (Date.parse(visitedAt) > Date.parse(clock)) return 'This visit is in the future. Choose an earlier time.';
  if (moment.length > maxLength) return `Keep your moment to ${maxLength} characters or fewer.`;
  return undefined;
}

export function captureToEdition(draft: CaptureDraft, clock: string): Omit<Edition, 'sequence'> {
  const error = validateVisit(draft.visitedAt, clock, draft.moment);
  if (error) throw new Error(error);
  const place = draft.placeId ? placeById(draft.placeId) : undefined;
  if (!place) throw new Error('Choose a catalog destination.');
  const timezone = draft.timezone ?? (place.canonical ? place.timezone ?? 'UTC' : CAPTURE_TIMEZONE);
  if (!validTimezone(timezone)) throw new Error('Confirm a valid visit timezone.');
  return { id: `edition-${draft.id}`, requestId: draft.id, ownerId: 'you', placeId: place.id,
    photoUri: draft.photoUri, visitedAt: draft.visitedAt, timezone,
    companions: [...new Set(draft.companions.map(name => name.trim()).filter(name => place.canonical ? !!name : users.some(user => user.id === name && name !== 'you')))],
    moment: draft.moment.trim(), outingId: draft.outingId, origin: 'capture' };
}

export const editionStamp = (sequence: number) => `${sequence === 1 ? 'First visit' : 'Return visit'} · Edition ${String(sequence).padStart(2, '0')}`;
export function suspectedDuplicate(state: AppState, draft: CaptureDraft) {
  if (!draft.photoUri) return undefined;
  return state.editions.find(edition => edition.ownerId === 'you' && edition.requestId !== draft.id
    && edition.placeId === draft.placeId && edition.photoUri === draft.photoUri
    && Date.parse(edition.visitedAt) === Date.parse(draft.visitedAt));
}
export function nextOutingStop(state: AppState, outingId?: string) {
  const outing = state.outings.find(item => item.id === outingId);
  return outing?.placeIds.find(placeId => !state.editions.some(edition => edition.ownerId === 'you' && edition.outingId === outingId && edition.placeId === placeId));
}

export function localVisitInput(iso: string, timezone = CAPTURE_TIMEZONE): string {
  if (!Number.isFinite(Date.parse(iso))) return '';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso));
  const part = (name: string) => parts.find(p => p.type === name)?.value;
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}

/** Resolve wall time in the selected zone, rejecting daylight-saving gaps. */
export function parseLocalVisit(value: string, timezone = CAPTURE_TIMEZONE): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return undefined;
  const nominal = Date.parse(`${value}:00Z`);
  if (!Number.isFinite(nominal)) return undefined;
  if (!validTimezone(timezone)) return undefined;
  const offsets = [-36, -12, 0, 12, 36].map(hours => {
    const instant = nominal + hours * 3600000;
    return Date.parse(`${localVisitInput(new Date(instant).toISOString(), timezone)}:00Z`) - instant;
  });
  return [...new Set(offsets)].map(offset => new Date(nominal - offset).toISOString()).sort().find(iso => localVisitInput(iso, timezone) === value);
}

/** Optional EXIF metadata is only an editable suggestion, never an identification claim. */
export function exifSuggestion(exif: Record<string, unknown> | null | undefined) {
  if (!exif) return {};
  const dateValue = [exif.DateTimeOriginal, exif.DateTimeDigitized, exif.DateTime].find(value => typeof value === 'string') as string | undefined;
  const matched = dateValue?.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2})/);
  const visitedAt = matched ? parseLocalVisit(`${matched[1]}-${matched[2]}-${matched[3]}T${matched[4]}:${matched[5]}`) : undefined;
  const decimal = (input: unknown): number | undefined => {
    if (typeof input === 'number' && Number.isFinite(input)) return input;
    if (Array.isArray(input) && input.length >= 3 && input.every(value => typeof value === 'number')) return input[0] + input[1] / 60 + input[2] / 3600;
    return undefined;
  };
  let latitude = decimal(exif.GPSLatitude); let longitude = decimal(exif.GPSLongitude);
  if (latitude !== undefined && exif.GPSLatitudeRef === 'S') latitude = -Math.abs(latitude);
  if (longitude !== undefined && exif.GPSLongitudeRef === 'W') longitude = -Math.abs(longitude);
  let placeId: string | undefined;
  if (latitude !== undefined && longitude !== undefined) {
    const nearest = places.map(place => ({ id: place.id, distance: Math.hypot((place.latitude - latitude!) * 111, (place.longitude - longitude!) * 92) })).sort((a, b) => a.distance - b.distance)[0];
    if (nearest?.distance <= 5) placeId = nearest.id;
  }
  return { visitedAt, placeId };
}

/** Content identity, not a security hash. Stable across selecting the same photo again. */
export function mediaFingerprint(bytes: Uint8Array) {
  let a = 2166136261; let b = 5381;
  for (const byte of bytes) { a = Math.imul(a ^ byte, 16777619); b = Math.imul(b, 33) ^ byte; }
  return `${bytes.length.toString(36)}-${(a >>> 0).toString(36)}-${(b >>> 0).toString(36)}`;
}
export const mediaKey = (id: string) => /^media:([a-z0-9-]+\.(?:jpg|png|webp|heic|gif))$/.exec(id)?.[1];

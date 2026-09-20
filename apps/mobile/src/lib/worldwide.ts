import type { PlaceDto } from '../../../../shared/api-contract';
import type { PlaceImageDto, PlaceMetricsDto } from '../../../../shared/worldwide-contract';
import { ApiError } from './api';

export type AccountRequest = <T>(path: string, method?: string, input?: unknown) => Promise<T>;
export interface SearchHit { place: PlaceDto; distanceKm: number | null; score: number }
export const placePath = (slug: string) => `/api/places/${encodeURIComponent(slug)}`;
export function queryString(values: Record<string, string | number | undefined>) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value !== undefined && value !== '') query.set(key, String(value));
  return query.toString();
}
export function duplicatePlace(error: unknown): PlaceDto | undefined {
  if (!(error instanceof ApiError) || error.status !== 409) return;
  const details = error.details;
  if (!details || typeof details !== 'object' || !('existingPlace' in details)) return;
  const place = details.existingPlace;
  if (!place || typeof place !== 'object' || !('id' in place) || typeof place.id !== 'string'
    || !('slug' in place) || typeof place.slug !== 'string' || !('name' in place) || typeof place.name !== 'string'
    || !('category' in place) || !['nature', 'culture', 'food', 'landmark', 'hidden_gem'].includes(String(place.category))
    || !('lat' in place) || typeof place.lat !== 'number' || !('lng' in place) || typeof place.lng !== 'number') return;
  return place as PlaceDto;
}
export function frequencyLabel(metrics: PlaceMetricsDto | null | undefined) {
  if (!metrics || metrics.frequency.status === 'unavailable') return 'Unavailable';
  if (metrics.frequency.status === 'insufficient') return 'Not enough collectors';
  if (metrics.discoveryFreq === null) return 'Unavailable';
  return `${Math.round(metrics.discoveryFreq * 100)}% of city collectors${metrics.frequency.status === 'stale' ? ' · stale' : ''}`;
}
export function availableImages(images: PlaceImageDto[]) {
  return images.filter(image => !!safeWebUrl(image.url) && !!safeWebUrl(image.sourcePageUrl) && !!image.license.trim() && !!image.attribution.trim()
    && (!image.expiresAt || Date.parse(image.expiresAt) > Date.now()));
}
export function safeWebUrl(value: string | null | undefined) {
  if (!value) return undefined;
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : undefined; }
  catch { return undefined; }
}

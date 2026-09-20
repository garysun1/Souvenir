import type { PlaceDto } from '../../../../shared/api-contract';
import type { PlaceImageDto, PlaceMetricsDto } from '../../../../shared/worldwide-contract';
import { AccountApi, AccountScope, ApiError } from '@/lib/api';
import { mapPlace } from '@/lib/bootstrap';
import { availableImages, duplicatePlace, frequencyLabel } from '@/lib/worldwide';
import { mergeCatalog, places, restoreFixtureCatalog } from '@/fixtures/catalog';
import { captureToEdition, localVisitInput, parseLocalVisit } from '@/domain/capture';
import { MutationDraft } from '@/lib/useAccountMutation';

jest.mock('@/state/AppProvider', () => ({ useApp: jest.fn() }));
const instant = '2026-09-19T20:30:00.000Z';
const place: PlaceDto = { id: '854562e1-364a-47fb-a12b-7e89744a5da6', slug: 'tokyo-garden', name: 'Tokyo garden', category: 'nature', city: 'Tokyo', country: 'JP', timezone: 'Asia/Tokyo', lat: 35, lng: 139, description: 'A catalog garden', heroImageUrl: 'https://example.test/unattributed.jpg', rarityTier: 'common', rarityAppeal: 99, rarityDiscoveryFreq: 99, rarityAvailability: 99, externalIds: null, stats: null, createdAt: instant };
const image: PlaceImageDto = { id: 'image', placeId: place.id, provider: 'wikimedia', url: 'https://example.test/photo.jpg', sourcePageUrl: 'https://example.test/source', license: 'CC-BY-4.0', licenseUrl: 'https://example.test/license', attribution: 'Test photographer', isHero: true, width: 640, height: 480, expiresAt: null, fetchedAt: instant };
const metrics: PlaceMetricsDto = {
  provenance: 'souvenir-activity', definitionVersion: 1, computedAt: instant, sampleStatus: 'ready', collectors: 7, editions: 8, saves: 1, discoveryFreq: 0.2,
  frequency: { status: 'ready', visitors90d: 2, cityVisitors90d: 10, city: 'Tokyo', country: 'JP', windowStart: instant, windowEnd: instant, minimumCohort: 5 },
  recommendRate: null, sentiment: { status: 'insufficient', recommend: 1, depends: 0, skip: 0, minimumSample: 5 },
  trendingScore: null, trend: { status: 'insufficient', collectors7d: 1, weeklyCollectors8w: [], collectors8wAvg: null, baselineStart: instant, baselineEnd: instant },
};
afterEach(restoreFixtureCatalog);
test('global places merge by canonical ID without LA metadata or uncredited hero fallback', () => {
  mergeCatalog([mapPlace(place)]);
  mergeCatalog([mapPlace({ ...place, name: 'Updated garden' })]);
  expect(places.filter(item => item.id === place.id)).toHaveLength(1);
  expect(places.find(item => item.id === place.id)).toMatchObject({ name: 'Updated garden', city: 'Tokyo', country: 'JP', timezone: 'Asia/Tokyo', fixtureId: undefined, heroImageUrl: undefined });
  for (const key of ['priceCents', 'durationMinutes', 'openHour', 'closeHour', 'discoveryCount', 'cohort'] as const) expect(Number.isNaN(mapPlace(place)[key])).toBe(true);
});
test('only attributed unexpired marked heroes become catalog imagery', () => {
  const expired = { ...image, expiresAt: '2000-01-01T00:00:00Z' };
  expect(availableImages([expired, { ...image, attribution: '' }, { ...image, sourcePageUrl: 'file:///private' }, { ...image, url: 'https://user:password@example.test/photo' }, image])).toEqual([image]);
  expect(mapPlace({ ...place, images: [image] }).heroImageUrl).toBe(image.url);
  expect(mapPlace({ ...place, images: [{ ...image, isHero: false }] }).heroImageUrl).toBeUndefined();
});
test('discovery frequency uses explicit cohort status and does not imply sentiment', () => {
  expect(frequencyLabel(metrics)).toBe('20% of city collectors');
  expect(frequencyLabel({ ...metrics, discoveryFreq: null, frequency: { ...metrics.frequency, status: 'insufficient' } })).toBe('Not enough collectors');
  expect(frequencyLabel({ ...metrics, frequency: { ...metrics.frequency, status: 'stale' } })).toContain('stale');
  expect(frequencyLabel(undefined)).toBe('Unavailable');
});
test.each([
  ['Asia/Tokyo', '2026-09-20T05:30'],
  ['Asia/Kathmandu', '2026-09-20T02:15'],
  ['Pacific/Chatham', '2026-09-20T09:15'],
  ['America/Los_Angeles', '2026-09-19T13:30'],
])('visit wall time round trips in %s rather than device or LA timezone', (timezone, wall) => {
  expect(localVisitInput(instant, timezone)).toBe(wall);
  expect(parseLocalVisit(wall, timezone)).toBe(instant);
});
test('DST gaps and invalid zones are rejected; canonical captures retain the confirmed timezone', () => {
  expect(parseLocalVisit('2026-03-29T02:30', 'Europe/Paris')).toBeUndefined();
  expect(parseLocalVisit('2026-09-19T13:30', 'Unknown/Place')).toBeUndefined();
  mergeCatalog([mapPlace(place)]);
  expect(captureToEdition({ id: 'visit', placeId: place.id, visitedAt: instant, timezone: 'Asia/Tokyo', moment: '', companions: [], status: 'reveal' }, instant).timezone).toBe('Asia/Tokyo');
});
test('ambiguous mutations retain the original normalized payload and request ID', () => {
  const draft = new MutationDraft();
  const input = { requestId: 'one', body: 'Original', visibility: 'private', tags: ['quiet'] };
  const original = draft.capture({ path: '/api/places/tokyo/notes', method: 'POST', input });
  input.body = 'Later edit'; input.tags.push('public');
  draft.reject(new ApiError('Connection lost', 0));
  expect(draft.capture({ path: '/another', method: 'DELETE', input: { requestId: 'two' } })).toEqual(original);
  expect(original.input).toEqual({ requestId: 'one', body: 'Original', visibility: 'private', tags: ['quiet'] });
  draft.reject(new ApiError('Validation failed', 422));
  expect(draft.capture({ path: '/corrected', method: 'POST' }).path).toBe('/corrected');
});
test('catalog cursor and accessible duplicate survive the API boundary; hidden conflicts reveal nothing', async () => {
  const token = async () => ({ data: { session: { user: { id: 'user' }, access_token: 'test' } }, error: null });
  const send = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
  const response = (status: number, payload: unknown) => ({ ok: status < 400, status, json: async () => payload }) as Response;
  const api = new AccountApi('https://example.test', { getSession: token, refreshSession: token }, 'user', new AccountScope().capture(), send);
  send.mockResolvedValueOnce(response(200, { data: [place], nextCursor: 'opaque-cursor' }));
  await expect(api.page('/api/places')).resolves.toEqual({ data: [place], nextCursor: 'opaque-cursor' });
  send.mockResolvedValueOnce(response(409, { error: 'duplicate_place', details: { existingPlace: place } }));
  const error = await api.request('/api/places', 'POST', {}).catch(error => error as unknown);
  expect(duplicatePlace(error)).toEqual(place);
  expect(duplicatePlace(new ApiError('Duplicate', 409, 'duplicate', {}))).toBeUndefined();
  expect(duplicatePlace(new ApiError('Duplicate', 409, 'duplicate', { existingPlace: { id: 'not-a-place' } }))).toBeUndefined();
  expect(send.mock.calls[0][1]).toMatchObject({ credentials: 'omit', headers: { Authorization: 'Bearer test' } });
});

import type { BootstrapDto, EditionDto, PlaceDto } from '../../../../shared/api-contract';
import type { AppState } from '@/domain/types';
import { captureToEdition } from '@/domain/capture';
import { emptyFilters, searchPlaces } from '@/domain/search';
import { places, restoreFixtureCatalog, sets } from '@/fixtures/catalog';
import { AccountApi, AccountScope } from '@/lib/api';
import { installBootstrapCatalog, mapBootstrap } from '@/lib/bootstrap';
import { validateConfig } from '@/lib/env';
import { accountKey, encodeLocal, restoreLocal } from '@/lib/local';
import { mutateAccount } from '@/lib/mutations';
import { uploadPhoto } from '@/lib/photos';

jest.mock('@/lib/photos', () => ({ uploadPhoto: jest.fn() }));
const userId = '1f413e17-58f5-4528-883b-0b2141c93a37';
const requestId = 'dc873269-f812-4fe4-a6e1-b50a87d3d288';
const placeId = '854562e1-364a-47fb-a12b-7e89744a5da6';
const instant = '2026-09-19T20:30:00.000Z';
const place: PlaceDto = { id: placeId, slug: 'the-broad', name: 'The Broad', category: 'culture', lat: 34, lng: -118, city: 'Los Angeles', description: 'Catalog description', heroImageUrl: null, rarityTier: 'common', rarityAppeal: 1, rarityDiscoveryFreq: 1, rarityAvailability: 1, externalIds: null, stats: null, createdAt: instant };
const edition: EditionDto = { id: '4b412065-8c52-4d9a-b1c4-8b92f4588555', userId, placeId, requestId, capturedAt: instant, timezone: 'America/Los_Angeles', note: 'A bright afternoon', companions: ['A real name'], variant: 'revisit', visitSequence: 12, origin: 'capture', importSourceId: null, outingId: null, photo: { path: `${userId}/${requestId}.jpg`, url: 'https://storage.test/signed?token=temporary', expiresAt: instant }, createdAt: instant };
function bootstrap(): BootstrapDto {
  return { user: { id: userId, handle: 'real_account', displayName: 'Account', avatarUrl: null, homeCity: 'LA', createdAt: instant }, places: [place], sets: [{ id: 'set-uuid', slug: 'canonical', name: 'A server set', description: '', coverImageUrl: null, city: 'LA', places: [place] }], collection: [], wishlists: [{ id: 'list-uuid', ownerId: userId, name: 'Want to go', isShared: false, isDefault: true, memberIds: [userId], entries: [] }], rankings: [], rankingGroups: [], placePreferences: [], plans: [] };
}
function account(): AppState {
  const data = bootstrap(); installBootstrapCatalog(data);
  return { ...mapBootstrap(data, userId), captureDraft: { id: requestId, placeId, visitedAt: instant, moment: 'A real visit', companions: ['Maya Lee'], photoUri: 'media:local.jpg', status: 'reveal' } };
}
function transport() {
  const send = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: {} }) } as Response);
  const tokens = { getSession: async () => ({ data: { session: { access_token: 'test', user: { id: userId } } }, error: null }), refreshSession: async () => ({ data: { session: null }, error: null }) };
  return { api: new AccountApi('https://app.test', tokens, userId, new AccountScope().capture(), send), send };
}
afterEach(() => { restoreFixtureCatalog(); jest.clearAllMocks(); });
test('canonical bootstrap never seeds own visits; preserves complete catalog and every category', () => {
  const data = bootstrap();
  data.places = Array.from({ length: 52 }, (_, index) => ({ ...place, id: `canonical-${index}`, slug: `place-${index}`, category: (['nature', 'culture', 'food', 'landmark', 'hidden_gem'] as const)[index % 5] }));
  installBootstrapCatalog(data);
  expect(places).toHaveLength(52);
  expect(new Set(places.map(item => item.category))).toEqual(new Set(['park', 'cultural', 'food', 'landmark', 'hidden_gem']));
  expect(sets[0].placeIds).toEqual([placeId]);
  const state = mapBootstrap(data, userId);
  expect(state.editions).toEqual([]);
  expect(state.wishlists[0]).toMatchObject({ id: 'list-uuid', memberIds: ['you'], isDefault: true });
  expect(state.mode).toBe('account');
});
test('unknown operational metadata cannot pass free-admission search', () => {
  const state = account();
  expect(places[0]).toMatchObject({ id: placeId, fixtureId: 'la-the-broad', canonical: true, sourceIds: [] });
  expect(Number.isNaN(places[0].priceCents)).toBe(true);
  expect(Number.isNaN(places[0].openHour)).toBe(true);
  expect(searchPlaces(places, { ...emptyFilters(), maxPriceCents: 0 }, { state })).toEqual([]);
});
test('bootstrap preserves server sequence, linked request and signed photo; rejects foreign ownership', () => {
  const data = bootstrap(); data.collection = [{ ...edition, place }];
  const local = account();
  expect(mapBootstrap(data, userId, local)).toMatchObject({ editions: [{ sequence: 12, ownerId: 'you', photoPath: edition.photo?.path }], captureDraft: { status: 'saved', editionId: edition.id } });
  expect(() => mapBootstrap(data, 'other-user')).toThrow('signed-in');
  data.collection[0].userId = 'other-user';
  expect(() => mapBootstrap(data, userId)).toThrow('another account');
});
test('account persistence stores drafts/preferences only, with no signed URLs or private server snapshot', () => {
  const data = bootstrap(); data.collection = [{ ...edition, place }];
  const state = mapBootstrap(data, userId, account());
  const encoded = encodeLocal(state);
  expect(encoded).not.toContain('token=temporary');
  expect(JSON.parse(encoded)).not.toHaveProperty('editions');
  expect(restoreLocal(encoded).captureDraft?.id).toBe(requestId);
  expect(restoreLocal(encoded).editions).toEqual([]);
  expect(accountKey(userId)).not.toBe(accountKey('another-user'));
  expect(() => restoreLocal('{"version":1,"captureDraft":{"id":"bad"}}')).toThrow('draft');
});
test('capture keeps real companion names and canonical identifiers', () => {
  const state = account();
  expect(captureToEdition(state.captureDraft!, instant)).toMatchObject({ placeId, requestId, companions: ['Maya Lee'] });
});
test('upload precedes create, and ambiguous create retries reuse a durable immutable payload', async () => {
  let state = account();
  const { api, send } = transport();
  jest.mocked(uploadPhoto).mockResolvedValue(`${userId}/${requestId}.jpg`);
  send.mockRejectedValueOnce(new Error('connection lost after commit'));
  const persist = jest.fn(async input => { state = { ...state, captureDraft: { ...state.captureDraft!, submittedEdition: input } }; });
  const action = { type: 'ADD_EDITION' as const, edition: captureToEdition(state.captureDraft!, instant) };
  await expect(mutateAccount(api, state, action, persist)).rejects.toThrow('draft is preserved');
  expect(persist).toHaveBeenCalledTimes(2);
  expect(uploadPhoto).toHaveBeenCalledTimes(1);
  expect(state.captureDraft?.submittedEdition).toMatchObject({ requestId, photoPath: `${userId}/${requestId}.jpg` });
  state = restoreLocal(encodeLocal(state));
  await mutateAccount(api, state, { ...action, edition: { ...action.edition, moment: 'Do not change a retried payload' } }, persist);
  expect(send.mock.calls[0][1]?.body).toBe(send.mock.calls[1][1]?.body);
  expect(send.mock.calls[0][1]?.body).not.toContain('media:');
  expect(send.mock.calls[0][1]?.body).not.toContain('ownerId');
  expect(uploadPhoto).toHaveBeenCalledTimes(1);
});
test('upload failure freezes the draft before networking and never creates an edition', async () => {
  const state = account(); const { api, send } = transport();
  jest.mocked(uploadPhoto).mockRejectedValue(new Error('upload unavailable'));
  const persist = jest.fn(async () => undefined);
  await expect(mutateAccount(api, state, { type: 'ADD_EDITION', edition: captureToEdition(state.captureDraft!, instant) }, persist)).rejects.toThrow('upload unavailable');
  expect(persist).toHaveBeenCalledTimes(1);
  expect(send).not.toHaveBeenCalled();
});
test('fixture imports and simulated friend editions cannot write account records', async () => {
  const state = account(); const { api, send } = transport();
  const input = captureToEdition(state.captureDraft!, instant);
  for (const edition of [{ ...input, ownerId: 'maya' }, { ...input, origin: 'import' as const }]) {
    await expect(mutateAccount(api, state, { type: 'ADD_EDITION', edition }, async () => undefined)).rejects.toThrow();
  }
  await expect(mutateAccount(api, state, { type: 'CLOCK', clock: instant }, async () => undefined)).rejects.toThrow('demo mode');
  expect(send).not.toHaveBeenCalled();
});
test('save operations send canonical list ID and explicit member values', async () => {
  const state = account(); const { api, send } = transport();
  await mutateAccount(api, state, { type: 'SAVE_PLACE', placeId, wishlistId: 'personal' }, async () => undefined);
  expect(send.mock.calls[0][0]).toBe('https://app.test/api/wishlists/list-uuid/items');
  expect(JSON.parse(String(send.mock.calls[0][1]?.body))).toEqual({ placeId, saved: true, completed: false });
  await expect(mutateAccount(api, state, { type: 'SAVE_PLACE', placeId, wishlistId: 'personal', userId: 'maya' }, async () => undefined)).rejects.toThrow('Only your own');
});
test('configuration rejects secret/service-role style keys and credential-bearing origins', () => {
  const config = { supabaseUrl: 'https://project.supabase.co/', apiUrl: 'https://app.test/', publishableKey: 'sb_publishable_test' };
  expect(validateConfig(config).apiUrl).toBe('https://app.test');
  for (const publishableKey of ['sb_secret_server', 'service-role', 'eyJwt']) expect(() => validateConfig({ ...config, publishableKey })).toThrow('publishable key');
  expect(() => validateConfig({ ...config, apiUrl: 'https://user:password@app.test' })).toThrow('credentials');
  expect(() => validateConfig({})).toThrow('EXPO_PUBLIC_API_URL');
});

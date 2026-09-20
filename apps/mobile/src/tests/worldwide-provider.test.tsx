/** @jest-environment jsdom */
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import type { BootstrapDto, PlaceDto } from '../../../../shared/api-contract';
import { AppProvider, useApp } from '@/state/AppProvider';
import { places } from '@/fixtures/catalog';

jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('@/lib/env', () => ({ getConfig: () => ({ apiUrl: 'https://app.test' }) }));
jest.mock('@/lib/supabase', () => ({ getSupabase: () => ({ auth: mockAuth }) }));
jest.mock('expo-linking', () => ({ getInitialURL: async () => null, addEventListener: () => ({ remove: jest.fn() }) }));
const alice = '1f413e17-58f5-4528-883b-0b2141c93a37';
const bob = '153e9a36-7672-4905-ade6-a4f830ef4147';
const instant = '2026-09-19T00:00:00Z';
let mockSession: Session;
let mockEvent: (event: AuthChangeEvent, session: Session | null) => void;
const mockAuth = {
  getSession: async () => ({ data: { session: mockSession }, error: null }),
  refreshSession: async () => ({ data: { session: mockSession }, error: null }),
  onAuthStateChange: (callback: typeof mockEvent) => { mockEvent = callback; return { data: { subscription: { unsubscribe: jest.fn() } } }; },
  startAutoRefresh: jest.fn(), stopAutoRefresh: jest.fn(),
};
function session(id: string): Session { return { access_token: id, refresh_token: 'test', token_type: 'bearer', expires_in: 3600, user: { id, app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: instant } }; }
const response = (data: unknown): Response => ({ ok: true, status: 200, json: async () => ({ data }) }) as Response;
function bootstrap(id: string): BootstrapDto { return { user: { id, handle: id, displayName: id, homeCity: null, avatarUrl: null, createdAt: instant }, places: [], sets: [], collection: [], wishlists: [], plans: [], rankings: [], rankingGroups: [], placePreferences: [] }; }
const place: PlaceDto = { id: '854562e1-364a-47fb-a12b-7e89744a5da6', slug: 'global', name: 'Global destination', category: 'culture', lat: 1, lng: 2, city: null, description: '', heroImageUrl: null, rarityTier: 'common', rarityAppeal: 1, rarityDiscoveryFreq: 1, rarityAvailability: 1, externalIds: null, stats: null, createdAt: instant };
let current: ReturnType<typeof useApp>;
function Observe() { const store = useApp(); useEffect(() => { current = store; }, [store]); return null; }
let root: Root;
let fetcher: jest.MockedFunction<typeof fetch>;
beforeEach(async () => {
  await AsyncStorage.clear(); mockSession = session(alice);
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true });
  root = createRoot(document.createElement('div'));
  fetcher = jest.fn(async (url, init) => response(String(url).endsWith('/api/bootstrap') ? bootstrap((init?.headers as { Authorization: string }).Authorization.slice(7)) : { saved: true }));
  global.fetch = fetcher;
  await act(async () => root.render(<AppProvider><Observe /></AppProvider>));
});
afterEach(async () => { await act(async () => root.unmount()); });
test('worldwide writes are serialized with bootstrap reloads and no client ownership field', async () => {
  fetcher.mockClear();
  const revision = current.accountRevision;
  await act(async () => {
    await Promise.all([
      current.accountWrite('/api/places/global/notes', 'POST', { requestId: 'first', body: 'Note', visibility: 'private' }),
      current.accountWrite('/api/places/global/tags', 'PUT', { tags: ['quiet'], visibility: 'private' }),
    ]);
  });
  expect(fetcher.mock.calls.map(([url]) => String(url).replace('https://app.test', ''))).toEqual(['/api/places/global/notes', '/api/bootstrap', '/api/places/global/tags', '/api/bootstrap']);
  expect(current.accountRevision).toBe(revision + 2);
  expect(fetcher.mock.calls[0][1]?.body).not.toContain('userId');
});
test('account switch prevents late catalog merges, API calls and queued writes from the former account', async () => {
  const old = current;
  await act(async () => current.mergePlaces([place]));
  expect(places.map(item => item.id)).toContain(place.id);
  await act(async () => { mockSession = session(bob); mockEvent('SIGNED_IN', mockSession); });
  expect(current.userId).toBe(bob);
  expect(places).toEqual([]);
  expect(() => old.mergePlaces([place])).toThrow('account changed');
  await expect(old.accountRequest('/api/friends')).rejects.toMatchObject({ code: 'account_changed' });
  await expect(old.accountWrite('/api/places', 'POST', { name: 'Late' })).rejects.toMatchObject({ code: 'account_changed' });
  expect(places).toEqual([]);
});

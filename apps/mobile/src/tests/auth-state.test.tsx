/** @jest-environment jsdom */
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import type { BootstrapDto } from '../../../../shared/api-contract';
import { AppProvider, useApp } from '@/state/AppProvider';
import { accountKey, encodeLocal } from '@/lib/local';
import { emptyAccount } from '@/lib/bootstrap';

jest.mock('@react-native-async-storage/async-storage', () => jest.requireActual('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('@/lib/env', () => ({ getConfig: () => ({ apiUrl: 'https://app.test' }) }));
jest.mock('@/lib/supabase', () => ({ getSupabase: () => ({ auth: mockAuth }) }));
jest.mock('expo-linking', () => ({
  createURL: (path: string) => `souvenir://${path.replace(/^\//, '')}`,
  getInitialURL: async () => mockInitialUrl,
  addEventListener: (_event: string, handler: (event: { url: string }) => void) => {
    mockLinkHandler = handler;
    return { remove: jest.fn() };
  },
}));

let mockInitialUrl: string | null = null;
let mockLinkHandler: (event: { url: string }) => void = () => {};

const alice = '1f413e17-58f5-4528-883b-0b2141c93a37';
const bob = '153e9a36-7672-4905-ade6-a4f830ef4147';
let mockSession: Session | null = null;
let mockEvent: (event: AuthChangeEvent, session: Session | null) => void;
const mockAuth = {
  getSession: jest.fn(async () => ({ data: { session: mockSession }, error: null })),
  refreshSession: jest.fn(async () => ({ data: { session: mockSession }, error: null })),
  onAuthStateChange: jest.fn((callback: typeof mockEvent) => { mockEvent = callback; return { data: { subscription: { unsubscribe: jest.fn() } } }; }),
  startAutoRefresh: jest.fn(), stopAutoRefresh: jest.fn(),
  signUp: jest.fn(async () => ({ data: { session: null }, error: null })),
  exchangeCodeForSession: jest.fn(async () => ({ data: { session: mockSession }, error: null })),
  signInWithPassword: jest.fn(async () => ({ data: { session: mockSession }, error: null })),
  signOut: jest.fn(async () => { mockSession = null; mockEvent('SIGNED_OUT', null); return { error: null }; }),
};
function session(id: string): Session {
  return { access_token: id, refresh_token: 'test-refresh', token_type: 'bearer', expires_in: 3600, user: { id, app_metadata: {}, user_metadata: {}, aud: 'authenticated', created_at: '2026-09-19T00:00:00Z' } };
}
function response(id: string): Response {
  const data: BootstrapDto = { user: { id, handle: id, displayName: id, homeCity: null, avatarUrl: null, createdAt: '2026-09-19T00:00:00Z' }, places: [], sets: [], collection: [], wishlists: [], plans: [], rankings: [], rankingGroups: [], placePreferences: [] };
  return { ok: true, status: 200, json: async () => ({ data }) } as Response;
}
let current: ReturnType<typeof useApp>;
function Observe() { const value = useApp(); useEffect(() => { current = value; }, [value]); return null; }
let root: Root;
let fetcher: jest.MockedFunction<typeof fetch>;
async function mount() { await act(async () => root.render(<AppProvider><Observe /></AppProvider>)); }
beforeEach(async () => {
  jest.clearAllMocks();
  mockSession = null;
  mockInitialUrl = null;
  await AsyncStorage.clear();
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { value: true, configurable: true });
  root = createRoot(document.createElement('div'));
  fetcher = jest.fn(async (_url, init) => response((init?.headers as { Authorization: string }).Authorization.slice(7)));
  global.fetch = fetcher;
});
afterEach(async () => { await act(async () => root.unmount()); });

test('signup requiring confirmation stays signed out and makes no bootstrap request', async () => {
  await mount();
  let signedIn = true;
  await act(async () => { signedIn = await current.signUp('person@example.test', 'test-only-password'); });
  expect(signedIn).toBe(false);
  expect(current.mode).toBe('signedOut');
  expect(current.state.editions).toEqual([]);
  expect(fetcher).not.toHaveBeenCalled();
});
test('signup asks Supabase to return the confirmation link to this app', async () => {
  await mount();
  await act(async () => { await current.signUp('person@example.test', 'test-only-password'); });
  expect(mockAuth.signUp).toHaveBeenCalledWith(expect.objectContaining({
    options: { emailRedirectTo: 'souvenir://auth/confirm' },
  }));
});
test('opening the confirmation deep link signs the account in', async () => {
  await mount();
  expect(current.mode).toBe('signedOut');
  mockSession = session(alice);
  await act(async () => { mockLinkHandler({ url: 'souvenir://auth/confirm?code=confirmation-code' }); });
  expect(mockAuth.exchangeCodeForSession).toHaveBeenCalledWith('confirmation-code');
  expect(current.mode).toBe('account');
  expect(current.userId).toBe(alice);
});
test('a rejected confirmation link reports the reason and stays signed out', async () => {
  await mount();
  await act(async () => { mockLinkHandler({ url: 'souvenir://auth/confirm?error=access_denied&error_description=Email+link+is+invalid+or+has+expired' }); });
  expect(mockAuth.exchangeCodeForSession).not.toHaveBeenCalled();
  expect(current.mode).toBe('signedOut');
  expect(current.error).toBe('Email link is invalid or has expired');
});
test('account switch clears old drafts and rejects callbacks captured by the former account', async () => {
  const stateA = emptyAccount();
  stateA.captureDraft = { id: 'draft-a', moment: 'Private Alice draft', companions: [], visitedAt: '2026-09-19T00:00:00Z', status: 'confirm' };
  const stateB = emptyAccount();
  stateB.preferences.bio = 'Bob local preferences';
  await AsyncStorage.setItem(accountKey(alice), encodeLocal(stateA));
  await AsyncStorage.setItem(accountKey(bob), encodeLocal(stateB));
  mockSession = session(alice);
  await mount();
  expect(current.state.captureDraft?.moment).toBe('Private Alice draft');
  const oldCommit = current.commit;
  await act(async () => { mockSession = session(bob); mockEvent('SIGNED_IN', mockSession); });
  expect(current.userId).toBe(bob);
  expect(current.state.captureDraft).toBeNull();
  expect(current.state.preferences.bio).toBe('Bob local preferences');
  await expect(oldCommit({ type: 'PREFERENCES', patch: { bio: 'Old component write' } })).rejects.toMatchObject({ code: 'account_changed' });
  expect(current.state.preferences.bio).toBe('Bob local preferences');
  expect((await AsyncStorage.getItem(accountKey(bob)))!).not.toContain('Alice');
});
test('an uncancellable bootstrap from the previous account cannot overwrite the new account', async () => {
  let finish: (value: Response) => void = () => { throw new Error('No pending request'); };
  fetcher.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  mockSession = session(alice);
  await mount();
  expect(current.mode).toBe('account');
  expect(current.ready).toBe(false);
  await act(async () => { mockSession = session(bob); mockEvent('SIGNED_IN', mockSession); });
  expect(current.ready).toBe(true);
  expect(current.state.preferences.name).toBe(bob);
  await act(async () => finish(response(alice)));
  expect(current.userId).toBe(bob);
  expect(current.state.preferences.name).toBe(bob);
});
test('sign-out immediately removes private memory and invalidates account writes', async () => {
  mockSession = session(alice);
  await mount();
  const oldCommit = current.commit;
  await act(async () => current.signOut());
  expect(current.mode).toBe('signedOut');
  expect(current.userId).toBeUndefined();
  expect(current.ready).toBe(false);
  expect(current.state.editions).toEqual([]);
  await expect(oldCommit({ type: 'TIP', placeId: 'private-place', text: 'Late write' })).rejects.toMatchObject({ code: 'account_changed' });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
test('fixture demo writes remain local and do not call authenticated APIs', async () => {
  await mount();
  await act(async () => current.startDemo('sample'));
  expect(current.mode).toBe('demo');
  expect(current.state.editions.length).toBeGreaterThan(0);
  await act(async () => { await current.commit({ type: 'PREFERENCES', patch: { bio: 'Demo profile' } }); });
  expect(current.state.preferences.bio).toBe('Demo profile');
  expect(fetcher).not.toHaveBeenCalled();
});
test('late initial SDK restoration cannot replace a newer sign-in event', async () => {
  let finish: (value: { data: { session: Session }; error: null }) => void = () => { throw new Error('No pending SDK restoration'); };
  mockAuth.getSession.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  await mount();
  await act(async () => { mockSession = session(bob); mockEvent('SIGNED_IN', mockSession); });
  expect(current.userId).toBe(bob);
  await act(async () => finish({ data: { session: session(alice) }, error: null }));
  expect(current.userId).toBe(bob);
  expect(current.state.preferences.name).toBe(bob);
});
test('a failed account write rejects without optimistic state or fake success', async () => {
  mockSession = session(alice);
  await mount();
  fetcher.mockRejectedValueOnce(new TypeError('offline'));
  await act(async () => {
    await expect(current.commit({ type: 'TIP', placeId: 'place', text: 'Private tip' })).rejects.toThrow('Check your connection');
  });
  expect(current.state.tips).toEqual({});
  expect(current.error).toContain('Check your connection');
});
test.each(['request', 'page', 'write', 'photo', 'refresh'])('terminal authorization failure clears private state through %s', async operation => {
  const stateA = emptyAccount();
  stateA.captureDraft = { id: 'draft-a', moment: 'Private Alice draft', companions: [], visitedAt: '2026-09-19T00:00:00Z', status: 'confirm' };
  await AsyncStorage.setItem(accountKey(alice), encodeLocal(stateA));
  mockSession = session(alice);
  await mount();
  expect(current.state.captureDraft?.moment).toBe('Private Alice draft');
  const oldCommit = current.commit;
  fetcher.mockResolvedValue({ ok: false, status: 401, json: async () => ({ error: 'unauthorized' }) } as Response);
  await act(async () => {
    const request = operation === 'page' ? current.accountPage('/api/feed')
      : operation === 'write' ? current.accountWrite('/api/places/global/tags', 'PUT', { tags: [] })
      : operation === 'photo' ? current.signedPhoto('edition-a')
      : operation === 'refresh' ? current.refresh()
      : current.accountRequest('/api/me/stats');
    await expect(request).rejects.toThrow();
  });
  expect(mockAuth.refreshSession).toHaveBeenCalledTimes(1);
  expect(current.mode).toBe('signedOut');
  expect(current.userId).toBeUndefined();
  expect(current.ready).toBe(false);
  expect(current.state.captureDraft).toBeNull();
  expect(current.state.preferences.name).toBe('');
  expect(current.error).toContain('session expired');
  await expect(oldCommit({ type: 'TIP', placeId: 'private-place', text: 'Late write' })).rejects.toMatchObject({ code: 'account_changed' });
});
test('missing SDK session clears cached private data without waiting for an auth event', async () => {
  mockSession = session(alice);
  await mount();
  mockSession = null;
  await act(async () => {
    await expect(current.accountRequest('/api/me')).rejects.toMatchObject({ status: 401 });
  });
  expect(current.mode).toBe('signedOut');
  expect(current.userId).toBeUndefined();
  expect(current.state.preferences.name).toBe('');
});
test('recoverable authorization and network errors keep the active account', async () => {
  mockSession = session(alice);
  await mount();
  fetcher.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ error: 'unauthorized' }) } as Response);
  await act(async () => { await current.accountRequest('/api/me'); });
  expect(current.mode).toBe('account');
  expect(current.userId).toBe(alice);
  fetcher.mockRejectedValueOnce(new TypeError('offline'));
  await act(async () => {
    await expect(current.accountRequest('/api/me')).rejects.toThrow('Check your connection');
  });
  expect(current.mode).toBe('account');
  expect(current.state.preferences.name).toBe(alice);
});
test('a late unauthorized response from a previous account cannot sign out the new account', async () => {
  mockSession = session(alice);
  await mount();
  let finish: (value: Response) => void = () => { throw new Error('No pending request'); };
  fetcher.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const request = current.accountRequest('/api/me');
  const rejected = expect(request).rejects.toMatchObject({ code: 'account_changed' });
  await Promise.resolve();
  await act(async () => { mockSession = session(bob); mockEvent('SIGNED_IN', mockSession); });
  await act(async () => {
    finish({ ok: false, status: 401, json: async () => ({ error: 'unauthorized' }) } as Response);
    await rejected;
  });
  expect(current.mode).toBe('account');
  expect(current.userId).toBe(bob);
  expect(current.state.preferences.name).toBe(bob);
  expect(current.error).toBeNull();
});

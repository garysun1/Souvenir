import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import * as Linking from 'expo-linking';
import { AppState as NativeAppState } from 'react-native';
import type { BootstrapDto, SignedPhotoDto, PlaceDto } from '../../../../shared/api-contract';
import type { Action, AppState } from '@/domain/types';
import { installCatalog, mergeCatalog, restoreFixtureCatalog } from '@/fixtures/catalog';
import { AccountApi, AccountScope } from '@/lib/api';
import { confirmationRedirect, parseAuthCallback } from '@/lib/authLink';
import { emptyAccount, installBootstrapCatalog, mapBootstrap, mapPlace } from '@/lib/bootstrap';
import { getConfig } from '@/lib/env';
import { accountKey, encodeLocal, restoreLocal } from '@/lib/local';
import { mutateAccount } from '@/lib/mutations';
import { getSupabase } from '@/lib/supabase';
import { reducer } from './reducer';
import { createSeed } from './seed';
import { migrateStoredState } from './migrations';

export const STORAGE_KEY = 'souvenir-state-v1';
const MODE_KEY = 'souvenir-mode-v1';
type Mode = 'signedOut' | 'demo' | 'account';
interface Store {
  state: AppState; commit: (action: Action) => Promise<AppState>; error: string | null; clearError: () => void; ready: boolean;
  mode: Mode; userId?: string; authReady: boolean; refreshing: boolean; refresh: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>; startDemo: (mode: 'sample' | 'empty') => Promise<void>;
  signedPhoto: (editionId: string) => Promise<SignedPhotoDto>;
  accountRequest: <T>(path: string, method?: string, input?: unknown) => Promise<T>;
  accountWrite: <T>(path: string, method: string, input?: unknown) => Promise<T>;
  accountPage: <T>(path: string) => Promise<{ data: T; nextCursor?: string | null }>;
  mergePlaces: (places: PlaceDto[]) => void;
  accountRevision: number;
}
const Context = createContext<Store | null>(null);
export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(emptyAccount);
  const reference = useRef(state);
  const [mode, setMode] = useState<Mode>('signedOut');
  const modeRef = useRef<Mode>('signedOut');
  const [userId, setUserId] = useState<string>();
  const currentUser = useRef<string | undefined>(undefined);
  const [scope] = useState(() => new AccountScope());
  const [sessionScope, setSessionScope] = useState(() => scope.capture());
  const api = useRef<AccountApi | undefined>(undefined);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const [ready, setReady] = useState(false);
  const [authReady, setAuthReady] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accountRevision, setAccountRevision] = useState(0);
  const publish = useCallback((next: AppState) => { reference.current = next; setState(next); }, []);
  const clearPrivate = useCallback(() => {
    scope.change(); setSessionScope(scope.capture()); api.current = undefined; currentUser.current = undefined; setUserId(undefined);
    modeRef.current = 'signedOut'; setMode('signedOut'); publish(emptyAccount()); installCatalog([], [], []);
    queue.current = Promise.resolve(); setReady(false); setRefreshing(false);
  }, [publish, scope]);
  const load = useCallback(async (client: AccountApi) => {
    const data = await client.request<BootstrapDto>('/api/bootstrap');
    client.assertCurrent();
    const next = mapBootstrap(data, client.userId, reference.current);
    installBootstrapCatalog(data); publish(next); setAccountRevision(value => value + 1); setReady(true); setError(null);
    await AsyncStorage.setItem(accountKey(client.userId), encodeLocal(next));
    client.assertCurrent();
  }, [publish]);
  const refresh = useCallback((): Promise<void> => {
    const client = api.current;
    if (!client) return Promise.resolve();
    const operation = queue.current.catch(() => undefined).then(async () => {
      client.assertCurrent(); setRefreshing(true);
      try { await load(client); } catch (reason) {
        client.assertCurrent(); setError(reason instanceof Error ? reason.message : 'Refresh failed. Please retry.'); throw reason;
      } finally { if (api.current === client) setRefreshing(false); }
    });
    queue.current = operation.catch(() => undefined);
    return operation;
  }, [load]);
  const activate = useCallback(async (session: Session | null) => {
    const id = session?.user.id;
    if (id && id === currentUser.current) return;
    if (!id && modeRef.current === 'demo') return;
    clearPrivate();
    if (!id) { setAuthReady(true); return; }
    currentUser.current = id; setUserId(id); modeRef.current = 'account'; setMode('account'); setAuthReady(true);
    const client = new AccountApi(getConfig().apiUrl, getSupabase().auth, id, scope.capture(), undefined, reason => {
      clearPrivate(); setError(reason.message);
    });
    api.current = client;
    const operation = (async () => {
      try {
        const raw = await AsyncStorage.getItem(accountKey(id));
        client.assertCurrent();
        try { publish(restoreLocal(raw)); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Local draft unavailable.'); }
        await load(client);
      } catch (reason) {
        if (api.current === client) setError(reason instanceof Error ? reason.message : 'Account loading failed. Retry or sign in again.');
      }
    })();
    queue.current = operation;
    await operation;
  }, [clearPrivate, load, publish, scope]);
  useEffect(() => {
    let alive = true;
    let authEvents = 0;
    let unsubscribe: (() => void) | undefined;
    const restoreDemo = async () => {
      const savedMode = await AsyncStorage.getItem(MODE_KEY);
      if (!alive || authEvents || currentUser.current) return;
      if (savedMode === 'demo') {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!alive || authEvents || currentUser.current) return;
        const restored = raw ? migrateStoredState(JSON.parse(raw)) : null;
        if (restored) { setSessionScope(scope.capture()); restoreFixtureCatalog(); modeRef.current = 'demo'; setMode('demo'); publish(restored); setReady(true); }
      }
    };
    try {
      const supabase = getSupabase();
      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        if (_event !== 'INITIAL_SESSION') authEvents++;
        if (alive) void activate(session);
      });
      unsubscribe = () => data.subscription.unsubscribe();
      void supabase.auth.getSession().then(async ({ data, error: authError }) => {
        if (!alive || authEvents) return;
        if (authError) throw authError;
        if (data.session) return activate(data.session);
        await restoreDemo();
        setAuthReady(true);
      }).catch(reason => { if (alive) { setError(reason instanceof Error ? reason.message : 'Session restore failed.'); setAuthReady(true); } });
      if (NativeAppState.currentState === 'active') supabase.auth.startAutoRefresh();
    } catch (reason) {
      void restoreDemo().catch(() => undefined).then(() => {
        if (alive) { setError(reason instanceof Error ? reason.message : 'Account configuration is unavailable.'); setAuthReady(true); }
      });
    }
    const subscription = NativeAppState.addEventListener('change', status => {
      try { if (status === 'active') { getSupabase().auth.startAutoRefresh(); void refresh().catch(() => undefined); } else getSupabase().auth.stopAutoRefresh(); } catch { /* Configuration is reported by the account screen. */ }
    });
    return () => { alive = false; unsubscribe?.(); subscription.remove(); scope.change(); };
  }, [activate, publish, refresh, scope]);
  const completeAuthLink = useCallback(async (url: string) => {
    const callback = parseAuthCallback(url);
    if (!callback) return;
    if (callback.error) { setError(callback.error); return; }
    try {
      const auth = getSupabase().auth;
      const { data, error: linkError } = callback.code
        ? await auth.exchangeCodeForSession(callback.code)
        : await auth.setSession({ access_token: callback.accessToken ?? '', refresh_token: callback.refreshToken ?? '' });
      if (linkError) throw linkError;
      await AsyncStorage.removeItem(MODE_KEY);
      await activate(data.session);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'This confirmation link could not be completed. Sign in with your password.');
    }
  }, [activate]);
  useEffect(() => {
    let alive = true;
    void Linking.getInitialURL().then(url => { if (alive && url) void completeAuthLink(url); }).catch(() => undefined);
    const link = Linking.addEventListener('url', ({ url }) => { if (alive) void completeAuthLink(url); });
    return () => { alive = false; link.remove(); };
  }, [completeAuthLink]);
  const commit = useCallback((action: Action): Promise<AppState> => {
    const captured = sessionScope;
    const client = api.current;
    const operation = queue.current.catch(() => undefined).then(async () => {
      captured.assertCurrent();
      if (modeRef.current === 'demo') {
        const next = reducer(reference.current, action);
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        captured.assertCurrent(); publish(next); setError(null); return next;
      }
      if (!client || modeRef.current !== 'account') throw new Error('Sign in before saving to your account.');
      if (action.type === 'DRAFT') {
        if (reference.current.captureDraft?.submittedEdition && action.draft?.id === reference.current.captureDraft.id &&
          (action.draft.moment !== reference.current.captureDraft.moment || action.draft.placeId !== reference.current.captureDraft.placeId || action.draft.photoUri !== reference.current.captureDraft.photoUri || action.draft.visitedAt !== reference.current.captureDraft.visitedAt || action.draft.timezone !== reference.current.captureDraft.timezone || action.draft.visibility !== reference.current.captureDraft.visibility || action.draft.outingId !== reference.current.captureDraft.outingId || JSON.stringify(action.draft.companions) !== JSON.stringify(reference.current.captureDraft.companions))) {
          throw new Error('This capture has already been submitted. Retry saving it before editing the saved edition.');
        }
      } else {
        await mutateAccount(client, reference.current, action, async submittedEdition => {
          client.assertCurrent();
          const draft = reference.current.captureDraft;
          if (!draft) throw new Error('Your capture draft is no longer available.');
          const next = { ...reference.current, captureDraft: { ...draft, submittedEdition } };
          await AsyncStorage.setItem(accountKey(client.userId), encodeLocal(next));
          client.assertCurrent(); publish(next);
        });
      }
      client.assertCurrent();
      if (action.type === 'DRAFT' || action.type === 'PREFERENCES') {
        const next = reducer(reference.current, action);
        await AsyncStorage.setItem(accountKey(client.userId), encodeLocal(next));
        client.assertCurrent(); publish(next); setError(null);
      }
      if (action.type !== 'DRAFT') await load(client);
      return reference.current;
    });
    queue.current = operation.catch(reason => {
      try { captured.assertCurrent(); setError(reason instanceof Error ? reason.message : 'Your changes could not be saved. Retry.'); } catch { /* A previous account cannot publish errors. */ }
    });
    return operation;
  }, [load, publish, sessionScope]);
  const signIn = useCallback(async (email: string, password: string) => {
    const { data, error } = await getSupabase().auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
    await AsyncStorage.removeItem(MODE_KEY);
    await activate(data.session);
  }, [activate]);
  const signUp = useCallback(async (email: string, password: string) => {
    const { data, error } = await getSupabase().auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: confirmationRedirect() } });
    if (error) throw error;
    if (data.session) { await AsyncStorage.removeItem(MODE_KEY); await activate(data.session); }
    return !!data.session;
  }, [activate]);
  const signOut = useCallback(async () => {
    const wasDemo = modeRef.current === 'demo';
    clearPrivate(); setError(null);
    await AsyncStorage.removeItem(MODE_KEY);
    if (wasDemo) return;
    try { const { error } = await getSupabase().auth.signOut({ scope: 'local' }); if (error) throw error; }
    catch (reason) { setError('Sign-out could not be confirmed. Retry while connected before sharing this device.'); throw reason; }
  }, [clearPrivate]);
  const startDemo = useCallback(async (demoMode: 'sample' | 'empty') => {
    if (currentUser.current) throw new Error('Sign out before starting demo mode.');
    clearPrivate();
    const captured = scope.capture();
    const next = createSeed(demoMode);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    captured.assertCurrent();
    await AsyncStorage.setItem(MODE_KEY, 'demo');
    captured.assertCurrent();
    restoreFixtureCatalog(); publish(next); modeRef.current = 'demo'; setMode('demo'); setReady(true); setError(null);
  }, [clearPrivate, publish, scope]);
  const signedPhoto = useCallback(async (editionId: string) => {
    sessionScope.assertCurrent();
    const client = api.current;
    if (!client) throw new Error('Sign in to view this private photo.');
    return client.request<SignedPhotoDto>(`/api/editions/${editionId}/photo`);
  }, [sessionScope]);
  const accountRequest = useCallback(async <T,>(path: string, method = 'GET', input?: unknown): Promise<T> => {
    sessionScope.assertCurrent();
    const client = api.current;
    if (!client) throw new Error('Sign in to continue.');
    return client.request<T>(path, method, input);
  }, [sessionScope]);
  const accountPage = useCallback(async <T,>(path: string) => {
    sessionScope.assertCurrent();
    const client = api.current;
    if (!client) throw new Error('Sign in to continue.');
    return client.page<T>(path);
  }, [sessionScope]);
  const accountWrite = useCallback(<T,>(path: string, method: string, input?: unknown): Promise<T> => {
    const client = api.current;
    const operation = queue.current.catch(() => undefined).then(async () => {
      sessionScope.assertCurrent();
      if (!client) throw new Error('Sign in to continue.');
      const result = await client.request<T>(path, method, input);
      await load(client);
      client.assertCurrent();
      return result;
    });
    queue.current = operation.catch(() => undefined);
    return operation;
  }, [load, sessionScope]);
  const mergePlaces = useCallback((incoming: PlaceDto[]) => {
    sessionScope.assertCurrent();
    if (!api.current) throw new Error('Sign in to continue.');
    mergeCatalog(incoming.map(mapPlace));
    publish({ ...reference.current });
  }, [publish, sessionScope]);
  return <Context.Provider value={{ state, commit, error, clearError: () => setError(null), ready, authReady, mode, userId, refreshing, refresh, signIn, signUp, signOut, startDemo, signedPhoto, accountRequest, accountWrite, accountPage, mergePlaces, accountRevision }}>{children}</Context.Provider>;
}
export function useApp() {
  const store = useContext(Context);
  if (!store) throw new Error('useApp must be used within AppProvider');
  return store;
}

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, View } from 'react-native';
import type { Action, AppState } from '@/domain/types';
import { colors } from '@/design/tokens';
import { reducer } from './reducer';
import { createSeed } from './seed';
import { migrateStoredState } from './migrations';

export const STORAGE_KEY = 'souvenir-state-v1';
interface Store { state: AppState; commit: (action: Action) => Promise<AppState>; error: string | null; clearError: () => void; ready: boolean }
const Context = createContext<Store | null>(null);
export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(() => createSeed());
  const reference = useRef(state);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(STORAGE_KEY).then(async raw => {
      if (!mounted || !raw) return;
      const parsed: unknown = JSON.parse(raw);
      const value = migrateStoredState(parsed);
      if (!value) throw new Error('Stored demo data could not be read. Reset it in Settings.');
      reference.current = value;
      setState(value);
      if (typeof parsed === 'object' && parsed !== null && 'version' in parsed && parsed.version !== value.version) await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    }).catch(() => { if (mounted) setError('Could not restore local data. You can reset the demo in Settings.'); })
      .finally(() => { if (mounted) setReady(true); });
    return () => { mounted = false; };
  }, []);
  const commit = useCallback((action: Action): Promise<AppState> => {
    const operation = queue.current.catch(() => undefined).then(async () => {
      const next = reducer(reference.current, action);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      reference.current = next;
      setState(next);
      setError(null);
      return next;
    });
    queue.current = operation.catch(() => setError('Your changes could not be saved. Please try again.'));
    return operation;
  }, []);
  if (!ready) return <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.background }}><ActivityIndicator color={colors.brand} accessibilityLabel="Restoring your souvenirs" /></View>;
  return <Context.Provider value={{ state, commit, error, clearError: () => setError(null), ready }}>{children}</Context.Provider>;
}
export function useApp() {
  const store = useContext(Context);
  if (!store) throw new Error('useApp must be used within AppProvider');
  return store;
}

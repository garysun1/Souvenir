import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { useApp } from '@/state/AppProvider';
import { useAccountResource } from './useAccountResource';
import { memoriesApi, pagePath } from './memoriesApi';
import { MemoryJournal, memoryStorageKey, type MemoryOperation } from './memoryJournal';
import type { MemoryPageDto } from '../../../../shared/memories-contract';

export function useMemoriesApi() {
  const { accountRequest } = useApp();
  return useMemo(() => memoriesApi(accountRequest), [accountRequest]);
}
export function useMemoryResource<T>(path: string | undefined) {
  const resource = useAccountResource<T>(path);
  const { reload } = resource;
  const focused = useRef(false);
  useFocusEffect(useCallback(() => {
    if (focused.current) reload();
    focused.current = true;
  }, [reload]));
  return resource;
}
export function useMemoryPage<T>(path: string | undefined) {
  const [cursor, setCursor] = useState<string>();
  const resource = useMemoryResource<MemoryPageDto<T>>(path ? pagePath(path, cursor) : undefined);
  return { ...resource, next: () => setCursor(resource.data?.nextCursor ?? undefined), first: () => setCursor(undefined), cursor };
}
export function useMemoryActions(scope: string, onSaved: () => void) {
  const { userId, accountRequest, assertAccountCurrent } = useApp();
  const journal = useMemo(() => new MemoryJournal(AsyncStorage, memoryStorageKey(userId ?? 'signed-out', `action:${scope}`), assertAccountCurrent), [userId, scope, assertAccountCurrent]);
  const active = useRef<MemoryJournal | null>(null);
  const [status, setStatus] = useState<{ journal: MemoryJournal; pending: MemoryOperation | null; busy: boolean; error?: string }>();
  useEffect(() => {
    active.current = journal;
    void journal.pending().then(pending => { if (active.current === journal) setStatus({ journal, pending, busy: false }); })
      .catch(reason => { if (active.current === journal) setStatus({ journal, pending: null, busy: false, error: String(reason) }); });
    return () => { active.current = null; };
  }, [journal]);
  const run = async <T,>(operation?: MemoryOperation) => {
    assertAccountCurrent();
    setStatus(previous => ({ journal, pending: previous?.journal === journal ? previous.pending : null, busy: true }));
    try {
      const result = await journal.execute<T>(accountRequest, operation);
      assertAccountCurrent();
      if (active.current === journal) onSaved();
      return result;
    } catch (reason) {
      if (active.current === journal) setStatus(previous => previous?.journal === journal ? { ...previous, error: reason instanceof Error ? reason.message : 'The action failed. Retry.' } : previous);
      throw reason;
    } finally {
      if (active.current === journal) {
        try {
          const pending = await journal.pending();
          if (active.current === journal) setStatus(previous => previous?.journal === journal ? { ...previous, busy: false, pending } : previous);
        } catch { /* Account changes clear the screen. */ }
      }
    }
  };
  const current = status?.journal === journal ? status : undefined;
  return { run, pending: current?.pending ?? null, busy: current?.busy ?? false, error: current?.error, locked: !current || current.busy || !!current.pending };
}

export function useMemoryDraft<T>(scope: string, initial: T) {
  const { userId, assertAccountCurrent } = useApp();
  const key = memoryStorageKey(userId ?? 'signed-out', `draft:${scope}`);
  const [snapshot, setSnapshot] = useState<{ key: string; value?: T; ready: boolean; error?: string }>();
  const queue = useRef(Promise.resolve());
  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(key).then(raw => {
      assertAccountCurrent();
      if (active) setSnapshot({ key, value: raw ? JSON.parse(raw) as T : undefined, ready: true });
    }).catch(() => { if (active) setSnapshot({ key, ready: false, error: 'Your local draft could not be restored.' }); });
    return () => { active = false; };
  }, [key, assertAccountCurrent]);
  const save = (next: T) => {
    if (snapshot?.key !== key || !snapshot.ready) return;
    assertAccountCurrent();
    setSnapshot({ key, value: next, ready: true });
    queue.current = queue.current.catch(() => undefined).then(async () => {
      assertAccountCurrent();
      await AsyncStorage.setItem(key, JSON.stringify(next));
      assertAccountCurrent();
    });
    void queue.current.catch(() => setSnapshot(previous => previous?.key === key ? { ...previous, error: 'The latest edit could not be saved on this device.' } : previous));
  };
  const current = snapshot?.key === key ? snapshot : undefined;
  return { value: current?.value ?? initial, save, ready: current?.ready ?? false, error: current?.error };
}

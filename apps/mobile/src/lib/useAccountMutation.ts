import { useEffect, useRef, useState } from 'react';
import { useApp } from '@/state/AppProvider';
import { ApiError } from './api';

export interface PendingMutation { path: string; method: string; input?: unknown }
export class MutationDraft {
  pending?: PendingMutation;
  capture(next: PendingMutation) {
    this.pending ??= JSON.parse(JSON.stringify(next)) as PendingMutation;
    return this.pending;
  }
  reject(error: unknown) {
    if (error instanceof ApiError && [400, 403, 404, 409, 413, 422].includes(error.status)) this.pending = undefined;
  }
}
export function useAccountMutation() {
  const { accountWrite } = useApp();
  const draft = useRef(new MutationDraft());
  const active = useRef(true);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, [accountWrite]);
  const run = async <T,>(path: string, method: string, input?: unknown): Promise<T> => {
    if (busyRef.current) throw new Error('A save is already in progress.');
    const next = draft.current.capture({ path, method, input });
    busyRef.current = true; setBusy(true); setLocked(true); setError(undefined);
    try {
      const result = await accountWrite<T>(next.path, next.method, next.input);
      if (!active.current) throw new Error('This screen has closed.');
      draft.current.pending = undefined; setLocked(false);
      return result;
    } catch (reason) {
      draft.current.reject(reason);
      if (active.current) {
        setLocked(!!draft.current.pending);
        setError(reason instanceof Error ? reason.message : 'Save failed. Retry.');
      }
      throw reason;
    } finally { busyRef.current = false; if (active.current) setBusy(false); }
  };
  return { run, busy, locked, error };
}

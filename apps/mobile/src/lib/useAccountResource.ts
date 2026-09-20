import { useCallback, useEffect, useState } from 'react';
import { useApp } from '@/state/AppProvider';
import { ApiError } from './api';

export function useAccountResource<T>(path: string | undefined) {
  const { accountRequest, accountRevision } = useApp();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ path?: string; owner?: typeof accountRequest; data?: T; error?: string; revision?: number; attempt?: number }>({});
  useEffect(() => {
    let active = true;
    if (path) void accountRequest<T>(path).then(data => {
      if (active) setResult({ path, owner: accountRequest, data, revision: accountRevision, attempt });
    }).catch(reason => {
      const revoked = reason instanceof ApiError && [401, 403, 404].includes(reason.status);
      if (active) setResult(previous => ({ data: !revoked && previous.path === path && previous.owner === accountRequest ? previous.data : undefined, path, owner: accountRequest, error: reason instanceof Error ? reason.message : 'Request failed. Retry.', revision: accountRevision, attempt }));
    });
    return () => { active = false; };
  }, [path, accountRequest, accountRevision, attempt]);
  const reload = useCallback(() => setAttempt(value => value + 1), []);
  const current = result.path === path && result.owner === accountRequest;
  const loading = !!path && (!current || result.revision !== accountRevision || result.attempt !== attempt);
  return { data: current ? result.data : undefined, error: current && !loading ? result.error : undefined, loading, reload };
}

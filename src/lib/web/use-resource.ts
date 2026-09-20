"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount } from "@/components/account/account-provider";
import { errorMessage, requestJson } from "./api";

export function useResource<T>(path: string | null, publicRead = false, delay = 0) {
  const { request, userId } = useAccount();
  const key = `${userId ?? "anonymous"}:${path}`;
  const [result, setResult] = useState<{
    key: string;
    data: T | null;
    error: string | null;
    loading: boolean;
    nextCursor: string | null;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    if (!path || (!userId && !publicRead)) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setResult((previous) =>
        previous?.key === key
          ? { ...previous, error: null, loading: true }
          : { key, data: null, error: null, loading: true, nextCursor: null },
      );
      const read = userId ? request : requestJson;
      let nextCursor: string | null = null;
      void read<T>(path, {
        signal: controller.signal,
        onPagination: (cursor) => {
          nextCursor = cursor;
        },
      })
        .then((data) => {
          if (!controller.signal.aborted)
            setResult({ key, data, error: null, loading: false, nextCursor });
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted)
            setResult({
              key,
              data: null,
              error: errorMessage(error),
              loading: false,
              nextCursor: null,
            });
        });
    }, delay);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [path, publicRead, userId, request, key, delay, attempt]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") retry();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const timer = window.setInterval(refresh, 240_000);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      window.clearInterval(timer);
    };
  }, [retry]);

  const enabled = Boolean(path && (userId || publicRead));
  return {
    data: enabled && result?.key === key ? result.data : null,
    error: enabled && result?.key === key ? result.error : null,
    loading: enabled && (result?.key !== key || result.loading),
    retry,
    nextCursor: enabled && result?.key === key ? result.nextCursor : null,
  };
}

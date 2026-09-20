"use client";

import {
  createContext,
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { BootstrapDto } from "../../../shared/api-contract";
import { AccountScope, ApiError, errorMessage, requestJson, type ApiOptions } from "@/lib/web/api";

interface AccountValue {
  client: SupabaseClient | null;
  userId: string | null;
  data: BootstrapDto | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  request: <T>(path: string, options?: ApiOptions) => Promise<T>;
  mutate: <T>(path: string, options: ApiOptions) => Promise<T>;
  signOut: () => Promise<void>;
}

const AccountContext = createContext<AccountValue | null>(null);

interface AccountIdentity {
  userId: string;
  generation: number;
  guard: ReturnType<AccountScope["capture"]>;
}

export function AccountProvider({ children }: { children: ReactNode }) {
  const [client, setClient] = useState<SupabaseClient | null>(null);
  const [identity, setIdentity] = useState<AccountIdentity | null>(null);
  const userId = identity?.userId ?? null;
  const [data, setData] = useState<BootstrapDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authVersion, setAuthVersion] = useState(0);
  const scope = useRef(new AccountScope());
  const loadSequence = useRef(0);

  const request = useCallback(
    async <T,>(path: string, options: ApiOptions = {}): Promise<T> => {
      if (!identity || !client)
        throw new ApiError("unauthorized", "Sign in to save and view your memories.", 401);
      const current = identity.guard;
      const owner = identity.userId;
      current.assertCurrent();
      try {
        return await requestJson<T>(path, {
          ...options,
          ...current,
          signal: options.signal
            ? AbortSignal.any([current.signal, options.signal])
            : current.signal,
          refreshSession: async () => {
            const result = await client.auth.refreshSession();
            return !result.error && result.data.session?.user.id === owner;
          },
        });
      } catch (failure) {
        current.assertCurrent();
        if (failure instanceof ApiError && failure.status === 401) {
          scope.current.switchTo(null);
          loadSequence.current++;
          setIdentity(null);
          setData(null);
          setLoading(false);
          setError(errorMessage(failure));
        }
        throw failure;
      }
    },
    [client, identity],
  );

  const refresh = useCallback(async () => {
    if (!identity || !client || identity.guard.signal.aborted) return;
    const current = identity.guard;
    const owner = identity.userId;
    const sequence = ++loadSequence.current;
    setLoading(true);
    try {
      const snapshot = await request<BootstrapDto>("/api/bootstrap");
      current.assertCurrent();
      if (sequence !== loadSequence.current) return;
      if (snapshot.user.id !== owner)
        throw new Error("Your account changed. Sign in again to reload your collection.");
      setData(snapshot);
      setError(null);
    } catch (failure) {
      if (!current.signal.aborted && sequence === loadSequence.current) {
        setError(errorMessage(failure));
      }
    } finally {
      if (!current.signal.aborted && sequence === loadSequence.current) setLoading(false);
    }
  }, [client, identity, request]);

  const mutate = useCallback(
    async <T,>(path: string, options: ApiOptions): Promise<T> => {
      const current = scope.current.capture();
      const result = await request<T>(path, options);
      current.assertCurrent();
      await refresh();
      current.assertCurrent();
      return result;
    },
    [refresh, request],
  );

  useEffect(() => {
    let active = true;
    const accountScope = scope.current;
    let unsubscribe: (() => void) | undefined;
    void import("@/lib/auth/browser")
      .then(({ createSupabaseBrowserClient }) => {
        if (!active) return;
        const supabase = createSupabaseBrowserClient();
        if (!supabase)
          throw new Error(
            "Sign-in is not configured. Ask the app administrator to configure Supabase.",
          );
        setClient(supabase);
        const subscription = supabase.auth.onAuthStateChange((event, session) => {
          if (!active) return;
          const nextUser = session?.user.id ?? null;
          if (nextUser !== scope.current.userId) {
            scope.current.switchTo(nextUser);
            loadSequence.current++;
            setData(null);
            setError(null);
            setIdentity(
              nextUser
                ? {
                    userId: nextUser,
                    generation: loadSequence.current,
                    guard: scope.current.capture(),
                  }
                : null,
            );
            setLoading(Boolean(nextUser));
          }
          if (!nextUser) setLoading(false);
          if (event === "SIGNED_IN" || event === "USER_UPDATED")
            setAuthVersion((version) => version + 1);
        });
        unsubscribe = () => subscription.data.subscription.unsubscribe();
      })
      .catch(() => {
        if (active) {
          setError("Sign-in is unavailable. Supabase configuration is missing or invalid.");
          setLoading(false);
        }
      });
    return () => {
      active = false;
      unsubscribe?.();
      accountScope.switchTo(null);
    };
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    const onForeground = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", onForeground);
    document.addEventListener("visibilitychange", onForeground);
    const timer = window.setInterval(onForeground, 240_000);
    return () => {
      window.removeEventListener("focus", onForeground);
      document.removeEventListener("visibilitychange", onForeground);
      window.clearInterval(timer);
      window.clearTimeout(initial);
    };
  }, [refresh, userId, authVersion]);

  const signOut = async () => {
    if (!client) throw new Error("Sign-in is not configured.");
    scope.current.switchTo(null);
    loadSequence.current++;
    setData(null);
    setIdentity(null);
    setLoading(false);
    const result = await client.auth.signOut();
    if (result.error) {
      setError("Could not finish signing out. Your private data is hidden; retry sign-out.");
      throw result.error;
    }
    setError(null);
  };

  return (
    <AccountContext.Provider
      value={{ client, userId, data, loading, error, refresh, request, mutate, signOut }}
    >
      <Fragment key={identity ? `${identity.userId}:${identity.generation}` : "signed-out"}>
        {children}
      </Fragment>
    </AccountContext.Provider>
  );
}

export function useAccount() {
  const account = useContext(AccountContext);
  if (!account) throw new Error("AccountProvider is required");
  return account;
}

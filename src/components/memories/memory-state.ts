"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount } from "@/components/account/account-provider";
import { ApiError, errorMessage, type ApiOptions } from "@/lib/web/api";
import { useResource } from "@/lib/web/use-resource";
import type { MemoryPageDto } from "../../../shared/memories-contract";

const changedEvent = "souvenir:memories-changed";

export function notifyMemoriesChanged() {
  window.dispatchEvent(new Event(changedEvent));
}

export function useMemoryResource<T>(path: string | null) {
  const resource = useResource<T>(path);
  useEffect(() => {
    window.addEventListener(changedEvent, resource.retry);
    return () => window.removeEventListener(changedEvent, resource.retry);
  }, [resource.retry]);
  return resource;
}

export function useMemoryPage<T>(path: string) {
  const [cursors, setCursors] = useState<string[]>([]);
  const cursor = cursors.at(-1);
  const resource = useMemoryResource<MemoryPageDto<T>>(
    `${path}${path.includes("?") ? "&" : "?"}limit=25${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
  );
  return {
    ...resource,
    previous: cursors.length ? () => setCursors((value) => value.slice(0, -1)) : undefined,
    next: resource.data?.nextCursor
      ? () => setCursors((value) => [...value, resource.data!.nextCursor!])
      : undefined,
  };
}

export function useMemoryAction() {
  const { request, refresh, userId } = useAccount();
  const locked = useRef(false);
  const mounted = useRef(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(
    async <T>(path: string, options: ApiOptions, success?: string): Promise<T | undefined> => {
      if (locked.current) return undefined;
      locked.current = true;
      setBusy(true);
      setError(null);
      setMessage(null);
      try {
        const result = await request<T>(path, options);
        if (mounted.current) {
          setMessage(success ?? "Saved.");
          notifyMemoriesChanged();
        }
        void refresh();
        return result;
      } catch (failure) {
        if (mounted.current) {
          setError(
            failure instanceof ApiError && failure.code === "conflict"
              ? "This changed on another device. Refresh, review the latest version, then try again."
              : errorMessage(failure),
          );
        }
        return undefined;
      } finally {
        locked.current = false;
        if (mounted.current) setBusy(false);
      }
    },
    [request, refresh],
  );

  const post = useCallback(
    async <T>(path: string, body: object, success?: string) => {
      // Only the request identity is retained, never notes, photo bytes, or signed URLs.
      const fingerprint = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify([userId, path, body])),
      );
      const key = `souvenir:memory-request:${Array.from(new Uint8Array(fingerprint), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("")}`;
      let requestId: string;
      try {
        requestId = sessionStorage.getItem(key) ?? crypto.randomUUID();
        sessionStorage.setItem(key, requestId);
      } catch {
        setError("Enable browser storage so an interrupted save can be safely retried.");
        return undefined;
      }
      const result = await run<T>(path, { method: "POST", body: { ...body, requestId } }, success);
      if (result !== undefined) {
        try {
          sessionStorage.removeItem(key);
        } catch {
          return result;
        }
      }
      return result;
    },
    [run, userId],
  );

  return { run, post, busy, error, message };
}

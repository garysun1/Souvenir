"use client";

import { useRef, useState } from "react";
import { useAccount } from "@/components/account/account-provider";
import { errorMessage, type ApiOptions } from "./api";

export function useWrite(onSaved: () => void) {
  const { request } = useAccount();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const intent = useRef<{ key: string; requestId: string } | null>(null);
  const locked = useRef(false);

  async function write(path: string, options: ApiOptions, success: string) {
    if (locked.current) return false;
    locked.current = true;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      let body = options.body;
      if (options.method === "POST" && body && typeof body === "object") {
        const key = JSON.stringify([path, body]);
        if (intent.current?.key !== key) intent.current = { key, requestId: crypto.randomUUID() };
        body = { ...body, requestId: intent.current.requestId };
      }
      await request(path, { ...options, body });
      intent.current = null;
      setMessage(success);
      onSaved();
      return true;
    } catch (failure) {
      setError(errorMessage(failure));
      return false;
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return { busy, error, message, write };
}

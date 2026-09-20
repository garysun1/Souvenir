"use client";

import { useSearchParams } from "next/navigation";

export function useQueryState(key: string, fallback = "") {
  const params = useSearchParams();
  const value = params.get(key) ?? fallback;
  const setValue = (next: string | null) => {
    const url = new URL(window.location.href);
    if (next && next !== fallback) url.searchParams.set(key, next);
    else url.searchParams.delete(key);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  };
  return [value, setValue] as const;
}

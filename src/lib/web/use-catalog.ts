"use client";

import { useEffect, useState } from "react";
import type { PlaceDto, SetDto } from "../../../shared/api-contract";
import { useAccount } from "@/components/account/account-provider";
import { errorMessage, requestJson } from "./api";

export function useCatalog() {
  const { data } = useAccount();
  const [catalog, setCatalog] = useState<{ places: PlaceDto[]; sets: SetDto[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const hasAccountCatalog = Boolean(data);
  useEffect(() => {
    if (hasAccountCatalog) return;
    const controller = new AbortController();
    void Promise.all([
      requestJson<PlaceDto[]>("/api/places", { signal: controller.signal }),
      requestJson<SetDto[]>("/api/sets", { signal: controller.signal }),
    ])
      .then(([places, sets]) => {
        if (!controller.signal.aborted) {
          setCatalog({ places, sets });
          setError(null);
        }
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(errorMessage(failure));
      });
    return () => controller.abort();
  }, [hasAccountCatalog, attempt]);
  return {
    catalog: data ?? catalog,
    error: hasAccountCatalog ? null : error,
    retry: () => {
      setError(null);
      setAttempt((value) => value + 1);
    },
  };
}

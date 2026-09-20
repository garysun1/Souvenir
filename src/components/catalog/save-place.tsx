"use client";

import Link from "next/link";
import { useState } from "react";
import type { WishlistDto, WishlistItemPut } from "../../../shared/api-contract";
import { useAccount } from "@/components/account/account-provider";
import { ErrorNotice } from "@/components/account/account-state";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/web/api";

export function SavePlace({ placeId, wishlist }: { placeId: string; wishlist?: WishlistDto }) {
  const { data, userId, mutate } = useAccount();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!userId)
    return (
      <Link
        href="/login"
        className="inline-flex min-h-11 items-center text-sm text-brand underline"
      >
        Sign in to save
      </Link>
    );
  const list = wishlist ?? data?.wishlists.find((item) => item.isDefault);
  const entry = list?.entries.find((item) => item.placeId === placeId);
  const saved = entry?.saverIds.includes(userId) ?? false;
  const completed = entry?.completedBy.includes(userId) ?? false;
  async function update(body: WishlistItemPut) {
    if (!list) return;
    setBusy(true);
    setError(null);
    try {
      await mutate(`/api/wishlists/${list.id}/items`, { method: "PUT", body });
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={busy || !list}
          onClick={() => void update({ placeId, saved: !saved })}
        >
          {busy ? "Saving…" : saved ? "Remove my save" : "Want to go"}
        </Button>
        {wishlist && saved && (
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => void update({ placeId, saved: true, completed: !completed })}
          >
            {completed ? "Mark incomplete" : "Mark done"}
          </Button>
        )}
      </div>
      <ErrorNotice message={error} />
    </div>
  );
}

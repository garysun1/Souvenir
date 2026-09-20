"use client";

import Link from "next/link";
import { useState } from "react";
import type { WishlistDto, WishlistItemPut, Visibility } from "../../../shared/api-contract";
import { useAccount } from "@/components/account/account-provider";
import { ErrorNotice } from "@/components/account/account-state";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/web/api";

export function SavePlace({
  placeId,
  wishlist,
  sharing = false,
  onSaved,
}: {
  placeId: string;
  wishlist?: WishlistDto;
  sharing?: boolean;
  onSaved?: () => void;
}) {
  const { data, userId, mutate } = useAccount();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [visibility, setVisibility] = useState<Visibility | "">("");
  const [message, setMessage] = useState<string | null>(null);
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
    setMessage(null);
    try {
      await mutate(`/api/wishlists/${list.id}/items`, { method: "PUT", body });
      if (body.visibility) setMessage("Save visibility updated.");
      onSaved?.();
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
      {sharing && saved && (
        <div className="space-y-2">
          <label className="block space-y-1 text-sm">
            Change who can see this save
            <select
              value={visibility}
              disabled={busy}
              onChange={(event) => setVisibility(event.target.value as Visibility | "")}
              className="min-h-11 w-full rounded-xl border border-border px-3"
            >
              <option value="">Choose a new visibility</option>
              <option value="private">Only me</option>
              <option value="friends">Accepted friends</option>
              <option value="public">Public</option>
            </select>
          </label>
          <p className="text-xs text-text-secondary">
            The API does not report current save visibility. Choose explicitly to replace it.
            Shared-list members keep their list access.
          </p>
          <Button
            type="button"
            variant="outline"
            disabled={busy || !visibility}
            onClick={() => {
              if (visibility) void update({ placeId, saved: true, visibility });
            }}
          >
            Apply save visibility
          </Button>
        </div>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
      <ErrorNotice message={error} />
    </div>
  );
}

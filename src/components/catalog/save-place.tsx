"use client";

import Link from "next/link";
import { useState } from "react";
import type {
  WishlistCreate,
  WishlistDto,
  WishlistItemPut,
  Visibility,
} from "../../../shared/api-contract";
import { useAccount } from "@/components/account/account-provider";
import { ErrorNotice } from "@/components/account/account-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
      setMessage(
        body.visibility
          ? "Save visibility updated."
          : body.saved
            ? `Saved to ${list.name}.`
            : "Removed your save.",
      );
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
          aria-label={saved ? "Remove my save" : "Want to go"}
          onClick={() => void update({ placeId, saved: !saved })}
        >
          {busy ? "Saving…" : saved ? "Saved" : "Want to go"}
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
      {saved && !wishlist && (
        <div className="space-y-2">
          <Link
            href={`/plan?placeIds=${placeId}`}
            className="inline-flex min-h-11 items-center text-sm text-brand underline"
          >
            Plan a visit
          </Link>
          <details>
            <summary className="min-h-11 cursor-pointer py-3 text-sm text-brand">
              Add to a list
            </summary>
            <ListSave placeId={placeId} />
          </details>
        </div>
      )}
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

function ListSave({ placeId }: { placeId: string }) {
  const { data, mutate } = useAccount();
  const [listId, setListId] = useState("");
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);
  const [pending, setPending] = useState<WishlistCreate | null>(null);
  const [created, setCreated] = useState<WishlistDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  async function add() {
    if (busy) return;
    setBusy(true);
    setError(null);
    setMessage("");
    try {
      let list = data?.wishlists.find((item) => item.id === listId);
      if (!listId) {
        const body = pending ?? {
          requestId: crypto.randomUUID(),
          name: name.trim(),
          isShared: shared,
        };
        setPending(body);
        list = created ?? (await mutate<WishlistDto>("/api/wishlists", { method: "POST", body }));
        setCreated(list);
      }
      if (!list) throw new Error("Choose an available list.");
      await mutate(`/api/wishlists/${list.id}/items`, {
        method: "PUT",
        body: { placeId, saved: true },
      });
      setMessage(`Saved to ${list.name}.`);
      setListId(list.id);
      setPending(null);
      setCreated(null);
      setName("");
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-3 rounded-xl border border-border p-3">
      <label className="block space-y-1 text-sm">
        Choose a list
        <select
          disabled={busy || !!pending}
          value={listId}
          onChange={(event) => setListId(event.target.value)}
          className="min-h-11 w-full rounded-xl border border-border px-3"
        >
          <option value="">Create a new list</option>
          {data?.wishlists.map((list) => (
            <option key={list.id} value={list.id}>
              {list.name}
              {list.isShared ? " · Shared" : " · Personal"}
            </option>
          ))}
        </select>
      </label>
      {!listId && (
        <>
          <Input
            aria-label="New list name"
            placeholder="Saturday with friends"
            maxLength={120}
            value={name}
            disabled={busy || !!pending}
            onChange={(event) => setName(event.target.value)}
          />
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={shared}
              disabled={busy || !!pending}
              onChange={(event) => setShared(event.target.checked)}
            />
            Make this a shared list
          </label>
        </>
      )}
      <p className="text-xs text-text-secondary">
        Shared-list members see destinations and plans. Your original photos, companions and moments
        stay private.
      </p>
      <Button type="button" disabled={busy || (!listId && !name.trim())} onClick={() => void add()}>
        {busy ? "Saving…" : pending ? "Retry adding to list" : "Add place"}
      </Button>
      {pending && (
        <p className="text-xs">
          Retry keeps the same list and place, even if the first response was lost.
        </p>
      )}
      {message && (
        <>
          <p role="status" className="text-sm">
            {message}
          </p>
          <Link
            href={`/plan?wishlistId=${listId}`}
            className="block py-3 text-sm text-brand underline"
          >
            Plan from this list
          </Link>
          <Link href="/friends#shared-lists" className="block py-3 text-sm text-brand underline">
            Manage shared lists and members
          </Link>
        </>
      )}
      <ErrorNotice message={error} />
    </div>
  );
}

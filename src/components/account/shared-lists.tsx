"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { mutualDestinations } from "../../../shared/journey";
import type { WishlistCreate, WishlistDto } from "../../../shared/api-contract";
import { AccountRequired, ErrorNotice, RefreshAccount } from "./account-state";
import { useAccount } from "./account-provider";
import { SavePlace } from "@/components/catalog/save-place";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlaceRow } from "@/components/ui/place-row";
import { errorMessage } from "@/lib/web/api";
import { legacyPlace } from "@/lib/web/collection";

export function SharedLists() {
  return (
    <AccountRequired>
      <Lists />
    </AccountRequired>
  );
}

function Lists() {
  const { data, mutate } = useAccount();
  const [pending, setPending] = useState<WishlistCreate | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    setBusy(true);
    setError(null);
    try {
      const body = pending ?? {
        requestId: crypto.randomUUID(),
        name: String(new FormData(form).get("name")).trim(),
        isShared: true,
      };
      setPending(body);
      await mutate("/api/wishlists", { method: "POST", body });
      setPending(null);
      form.reset();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  const lists = data!.wishlists.filter((list) => list.isShared);
  return (
    <div id="shared-lists" className="mx-auto max-w-3xl scroll-mt-24 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-serif text-2xl font-bold text-brand">Shared lists</h1>
        <RefreshAccount />
      </div>
      <p className="text-sm text-text-secondary">
        Invite a real account by its profile handle. Sharing a list never shares private photos,
        notes or tips.
      </p>
      <form onSubmit={create} className="space-y-3 rounded-xl border border-border p-4">
        <ErrorNotice message={error} />
        <label className="block space-y-2 text-sm">
          New list name
          <Input
            name="name"
            required
            maxLength={120}
            disabled={busy || Boolean(pending)}
            placeholder="Places to go together"
          />
        </label>
        {pending && (
          <p className="text-sm">
            Retrying the same list creation. Keep this page open until it succeeds.
          </p>
        )}
        <Button type="submit" disabled={busy}>
          {busy ? "Creating…" : pending ? "Retry creating list" : "Create shared list"}
        </Button>
      </form>
      {!lists.length && (
        <p className="text-sm text-text-secondary">
          No shared lists yet. Your personal Want to go list stays private.
        </p>
      )}
      {lists.map((list) => (
        <SharedList key={list.id} list={list} />
      ))}
    </div>
  );
}

function SharedList({ list }: { list: WishlistDto }) {
  const { data, mutate } = useAccount();
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const snapshot = data!;
  const owner = list.ownerId === snapshot.user.id;
  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    setError(null);
    try {
      await mutate(`/api/wishlists/${list.id}/members`, {
        method: "POST",
        body: { handle: String(new FormData(form).get("handle")).trim().replace(/^@/, "") },
      });
      form.reset();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  async function removeMember(userId: string) {
    if (!window.confirm("Remove this member and their saves from the list?")) return;
    setBusy(true);
    setError(null);
    try {
      await mutate(`/api/wishlists/${list.id}/members/${userId}`, { method: "DELETE" });
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-4 rounded-xl border border-border p-4">
      <h2 className="font-serif text-xl font-bold text-brand">{list.name}</h2>
      <p className="text-sm text-text-secondary">
        {list.memberIds.length} {list.memberIds.length === 1 ? "member" : "members"} ·{" "}
        {list.entries.length} places ·{" "}
        {
          list.entries.filter((entry) => list.memberIds.every((id) => entry.saverIds.includes(id)))
            .length
        }{" "}
        saved by everyone
      </p>
      <ErrorNotice message={error} />
      {list.entries.length > 0 && (
        <div className="flex flex-wrap gap-4">
          <Link
            href={`/plan?wishlistId=${list.id}`}
            className="inline-flex min-h-11 items-center rounded-full bg-brand px-4 text-sm text-white"
          >
            Plan an outing
          </Link>
          {mutualDestinations(list, snapshot.user.id).length > 0 && (
            <Link
              href={`/plan?wishlistId=${list.id}&placeIds=${mutualDestinations(
                list,
                snapshot.user.id,
              )
                .map((entry) => entry.placeId)
                .slice(0, 6)
                .join(",")}`}
              className="py-3 text-sm text-brand underline"
            >
              Plan places you both saved
            </Link>
          )}
        </div>
      )}
      <details>
        <summary className="cursor-pointer py-3 text-sm font-medium">Members</summary>
        <ul className="space-y-3">
          {list.memberIds.map((id) => (
            <li key={id} className="flex flex-wrap items-center justify-between gap-3">
              <span className="break-all text-xs">
                {id === snapshot.user.id ? "You" : `Account ${id}`}
                {id === list.ownerId ? " · Owner" : ""}
              </span>
              {owner && id !== list.ownerId && (
                <Button variant="ghost" disabled={busy} onClick={() => void removeMember(id)}>
                  Remove member
                </Button>
              )}
            </li>
          ))}
        </ul>
      </details>
      {owner && (
        <form onSubmit={invite} className="flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1 space-y-2 text-sm">
            Account handle
            <Input name="handle" required maxLength={81} placeholder="@handle from their profile" />
          </label>
          <Button type="submit" variant="outline" disabled={busy}>
            Add member
          </Button>
        </form>
      )}
      {list.entries.map((entry) => {
        const place = snapshot.places.find((item) => item.id === entry.placeId);
        return place ? (
          <div key={place.id} className="space-y-2">
            <PlaceRow place={legacyPlace(place)} />
            <p className="text-xs text-text-secondary">
              {entry.saverIds.length} saved · {entry.completedBy.length} completed
            </p>
            <SavePlace placeId={place.id} wishlist={list} />
          </div>
        ) : null;
      })}
      <label className="block space-y-2 text-sm">
        Add a place
        <select
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
          className="min-h-11 w-full rounded-xl border border-border bg-white px-3"
        >
          <option value="">Choose from the shared catalog</option>
          {snapshot.places.map((place) => (
            <option key={place.id} value={place.id}>
              {place.name}
            </option>
          ))}
        </select>
      </label>
      {selected && <SavePlace key={selected} placeId={selected} wishlist={list} />}
    </section>
  );
}

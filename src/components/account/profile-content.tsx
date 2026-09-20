"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import type { ProfilePatch } from "../../../shared/api-contract";
import { useAccount } from "./account-provider";
import { AccountRequired, ErrorNotice, RefreshAccount } from "./account-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlaceRow } from "@/components/ui/place-row";
import { legacyPlace, savedPlaceIds, setProgress } from "@/lib/web/collection";
import { errorMessage } from "@/lib/web/api";

export function ProfileContent() {
  return (
    <AccountRequired>
      <Profile />
    </AccountRequired>
  );
}

function Profile() {
  const { data, mutate, signOut } = useAccount();
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const snapshot = data!;
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const body: ProfilePatch = {
      displayName: String(fields.get("displayName")).trim(),
      homeCity: String(fields.get("homeCity")).trim() || null,
    };
    setBusy(true);
    setError(null);
    try {
      await mutate("/api/me", { method: "PATCH", body });
      setEditing(false);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  const favorites = snapshot.placePreferences.filter((preference) => preference.favorite);
  const tips = snapshot.placePreferences.filter((preference) => preference.tip);
  return (
    <div className="space-y-7 lg:flex lg:items-start lg:gap-8">
      <div className="space-y-6 lg:w-80 lg:shrink-0">
        <div className="flex flex-col items-center">
          <div className="flex size-20 items-center justify-center rounded-full bg-brand font-serif text-3xl font-bold text-white">
            {snapshot.user.displayName.slice(0, 1).toUpperCase()}
          </div>
          <h1 className="mt-3 font-serif text-xl font-bold text-brand">
            {snapshot.user.displayName}
          </h1>
          <p className="mt-1 max-w-full break-all text-center text-xs text-text-secondary">
            @{snapshot.user.handle}
          </p>
          {snapshot.user.homeCity && <p className="mt-2 text-sm">{snapshot.user.homeCity}</p>}
        </div>
        <div className="grid grid-cols-3 divide-x divide-divider rounded-xl border border-divider py-4">
          {[
            ["Places", new Set(snapshot.collection.map((edition) => edition.placeId)).size],
            ["Editions", snapshot.collection.length],
            [
              "Sets",
              snapshot.sets.filter(
                (set) =>
                  set.places.length > 0 &&
                  setProgress(set, snapshot.collection) === set.places.length,
              ).length,
            ],
          ].map(([label, value]) => (
            <div key={label} className="text-center">
              <p className="font-serif text-xl font-bold text-brand">{value}</p>
              <p className="text-xs text-text-secondary">{label}</p>
            </div>
          ))}
        </div>
        <ErrorNotice message={error} />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => setEditing(!editing)}>
            Edit profile
          </Button>
          <RefreshAccount />
          <Button
            variant="ghost"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await signOut();
              } catch (failure) {
                setError(errorMessage(failure));
              } finally {
                setBusy(false);
              }
            }}
          >
            Sign out
          </Button>
        </div>
        {editing && (
          <form onSubmit={save} className="space-y-3">
            <label className="block space-y-2 text-sm">
              Display name
              <Input
                name="displayName"
                required
                maxLength={100}
                defaultValue={snapshot.user.displayName}
              />
            </label>
            <label className="block space-y-2 text-sm">
              Home city
              <Input name="homeCity" maxLength={100} defaultValue={snapshot.user.homeCity ?? ""} />
            </label>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : "Save profile"}
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </form>
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-7">
        <div className="divide-y divide-divider border-y border-divider">
          {[
            { href: "/collection", label: "Collection", count: snapshot.collection.length },
            { href: "/collection", label: "Want to go", count: savedPlaceIds(snapshot).size },
            { href: "/plan", label: "Plans", count: snapshot.plans.length },
            {
              href: "/friends",
              label: "Shared lists",
              count: snapshot.wishlists.filter((list) => list.isShared).length,
            },
          ].map((row) => (
            <Link
              key={row.label}
              href={row.href}
              className="flex min-h-14 items-center justify-between text-sm font-medium"
            >
              <span>{row.label}</span>
              <span className="text-text-secondary">{row.count} ›</span>
            </Link>
          ))}
        </div>
        <section>
          <h2 className="font-serif text-xl font-bold text-brand">
            Favorites ({favorites.length})
          </h2>
          {favorites.map((preference) => {
            const place = snapshot.places.find((item) => item.id === preference.placeId);
            return place ? <PlaceRow key={place.id} place={legacyPlace(place)} /> : null;
          })}
          {!favorites.length && (
            <p className="mt-3 text-sm text-text-secondary">
              Favorite a place from its detail page.
            </p>
          )}
        </section>
        <section>
          <h2 className="font-serif text-xl font-bold text-brand">My tips · Only you</h2>
          {tips.map((preference) => {
            const place = snapshot.places.find((item) => item.id === preference.placeId);
            return place ? (
              <div key={place.id} className="pb-4">
                <PlaceRow place={legacyPlace(place)} />
                <p className="mt-2 whitespace-pre-wrap text-sm">{preference.tip}</p>
              </div>
            ) : null;
          })}
          {!tips.length && (
            <p className="mt-3 text-sm text-text-secondary">
              Keep private tips on a place&apos;s detail page.
            </p>
          )}
        </section>
        <p className="text-xs text-text-secondary">
          Provider identification, weather, booking and Dropbox sample imports are not connected
          here. Sample data is never imported into your account.
        </p>
      </div>
    </div>
  );
}

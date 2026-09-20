"use client";

import Link from "next/link";
import type { UserDetailDto } from "../../../shared/api-contract";
import { AccountRequired } from "@/components/account/account-state";
import { useAccount } from "@/components/account/account-provider";
import { Button } from "@/components/ui/button";
import { ResourceState } from "@/components/catalog/resource-state";
import { useResource } from "@/lib/web/use-resource";
import { canonicalPlaceId, placePath } from "@/lib/web/worldwide";
import { FriendActions } from "./friend-actions";
import { UserStats } from "./user-stats";

export function UserProfile({ id }: { id: string }) {
  return (
    <AccountRequired>
      <Profile id={id} />
    </AccountRequired>
  );
}

function Profile({ id }: { id: string }) {
  const { data } = useAccount();
  const resource = useResource<UserDetailDto>(
    canonicalPlaceId(id) ? `/api/users/${encodeURIComponent(id)}` : null,
  );
  if (!canonicalPlaceId(id))
    return <p role="alert">This profile link needs a canonical user UUID.</p>;
  const profile = resource.data;
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <ResourceState {...resource} label="Loading profile…" />
      {profile && (
        <>
          <h1 className="font-serif text-3xl font-bold text-brand">{profile.user.displayName}</h1>
          <p className="break-all text-sm text-text-secondary">@{profile.user.handle}</p>
          <FriendActions
            userId={profile.user.id}
            relationship={profile.relationship}
            refresh={resource.retry}
          />
          <Button variant="outline" onClick={resource.retry}>
            Refresh profile
          </Button>
          <UserStats stats={profile.stats} />
          {profile.relationship === "accepted" && (
            <p className="text-sm">
              Taste overlap:{" "}
              {profile.tasteOverlap === null
                ? "unknown — not enough shared ratings"
                : `${Math.round(profile.tasteOverlap * 100)}%`}
            </p>
          )}
          <section className="space-y-3">
            <h2 className="font-serif text-xl font-bold text-brand">Set completion</h2>
            {!profile.setCompletion.length && (
              <p className="text-sm">No set completion visible to you.</p>
            )}
            {profile.setCompletion.map((completion) => {
              const set = data?.sets.find((set) => set.id === completion.setId);
              return (
                <div
                  key={completion.setId}
                  className="space-y-1 rounded-xl border border-border p-3"
                >
                  {set ? (
                    <Link
                      className="font-serif text-brand underline"
                      href={`/sets/${encodeURIComponent(set.slug)}`}
                    >
                      {set.name}
                    </Link>
                  ) : (
                    <p>Set details unavailable</p>
                  )}
                  <p className="text-sm">
                    {completion.visited}/{completion.total} places ·{" "}
                    {completion.rate === null
                      ? "Completion unknown"
                      : `${Math.round(completion.rate * 100)}%`}
                  </p>
                  {completion.total > 0 && (
                    <progress
                      aria-label={set?.name ?? "Set completion"}
                      max={completion.total}
                      value={completion.visited}
                      className="w-full accent-brand"
                    />
                  )}
                </div>
              );
            })}
          </section>
          <section className="space-y-3">
            <h2 className="font-serif text-xl font-bold text-brand">Shared editions</h2>
            <p className="text-xs text-text-secondary">
              Up to 100 editions authorized for your current relationship. Private moments,
              companions and capture photos remain private.
            </p>
            {!profile.editions.length && (
              <p className="text-sm">
                {profile.relationship === "accepted" || profile.relationship === "self"
                  ? "No visible editions yet."
                  : "Become accepted friends to see shared editions."}
              </p>
            )}
            <ul className="divide-y divide-divider">
              {profile.editions.map((edition) => {
                const place = data?.places.find((place) => place.id === edition.placeId);
                return (
                  <li key={edition.id} className="space-y-1 py-3">
                    {place ? (
                      <Link
                        href={placePath(place.slug)}
                        className="font-serif text-brand underline"
                      >
                        {place.name}
                      </Link>
                    ) : (
                      <p className="text-sm">Destination details unavailable</p>
                    )}
                    <p className="text-xs text-text-secondary">
                      {new Date(edition.capturedAt).toLocaleDateString()} ·{" "}
                      {edition.variant.replaceAll("_", " ")}
                    </p>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}

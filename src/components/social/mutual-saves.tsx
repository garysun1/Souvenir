"use client";

import Link from "next/link";
import { useAccount } from "@/components/account/account-provider";
import { mutualDestinations } from "../../../shared/journey";

export function MutualSaves() {
  const { data } = useAccount();
  if (!data) return null;
  const lists = data.wishlists.filter((list) => list.isShared && list.memberIds.length > 1);
  const overlaps = lists
    .map((list) => ({ list, entries: mutualDestinations(list, data.user.id) }))
    .filter(({ entries }) => entries.length);
  return (
    <section className="space-y-3">
      <h2 className="font-serif text-xl font-bold text-brand">Places to go together</h2>
      {overlaps.length ? (
        overlaps.map(({ list, entries }) => (
          <article key={list.id} className="space-y-3 rounded-xl bg-surface-muted p-4">
            <h3 className="font-semibold">
              {entries.length} mutual saves in {list.name}
            </h3>
            <ul className="space-y-2">
              {entries.slice(0, 6).map((entry) => {
                const place = data.places.find((item) => item.id === entry.placeId);
                return place ? (
                  <li key={entry.placeId}>
                    <Link
                      href={`/places/${place.slug}`}
                      className="font-serif text-brand underline"
                    >
                      {place.name}
                    </Link>
                  </li>
                ) : null;
              })}
            </ul>
            <Link
              href={`/plan?wishlistId=${list.id}&placeIds=${entries
                .slice(0, 6)
                .map((entry) => entry.placeId)
                .join(",")}`}
              className="inline-flex min-h-11 items-center rounded-full bg-brand px-4 text-sm font-semibold text-white"
            >
              Plan together
            </Link>
          </article>
        ))
      ) : (
        <p className="text-sm text-text-secondary">
          Save destinations in a shared list to find places you and its members both want to visit.
        </p>
      )}
      <Link
        href="#shared-lists"
        className="inline-flex min-h-11 items-center text-sm text-brand underline"
      >
        Browse or create a shared list
      </Link>
    </section>
  );
}

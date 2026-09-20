"use client";

import Link from "next/link";
import { useState } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { PlaceRow } from "@/components/ui/place-row";
import { PageBody } from "@/components/ui/page";
import { UnderlineTabs } from "@/components/ui/underline-tabs";
import { Input } from "@/components/ui/input";
import { RecommendationBadge } from "@/components/ui/recommendation-badge";
import { AccountRequired, RefreshAccount } from "@/components/account/account-state";
import { useAccount } from "@/components/account/account-provider";
import { SavePlace } from "@/components/catalog/save-place";
import { CatalogSet } from "@/components/catalog/catalog-set";
import { groupEditions, legacyPlace, savedPlaceIds, setProgress } from "@/lib/web/collection";

export function CollectionContent() {
  return (
    <PageBody className="space-y-5 pt-3">
      <AccountRequired>
        <Collection />
      </AccountRequired>
    </PageBody>
  );
}

function Collection() {
  const { data } = useAccount();
  const [tab, setTab] = useState("been");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const snapshot = data!;
  const groups = groupEditions(snapshot.collection);
  const saves = savedPlaceIds(snapshot);
  const visible = (name: string, placeCategory: string) =>
    name.toLowerCase().includes(search.toLowerCase()) && (!category || category === placeCategory);
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-text-secondary">
          {groups.length} places · {snapshot.collection.length} editions
        </p>
        <RefreshAccount />
      </div>
      <UnderlineTabs tabs={["been", "want to go", "sets"]} value={tab} onChange={setTab} />
      {tab !== "sets" && (
        <div className="flex flex-wrap gap-3">
          <Input
            className="max-w-md"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search your collection"
            placeholder="Search your collection"
          />
          <select
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            aria-label="Filter category"
            className="min-h-11 rounded-full border border-border px-4"
          >
            <option value="">All categories</option>
            {["nature", "culture", "food", "landmark", "hidden_gem"].map((value) => (
              <option key={value} value={value}>
                {value.replace("_", " ")}
              </option>
            ))}
          </select>
        </div>
      )}
      {tab === "been" &&
        (groups.length ? (
          <div className="max-w-3xl">
            {groups
              .filter((group) => visible(group.place.name, group.place.category))
              .map((group, index) => (
                <section key={group.place.id} className="pb-4">
                  <PlaceRow
                    place={legacyPlace(group.place)}
                    ordinal={index + 1}
                    trailing={
                      <RecommendationBadge
                        sentiment={
                          snapshot.rankings.find((ranking) => ranking.placeId === group.place.id)
                            ?.sentiment
                        }
                      />
                    }
                  />
                  <div className="space-y-2 pl-9 pt-3">
                    {group.editions.map((edition) => (
                      <Link
                        key={edition.id}
                        href={`/editions/${edition.id}`}
                        className="flex min-h-11 items-center justify-between gap-3 rounded-lg bg-surface-muted px-3 text-sm"
                      >
                        <span>
                          {edition.visitSequence === 1 ? "First visit" : "Return visit"} · Edition{" "}
                          {edition.visitSequence}
                        </span>
                        <span>
                          {new Date(edition.capturedAt).toLocaleDateString(undefined, {
                            timeZone: edition.timezone,
                          })}
                        </span>
                      </Link>
                    ))}
                  </div>
                </section>
              ))}
          </div>
        ) : (
          <EmptyState
            title="Your collection is waiting"
            description="Capture your first place to start keeping memories."
            action={
              <Link href="/capture" className="text-brand underline">
                Capture a place
              </Link>
            }
          />
        ))}
      {tab === "want to go" &&
        (saves.size ? (
          <div className="max-w-3xl">
            {snapshot.places
              .filter((place) => saves.has(place.id) && visible(place.name, place.category))
              .map((place) => (
                <section key={place.id} className="space-y-3 pb-4">
                  <PlaceRow place={legacyPlace(place)} />
                  {snapshot.wishlists
                    .filter((list) =>
                      list.entries.some(
                        (entry) =>
                          entry.placeId === place.id && entry.saverIds.includes(snapshot.user.id),
                      ),
                    )
                    .map((list) => (
                      <div
                        key={list.id}
                        className="flex flex-wrap items-center justify-between gap-2 pl-3"
                      >
                        <span className="text-sm text-text-secondary">{list.name}</span>
                        <SavePlace placeId={place.id} wishlist={list} />
                      </div>
                    ))}
                </section>
              ))}
          </div>
        ) : (
          <EmptyState
            title="Your next adventure"
            description="Save a place from Discover. Your saved places appear on both web and mobile."
            action={
              <Link href="/discover" className="text-brand underline">
                Discover places
              </Link>
            }
          />
        ))}
      {tab === "sets" && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {snapshot.sets.map((set) => (
            <CatalogSet key={set.id} set={set} visited={setProgress(set, snapshot.collection)} />
          ))}
        </div>
      )}
    </>
  );
}

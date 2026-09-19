"use client";

import Link from "next/link";
import { useState } from "react";
import { FilterRow } from "@/components/ui/filter-chip";
import { EmptyState } from "@/components/ui/empty-state";
import { PlaceRow } from "@/components/ui/place-row";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { UnderlineTabs } from "@/components/ui/underline-tabs";
import type { Place } from "@/lib/schemas";

type CollectionEntry = { place: Place };

export function CollectionContent({ collection }: { collection: CollectionEntry[] }) {
  const [tab, setTab] = useState("been");
  const [view, setView] = useState("list");
  return (
    <div className="space-y-5 px-[18px] pt-3">
      <UnderlineTabs tabs={["been", "want to go", "sets"]} value={tab} onChange={setTab} />
      <SegmentedControl options={["list", "map"]} value={view} onChange={setView} />
      <FilterRow filters={[{ label: "Category ▾" }, { label: "Sort ▾" }]} />
      {view === "map" ? (
        <EmptyState title="Map coming soon" description="Your places will appear here on a map." />
      ) : tab !== "been" ? (
        <EmptyState title="Nothing here yet" description="Save places to build this collection." />
      ) : collection.length === 0 ? (
        <EmptyState
          title="Your collection is waiting"
          description="Capture your first place to start keeping memories."
          action={
            <Link
              href="/capture"
              className="inline-flex min-h-11 items-center rounded-full bg-brand px-5 text-sm font-semibold text-white"
            >
              Capture your first place
            </Link>
          }
        />
      ) : (
        <div>
          {collection.map((entry, index) => (
            <PlaceRow key={entry.place.id} place={entry.place} ordinal={index + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

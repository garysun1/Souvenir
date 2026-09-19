"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { PlaceCard } from "@/components/card/PlaceCard";
import { FilterRow } from "@/components/ui/filter-chip";
import { Input } from "@/components/ui/input";
import { SetCard } from "@/components/ui/set-card";
import type { CollectionSet, Place } from "@/lib/schemas";

export function DiscoverContent({ places, set }: { places: Place[]; set?: CollectionSet }) {
  const [selected, setSelected] = useState<string | null>(null);
  const visiblePlaces = places.filter((place) =>
    selected === "Type" ? place.category === "culture" : true,
  );
  return (
    <div className="space-y-8 px-[18px] pt-5">
      <Input aria-label="Search places or a feeling" placeholder="Search places or a feeling" />
      <FilterRow
        filters={["Nearby", "Free", "Open now", "Type"].map((label) => ({
          label: label === "Type" ? `${label} ▾` : label,
          selected: selected === label,
          onClick: () => setSelected(selected === label ? null : label),
        }))}
      />
      <section className="space-y-3">
        <h1 className="font-serif text-[21px] font-extrabold text-brand">For you</h1>
        <div className="grid grid-cols-2 gap-3">
          {visiblePlaces.map((place) => (
            <PlaceCard key={place.id} place={place} />
          ))}
        </div>
      </section>
      {set && (
        <section className="space-y-3">
          <h2 className="font-serif text-[21px] font-extrabold text-brand">Sets</h2>
          <SetCard set={set} />
        </section>
      )}
      <Link
        href="/plan"
        className="flex min-h-14 items-center justify-between border-b border-t border-divider py-3 text-sm font-semibold text-brand"
      >
        Plan an afternoon <ArrowRight className="size-5" />
      </Link>
    </div>
  );
}

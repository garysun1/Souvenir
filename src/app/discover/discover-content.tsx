"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { PlaceCard } from "@/components/card/PlaceCard";
import { FilterRow } from "@/components/ui/filter-chip";
import { Input } from "@/components/ui/input";
import { PageBody } from "@/components/ui/page";
import { SetCard } from "@/components/ui/set-card";
import type { CollectionSet, Place } from "@/lib/schemas";

export function DiscoverContent({ places, sets }: { places: Place[]; sets: CollectionSet[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  const visiblePlaces = places.filter((place) =>
    selected === "Type" ? place.category === "culture" : true,
  );
  return (
    <PageBody className="space-y-8">
      <div className="lg:flex lg:items-center lg:gap-4">
        <Input
          className="lg:max-w-md"
          aria-label="Search places or a feeling"
          placeholder="Search places or a feeling"
        />
        <div className="mt-3 lg:mt-0">
          <FilterRow
            filters={["Nearby", "Free", "Open now", "Type"].map((label) => ({
              label: label === "Type" ? `${label} ▾` : label,
              selected: selected === label,
              onClick: () => setSelected(selected === label ? null : label),
            }))}
          />
        </div>
      </div>
      <section className="space-y-3">
        <h1 className="font-serif text-[21px] font-extrabold text-brand">For you</h1>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {visiblePlaces.map((place) => (
            <PlaceCard key={place.id} place={place} />
          ))}
        </div>
      </section>
      {sets.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-serif text-[21px] font-extrabold text-brand">Sets</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {sets.map((set) => (
              <SetCard key={set.id} set={set} />
            ))}
          </div>
        </section>
      )}
      <Link
        href="/plan"
        className="flex min-h-14 items-center justify-between border-b border-t border-divider py-3 text-sm font-semibold text-brand lg:hidden"
      >
        Plan an afternoon <ArrowRight className="size-5" />
      </Link>
    </PageBody>
  );
}

"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { PlaceCard } from "@/components/card/PlaceCard";
import { FilterRow } from "@/components/ui/filter-chip";
import { Input } from "@/components/ui/input";
import { PageBody } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { ErrorNotice } from "@/components/account/account-state";
import { useAccount } from "@/components/account/account-provider";
import { CatalogSet } from "@/components/catalog/catalog-set";
import { SavePlace } from "@/components/catalog/save-place";
import { useCatalog } from "@/lib/web/use-catalog";
import { legacyPlace, setProgress } from "@/lib/web/collection";

export function DiscoverContent() {
  const { data, userId, error: accountError } = useAccount();
  const { catalog, error, retry } = useCatalog();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const visiblePlaces = (catalog?.places ?? []).filter(
    (place) =>
      (!selected || place.category === selected) &&
      `${place.name} ${place.city} ${place.description}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  return (
    <PageBody className="space-y-8">
      <div className="flex flex-wrap justify-between gap-3 text-sm">
        <p>Shared catalog · {catalog?.places.length ?? 0} places</p>
        <Link href={userId ? "/profile" : "/login"} className="text-brand underline">
          {userId ? "Your account" : "Sign in / Create account"}
        </Link>
      </div>
      <ErrorNotice message={error ?? accountError} />
      {error && (
        <Button variant="outline" onClick={retry}>
          Retry catalog
        </Button>
      )}
      {!catalog && !error && <p role="status">Loading places…</p>}
      <div className="lg:flex lg:items-center lg:gap-4">
        <Input
          className="lg:max-w-md"
          aria-label="Search places or a feeling"
          placeholder="Search places or a feeling"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <div className="mt-3 lg:mt-0">
          <FilterRow
            filters={["nature", "culture", "food", "landmark", "hidden_gem"].map((label) => ({
              label: label.replace("_", " "),
              selected: selected === label,
              onClick: () => setSelected(selected === label ? null : label),
            }))}
          />
        </div>
      </div>
      <section className="space-y-3">
        <h1 className="font-serif text-[21px] font-extrabold text-brand">Find your next place</h1>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {visiblePlaces.map((place) => (
            <div key={place.id} className="space-y-2">
              <PlaceCard place={legacyPlace(place)} />
              <SavePlace placeId={place.id} />
            </div>
          ))}
        </div>
      </section>
      {catalog && visiblePlaces.length === 0 && (
        <p className="text-sm text-text-secondary">
          No places match these filters. Try another search or clear the category.
        </p>
      )}
      {(catalog?.sets.length ?? 0) > 0 && (
        <section className="space-y-3">
          <h2 className="font-serif text-[21px] font-extrabold text-brand">Sets</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {catalog!.sets.map((set) => (
              <CatalogSet
                key={set.id}
                set={set}
                visited={data ? setProgress(set, data.collection) : null}
              />
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

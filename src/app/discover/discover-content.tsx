"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useState } from "react";
import type { PlaceDto, TrendingDto, NearbyDto } from "../../../shared/api-contract";
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
import { useResource } from "@/lib/web/use-resource";
import { cityOptions, placeLocation } from "@/lib/web/worldwide";
import { ResourceState } from "@/components/catalog/resource-state";
import { Atlas } from "@/components/catalog/atlas";
import { useLocation } from "@/lib/web/use-location";

export function DiscoverContent() {
  const { data, userId, error: accountError } = useAccount();
  const { catalog, error, retry } = useCatalog();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [view, setView] = useState("list");
  const [nearbyMode, setNearbyMode] = useState(false);
  const location = useLocation();
  const validLocality =
    (!country || /^[A-Z]{2}$/.test(country)) && (!city.trim() || /^[A-Z]{2}$/.test(country));
  const query = new URLSearchParams({ limit: "100" });
  if (search.trim()) query.set("q", search.trim());
  if (selected) query.set("category", selected);
  if (city.trim()) query.set("city", city.trim());
  if (country) query.set("country", country);
  const filterKey = query.toString();
  const [page, setPage] = useState<{ filter: string; cursors: (string | null)[] }>({
    filter: "",
    cursors: [null],
  });
  const cursors = page.filter === filterKey ? page.cursors : [null];
  const cursor = cursors[cursors.length - 1];
  if (cursor) query.set("cursor", cursor);
  const results = useResource<PlaceDto[]>(
    validLocality && !nearbyMode ? `/api/places?${query}` : null,
    true,
    250,
  );
  const nearby = useResource<NearbyDto>(
    nearbyMode && location.location
      ? `/api/places/nearby?${new URLSearchParams({ lat: String(location.location.lat), lng: String(location.location.lng), radiusM: "5000", limit: "30", ...(selected ? { category: selected } : {}) })}`
      : null,
  );
  const trends = useResource<TrendingDto>(
    userId && city.trim() && validLocality
      ? `/api/places/trending?${new URLSearchParams({ city: city.trim(), country, limit: "8" })}`
      : null,
    false,
    250,
  );
  const visiblePlaces = nearbyMode
    ? (nearby.data?.places.map((item) => item.place) ?? [])
    : (results.data ?? []);
  return (
    <PageBody className="space-y-8">
      <div className="flex flex-wrap justify-between gap-3 text-sm">
        <p>Discover worldwide</p>
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
      <div className="lg:flex lg:items-center lg:gap-4">
        <Input
          className="lg:max-w-md"
          aria-label="Search destinations"
          placeholder="Search a destination name"
          maxLength={200}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setNearbyMode(false);
          }}
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
      <div className="flex flex-wrap items-end gap-3">
        {userId && (
          <Button
            variant={nearbyMode ? "default" : "outline"}
            disabled={location.locating}
            onClick={() => {
              setNearbyMode(true);
              location.locate();
            }}
          >
            {location.locating ? "Finding location…" : "Nearby"}
          </Button>
        )}
        {nearbyMode && (
          <Button variant="outline" onClick={() => setNearbyMode(false)}>
            Browse worldwide
          </Button>
        )}
        <label className="space-y-1 text-sm">
          <span className="block">Catalog cities</span>
          <select
            aria-label="Catalog cities"
            className="min-h-11 max-w-full rounded-xl border border-border px-3"
            value={JSON.stringify([city, country])}
            onChange={(event) => {
              const match = cityOptions(catalog?.places ?? []).find(
                ([key]) => key === event.target.value,
              );
              setCity(match?.[1].city ?? "");
              setCountry(match?.[1].country ?? "");
              setNearbyMode(false);
            }}
          >
            <option value={JSON.stringify(["", ""])}>Worldwide</option>
            {cityOptions(catalog?.places ?? []).map(([key, item]) => (
              <option key={key} value={key}>
                {item.city}, {item.country}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          City
          <Input
            value={city}
            onChange={(event) => {
              setCity(event.target.value);
              setNearbyMode(false);
            }}
            maxLength={200}
            placeholder="Any city"
          />
        </label>
        <label className="space-y-1 text-sm">
          Country code
          <Input
            value={country}
            onChange={(event) => {
              setCountry(event.target.value.toUpperCase());
              setNearbyMode(false);
            }}
            maxLength={2}
            placeholder="e.g. PT"
            className="w-28"
          />
        </label>
        <Button
          variant="ghost"
          onClick={() => {
            setCity("");
            setCountry("");
            setSearch("");
            setSelected(null);
            setNearbyMode(false);
          }}
        >
          Clear filters
        </Button>
      </div>
      {!validLocality && (
        <p role="status" className="text-sm">
          Choose a two-letter country code with the city.
        </p>
      )}
      {userId && city && validLocality && (
        <section className="space-y-3">
          <h2 className="font-serif text-xl font-bold text-brand">
            Trending in {city}, {country}
          </h2>
          <p className="text-xs text-text-secondary">
            Recent public collectors compared with eight complete weeks. This is activity, not
            personal appeal.
          </p>
          <ResourceState {...trends} label="Loading trends…" />
          {trends.data && !trends.data.places.length && (
            <p className="text-sm">Not enough public activity to show trends here yet.</p>
          )}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {trends.data?.places.map((place) => (
              <div key={place.id} className="flex flex-col gap-2">
                <PlaceCard place={legacyPlace(place)} />
                <p className="text-xs text-text-secondary">
                  {place.metrics?.trend.status === "ready"
                    ? `${place.metrics.trend.collectors7d} public collectors in 7 days`
                    : `Trend ${place.metrics?.trend.status ?? "unavailable"}`}
                </p>
              </div>
            ))}
          </div>
          {trends.data?.computedAt && (
            <p className="text-xs text-text-secondary">
              Souvenir public activity · computed{" "}
              {new Date(trends.data.computedAt).toLocaleString()}
            </p>
          )}
        </section>
      )}
      {!userId && (
        <p className="text-sm">
          <Link className="text-brand underline" href="/login">
            Sign in
          </Link>{" "}
          for city trends and your friends&apos; discoveries.
        </p>
      )}
      <ResourceState {...(nearbyMode ? nearby : results)} label="Searching destinations…" />
      {nearbyMode && (
        <>
          <ErrorNotice message={location.error} />
          <p className="text-sm">
            Nearby results within 5 km.{" "}
            {nearby.data
              ? `Coverage: ${nearby.data.coverage} · source: ${nearby.data.provenance}`
              : ""}
          </p>
        </>
      )}
      <div className="flex gap-2" aria-label="Destination view">
        {["list", "atlas"].map((value) => (
          <Button
            key={value}
            variant={view === value ? "default" : "outline"}
            aria-pressed={view === value}
            onClick={() => setView(value)}
          >
            {value === "list" ? "List" : "Atlas"}
          </Button>
        ))}
      </div>
      {view === "atlas" ? (
        <Atlas places={visiblePlaces} />
      ) : (
        <section className="space-y-3">
          <h1 className="font-serif text-[21px] font-extrabold text-brand">Find your next place</h1>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            {visiblePlaces.map((place) => (
              <div key={place.id} className="flex flex-col gap-2">
                <PlaceCard place={legacyPlace(place)} />
                <p className="text-xs text-text-secondary">{placeLocation(place)}</p>
                <SavePlace placeId={place.id} />
              </div>
            ))}
          </div>
        </section>
      )}
      {!nearbyMode && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs text-text-secondary">
            List and Atlas show this page of up to 100 destinations.
          </p>
          {cursors.length > 1 && (
            <Button
              variant="outline"
              disabled={results.loading}
              onClick={() => setPage({ filter: filterKey, cursors: cursors.slice(0, -1) })}
            >
              Previous destinations
            </Button>
          )}
          {results.nextCursor && (
            <Button
              variant="outline"
              disabled={results.loading}
              onClick={() =>
                setPage({ filter: filterKey, cursors: [...cursors, results.nextCursor] })
              }
            >
              More destinations
            </Button>
          )}
        </div>
      )}
      {(nearbyMode ? nearby.data : results.data) && visiblePlaces.length === 0 && (
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

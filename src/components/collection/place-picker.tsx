"use client";

import { useState } from "react";
import type { PlaceCreate, PlaceDto, NearbyDto } from "../../../shared/api-contract";
import type { SearchResult } from "@/lib/schemas";
import { useAccount } from "@/components/account/account-provider";
import { ErrorNotice } from "@/components/account/account-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResourceState } from "@/components/catalog/resource-state";
import { useResource } from "@/lib/web/use-resource";
import {
  canonicalPlaceId,
  placeLocation,
  privatePlaceCreate,
  type CustomPlaceFields,
} from "@/lib/web/worldwide";
import { ApiError, errorMessage } from "@/lib/web/api";
import { useLocation } from "@/lib/web/use-location";

type PlaceChoice = Pick<PlaceDto, "id" | "slug" | "name" | "city" | "country" | "region">;

export function PlacePicker({
  value,
  onSelect,
  allowNearby = true,
}: {
  value: string;
  onSelect: (place: PlaceChoice) => void;
  allowNearby?: boolean;
}) {
  const { data, request, refresh } = useAccount();
  const [search, setSearch] = useState("");
  const [mode, setMode] = useState("search");
  const [changing, setChanging] = useState(!value);
  const { location, locating, error: locationError, locate } = useLocation();
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<PlaceChoice | null>(null);
  const [created, setCreated] = useState<PlaceDto | null>(null);
  const [pending, setPending] = useState<PlaceCreate | null>(null);
  const [busy, setBusy] = useState(false);
  const [duplicate, setDuplicate] = useState<PlaceDto | null>(null);
  const [fields, setFields] = useState<CustomPlaceFields>({
    name: "",
    category: "nature",
    lat: "",
    lng: "",
    city: "",
    country: "",
  });
  const results = useResource<SearchResult[]>(
    mode === "search"
      ? `/api/places/search?${new URLSearchParams({ ...(search.trim() ? { q: search.trim() } : {}), limit: "30" })}`
      : null,
    false,
    250,
  );
  const nearby = useResource<NearbyDto>(
    mode === "nearby" && location
      ? `/api/places/nearby?${new URLSearchParams({ lat: String(location.lat), lng: String(location.lng), radiusM: "5000", limit: "30" })}`
      : null,
  );
  const selected = picked?.id === value ? picked : data?.places.find((place) => place.id === value);

  function choose(place: PlaceChoice) {
    if (!canonicalPlaceId(place.id)) {
      setError("This destination has no canonical ID. Please refresh and choose again.");
      return;
    }
    setPicked(place);
    setChanging(false);
    onSelect(place);
  }

  async function create() {
    setBusy(true);
    setError(null);
    setDuplicate(null);
    try {
      const body = pending ?? privatePlaceCreate(fields, crypto.randomUUID());
      setPending(body);
      const place = await request<PlaceDto>("/api/places", { method: "POST", body });
      setCreated(place);
      setPending(null);
      await refresh();
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 409) {
        const candidate = failure.details?.existingPlace;
        if (
          candidate &&
          typeof candidate === "object" &&
          "slug" in candidate &&
          typeof candidate.slug === "string"
        ) {
          try {
            setDuplicate(
              await request<PlaceDto>(`/api/places/${encodeURIComponent(candidate.slug)}`),
            );
            setPending(null);
          } catch (lookupError) {
            setError(errorMessage(lookupError));
          }
        }
      }
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  const places =
    mode === "nearby"
      ? nearby.data?.places.map((item) => item.place)
      : results.data?.map((item) => item.place);
  const customPlaces =
    data?.places.filter(
      (place) =>
        place.source === "user" &&
        place.visibility === "private" &&
        `${place.name} ${place.city ?? ""}`.toLowerCase().includes(search.toLowerCase()),
    ) ?? [];
  return (
    <section className="space-y-3 rounded-xl border border-border p-4">
      <h2 className="font-serif text-xl font-bold text-brand">Choose the place you visited</h2>
      <p className="text-sm">
        {selected
          ? `Selected: ${selected.name} · ${placeLocation(selected)}`
          : "No place confirmed yet."}
      </p>
      {value && !canonicalPlaceId(value) && (
        <ErrorNotice message="Mobile demo IDs and slugs cannot be used to capture. Choose a real destination below." />
      )}
      {selected && !changing ? (
        <Button type="button" variant="outline" onClick={() => setChanging(true)}>
          Change place
        </Button>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {(allowNearby ? ["search", "nearby", "custom"] : ["search", "custom"]).map((item) => (
              <Button
                key={item}
                type="button"
                variant={mode === item ? "default" : "outline"}
                aria-pressed={mode === item}
                onClick={() => setMode(item)}
              >
                {item === "custom" ? "Add a place" : item === "nearby" ? "Nearby" : "Search"}
              </Button>
            ))}
          </div>
          <ErrorNotice message={error} />
          {mode === "nearby" && <ErrorNotice message={locationError} />}
          {mode === "search" && (
            <label className="block space-y-1 text-sm">
              Search worldwide
              <Input
                maxLength={200}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Place name or city"
              />
            </label>
          )}
          {mode === "nearby" && (
            <>
              <Button type="button" variant="outline" disabled={locating} onClick={locate}>
                {locating ? "Finding location…" : "Use my location"}
              </Button>
              <p className="text-xs text-text-secondary">
                Within 5 km. Nearby candidates are suggestions; only you can confirm the place.
              </p>
              {nearby.data && (
                <p className="text-xs">
                  Coverage: {nearby.data.coverage} · source: {nearby.data.provenance}
                  {nearby.data.coverage !== "ready"
                    ? " — this area may be incomplete; search or add a place."
                    : ""}
                </p>
              )}
            </>
          )}
          {mode !== "custom" && (
            <>
              <ResourceState {...(mode === "nearby" ? nearby : results)} label="Finding places…" />
              {places?.length === 0 && (
                <p className="text-sm">No matches. Try another name or add a private place.</p>
              )}
              <ul className="max-h-72 space-y-2 overflow-auto">
                {places?.map((place) => (
                  <li key={place.id}>
                    <Button
                      type="button"
                      disabled={busy}
                      variant={value === place.id ? "secondary" : "outline"}
                      className="h-auto w-full justify-between whitespace-normal py-3 text-left"
                      onClick={() => choose(place)}
                    >
                      <span>
                        <span className="block font-serif">{place.name}</span>
                        <span className="block text-xs font-normal">{placeLocation(place)}</span>
                      </span>
                      <span className="ml-2 text-xs">
                        {value === place.id ? "Selected" : "Choose"}
                      </span>
                    </Button>
                  </li>
                ))}
              </ul>
              {mode === "search" && customPlaces.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-serif font-bold text-brand">Your private places</h3>
                  {customPlaces.map((place) => (
                    <Button
                      key={place.id}
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => choose(place)}
                    >
                      Choose {place.name} · {placeLocation(place)}
                    </Button>
                  ))}
                </div>
              )}
            </>
          )}
          {mode === "custom" && (
            <div className="space-y-3">
              <p className="text-sm">
                Creates a private destination. Leave unknown city or country blank. Coordinates must
                be confirmed by you.
              </p>
              {created ? (
                <Button type="button" onClick={() => choose(created)}>
                  Choose {created.name}
                </Button>
              ) : (
                <>
                  <fieldset disabled={busy || Boolean(pending)} className="space-y-3">
                    <label className="block text-sm">
                      Name
                      <Input
                        value={fields.name}
                        onChange={(event) => setFields({ ...fields, name: event.target.value })}
                        maxLength={200}
                      />
                    </label>
                    <label className="block text-sm">
                      Category
                      <select
                        value={fields.category}
                        onChange={(event) =>
                          setFields({
                            ...fields,
                            category: event.target.value as PlaceCreate["category"],
                          })
                        }
                        className="min-h-11 w-full rounded-xl border border-border px-3"
                      >
                        {["nature", "culture", "food", "landmark", "hidden_gem"].map((category) => (
                          <option key={category} value={category}>
                            {category.replace("_", " ")}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      <label className="text-sm">
                        Latitude
                        <Input
                          value={fields.lat}
                          onChange={(event) => setFields({ ...fields, lat: event.target.value })}
                          type="number"
                          step="any"
                          min={-90}
                          max={90}
                        />
                      </label>
                      <label className="text-sm">
                        Longitude
                        <Input
                          value={fields.lng}
                          onChange={(event) => setFields({ ...fields, lng: event.target.value })}
                          type="number"
                          step="any"
                          min={-180}
                          max={180}
                        />
                      </label>
                      <label className="text-sm">
                        City (optional)
                        <Input
                          value={fields.city}
                          onChange={(event) => setFields({ ...fields, city: event.target.value })}
                          maxLength={200}
                        />
                      </label>
                      <label className="text-sm">
                        Country code (optional)
                        <Input
                          value={fields.country}
                          onChange={(event) =>
                            setFields({ ...fields, country: event.target.value })
                          }
                          maxLength={2}
                        />
                      </label>
                    </div>
                  </fieldset>
                  {pending && (
                    <p className="text-xs">
                      Retry keeps the same request and details. Cancel to edit after checking for a
                      saved place.
                    </p>
                  )}
                  <Button type="button" disabled={busy} onClick={() => void create()}>
                    {busy ? "Saving…" : pending ? "Retry creating place" : "Create private place"}
                  </Button>
                  {pending && (
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => setPending(null)}
                    >
                      Cancel pending request
                    </Button>
                  )}
                </>
              )}
              {duplicate && (
                <div className="space-y-2">
                  <p className="text-sm">
                    A similar place exists: {duplicate.name} · {placeLocation(duplicate)}. Review
                    before choosing.
                  </p>
                  <Button type="button" onClick={() => choose(duplicate)}>
                    Choose existing place
                  </Button>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

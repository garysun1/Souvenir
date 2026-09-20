"use client";

import Link from "next/link";
import maplibregl from "maplibre-gl";
import { useEffect, useRef, useState } from "react";
import type { PlaceDto } from "../../../shared/api-contract";
import { mountDestinationMap } from "../../../shared/destination-map";
import { directionsUrl } from "../../../shared/destinations";
import { placeLocation, placePath } from "@/lib/web/worldwide";
import { SavePlace } from "./save-place";
import "maplibre-gl/dist/maplibre-gl.css";

export function Atlas({ places }: { places: PlaceDto[] }) {
  const container = useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = useState<string>();
  const [failed, setFailed] = useState(false);
  const selected = places.find((place) => place.id === selectedId);
  useEffect(() => {
    if (!container.current) return;
    return mountDestinationMap(maplibregl, container.current, places, setSelectedId, () =>
      setFailed(true),
    );
  }, [places]);
  return (
    <section className="space-y-3">
      <h2 className="font-serif text-xl font-bold text-brand">Explore the map</h2>
      <div
        ref={container}
        className="h-96 overflow-hidden rounded-xl border border-border"
        aria-label="Destination map"
      />
      {failed && (
        <p role="status" className="text-sm">
          Map tiles could not load. You can still choose a destination below.
        </p>
      )}
      <p className="text-xs text-text-secondary">
        Select a pin to preview a place. The same destinations are listed below.
      </p>
      {selected && (
        <article className="space-y-3 rounded-xl border border-border p-4" aria-live="polite">
          <Link href={placePath(selected.slug)} className="font-serif text-xl font-bold text-brand">
            {selected.name}
          </Link>
          <p className="text-sm">{selected.description}</p>
          <p className="text-xs text-text-secondary">{placeLocation(selected)}</p>
          <div className="flex flex-wrap items-center gap-4">
            <SavePlace key={selected.id} placeId={selected.id} />
            <Link
              href={`/plan?placeIds=${selected.id}`}
              className="py-3 text-sm text-brand underline"
            >
              Add to a plan
            </Link>
            <a
              href={directionsUrl(selected.lat, selected.lng)}
              target="_blank"
              rel="noreferrer"
              className="py-3 text-sm text-brand underline"
            >
              Directions
            </a>
          </div>
        </article>
      )}
      {!places.length && <p className="text-sm">No destinations to map yet.</p>}
      <ul className="grid gap-2 sm:grid-cols-2">
        {places.map((place) => (
          <li key={place.id}>
            <Link
              href={placePath(place.slug)}
              className="block min-h-11 rounded-lg border border-border p-3"
            >
              <span className="font-serif font-bold text-brand">{place.name}</span>
              <span className="block text-xs text-text-secondary">{placeLocation(place)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

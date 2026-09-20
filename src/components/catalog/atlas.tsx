"use client";

import Link from "next/link";
import type { PlaceDto } from "../../../shared/api-contract";
import { atlasPoints, placeLocation, placePath } from "@/lib/web/worldwide";

export function Atlas({ places }: { places: PlaceDto[] }) {
  const points = atlasPoints(places);
  return (
    <section className="space-y-3">
      <h2 className="font-serif text-xl font-bold text-brand">Atlas</h2>
      <p className="text-xs text-text-secondary">
        World coordinate map · north at the top · select a destination below to open it.
      </p>
      <svg
        viewBox="0 0 960 480"
        role="img"
        aria-label={`${points.length} destinations on a world coordinate map`}
        className="w-full rounded-xl border border-border bg-surface-muted"
      >
        {[-60, -30, 0, 30, 60].map((latitude) => (
          <g key={latitude}>
            <line
              x1="0"
              x2="960"
              y1={((90 - latitude) * 480) / 180}
              y2={((90 - latitude) * 480) / 180}
              stroke="#D7D7D7"
            />
            <text x="5" y={((90 - latitude) * 480) / 180 - 5} fontSize="12" fill="#626262">
              {latitude}°
            </text>
          </g>
        ))}
        {[-120, -60, 0, 60, 120].map((longitude) => (
          <line
            key={longitude}
            x1={((longitude + 180) * 960) / 360}
            x2={((longitude + 180) * 960) / 360}
            y1="0"
            y2="480"
            stroke="#D7D7D7"
          />
        ))}
        {points.map(({ place, x, y }) => (
          <circle key={place.id} cx={x} cy={y} r="6" fill="#144F5D" stroke="white" strokeWidth="2">
            <title>
              {place.name} · {placeLocation(place)} · {place.lat}, {place.lng}
            </title>
          </circle>
        ))}
      </svg>
      {!points.length && <p className="text-sm">No destinations to map yet.</p>}
      <ul className="grid gap-2 sm:grid-cols-2">
        {points.map(({ place }) => (
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

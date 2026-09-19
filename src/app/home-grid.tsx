"use client";

import { useEffect, useState } from "react";
import { PlaceCard } from "@/components/card/PlaceCard";
import type { Place } from "@/lib/schemas";
import { Skeleton } from "@/components/ui/skeleton";

export function HomeGrid() {
  const [places, setPlaces] = useState<Place[] | null>(null);
  useEffect(() => { fetch("/api/places").then((response) => response.json()).then((json: { data: Place[] }) => setPlaces(json.data)); }, []);
  if (!places) return <div className="grid grid-cols-2 gap-3">{Array.from({ length: 6 }).map((_, index) => <Skeleton key={index} className="h-64 rounded-xl" />)}</div>;
  return <div className="grid grid-cols-2 gap-3">{places.map((place) => <PlaceCard key={place.id} place={place} />)}</div>;
}

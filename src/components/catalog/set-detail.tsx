"use client";

import Link from "next/link";
import { useAccount } from "@/components/account/account-provider";
import { ErrorNotice } from "@/components/account/account-state";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PlaceRow } from "@/components/ui/place-row";
import { SavePlace } from "./save-place";
import { useCatalog } from "@/lib/web/use-catalog";
import { legacyPlace, setProgress } from "@/lib/web/collection";

export function SetDetail({ slug }: { slug: string }) {
  const { catalog, error, retry } = useCatalog();
  const { data } = useAccount();
  if (error)
    return (
      <div>
        <ErrorNotice message={error} />
        <Button onClick={retry}>Retry</Button>
      </div>
    );
  if (!catalog) return <p role="status">Loading set…</p>;
  const set = catalog.sets.find((item) => item.slug === slug);
  if (!set)
    return (
      <EmptyState title="Set unavailable" action={<Link href="/discover">Back to Discover</Link>} />
    );
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="font-serif text-3xl font-bold text-brand">{set.name}</h1>
      <p>{set.description}</p>
      <p className="text-sm text-text-secondary">
        {data
          ? `${setProgress(set, data.collection)} of ${set.places.length} places collected`
          : "Sign in to track your progress"}
      </p>
      {set.places.map((place) => (
        <div key={place.id} className="space-y-2">
          <PlaceRow
            place={legacyPlace(place)}
            trailing={
              data?.collection.some((edition) => edition.placeId === place.id) ? (
                <span className="text-sm text-brand">Collected</span>
              ) : null
            }
          />
          <SavePlace placeId={place.id} />
        </div>
      ))}
    </div>
  );
}

"use client";

import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorNotice } from "@/components/account/account-state";
import { useAccount } from "@/components/account/account-provider";
import { SavePlace } from "./save-place";
import { PlacePreferences } from "./place-preferences";
import { useCatalog } from "@/lib/web/use-catalog";

export function PlaceDetail({ slug }: { slug: string }) {
  const { catalog, error, retry } = useCatalog();
  const { data, error: accountError } = useAccount();
  if (error)
    return (
      <div className="space-y-3">
        <ErrorNotice message={error} />
        <Button onClick={retry}>Retry</Button>
      </div>
    );
  if (!catalog) return <p role="status">Loading place…</p>;
  const place = catalog.places.find((item) => item.slug === slug);
  if (!place)
    return (
      <EmptyState
        title="Place unavailable"
        action={<Link href="/discover">Back to Discover</Link>}
      />
    );
  const editions = data?.collection.filter((edition) => edition.placeId === place.id) ?? [];
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <ErrorNotice message={accountError} />
      {place.heroImageUrl && (
        <Image
          src={place.heroImageUrl}
          alt={place.name}
          width={1000}
          height={600}
          unoptimized
          className="max-h-80 w-full rounded-xl object-cover"
        />
      )}
      <h1 className="font-serif text-3xl font-bold text-brand">{place.name}</h1>
      <p className="text-sm capitalize text-text-secondary">
        {place.category.replace("_", " ")} · {place.city}
      </p>
      <p>{place.description}</p>
      <div className="flex flex-wrap gap-2 text-xs text-text-secondary">
        {["Appeal", "Discovery frequency", "Availability"].map((label) => (
          <span key={label} className="rounded-full border border-border px-3 py-2">
            {label}: unavailable
          </span>
        ))}
      </div>
      <p className="text-xs text-text-secondary">
        {place.stats?.provenance === "prototype-catalog" ? "Prototype catalog entry. " : ""}Live
        rarity, opening hours and provider conditions have not been verified.
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <SavePlace placeId={place.id} />
        <Link
          className="inline-flex min-h-11 items-center rounded-full bg-brand px-5 text-sm font-semibold text-white"
          href={`/capture?placeId=${place.id}`}
        >
          {editions.length ? "Capture a revisit" : "Capture a visit"}
        </Link>
      </div>
      {data && (
        <>
          <section className="space-y-2">
            <h2 className="font-serif text-xl font-bold text-brand">
              Your editions ({editions.length})
            </h2>
            {editions.map((edition) => (
              <Link
                key={edition.id}
                href={`/editions/${edition.id}`}
                className="flex min-h-11 items-center justify-between border-b border-divider text-sm"
              >
                <span>Edition {edition.visitSequence}</span>
                <span>
                  {new Date(edition.capturedAt).toLocaleDateString(undefined, {
                    timeZone: edition.timezone,
                  })}
                </span>
              </Link>
            ))}
          </section>
          <PlacePreferences key={place.id} place={place} />
        </>
      )}
    </div>
  );
}

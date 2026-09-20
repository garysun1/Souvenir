"use client";

import Link from "next/link";
import type { PlaceDetailDto, PlaceDto } from "../../../shared/api-contract";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorNotice } from "@/components/account/account-state";
import { useAccount } from "@/components/account/account-provider";
import { SavePlace } from "./save-place";
import { PlacePreferences } from "./place-preferences";
import { useResource } from "@/lib/web/use-resource";
import { placeLocation } from "@/lib/web/worldwide";
import { PlaceSignals } from "./place-signals";
import { PlaceMetadata } from "./place-metadata";
import { PlaceGallery, SourceLink } from "./place-gallery";
import { ResourceState } from "./resource-state";

export function PlaceDetail({ slug }: { slug: string }) {
  const { data, userId, error: accountError } = useAccount();
  const {
    data: place,
    error,
    retry,
    loading,
  } = useResource<PlaceDto | PlaceDetailDto>(`/api/places/${encodeURIComponent(slug)}`, true);
  if (error)
    return (
      <div className="space-y-3">
        <ErrorNotice message={error} />
        <p className="text-sm">The place may no longer be visible to your account.</p>
        <Button onClick={retry}>Retry</Button>
      </div>
    );
  if (!place) return <p role="status">Loading place…</p>;
  const detail = "myNotes" in place ? place : null;
  const editions = data?.collection.filter((edition) => edition.placeId === place.id) ?? [];
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <ErrorNotice message={accountError} />
      <h1 className="font-serif text-3xl font-bold text-brand">{place.name}</h1>
      <p className="text-sm capitalize text-text-secondary">
        {place.category.replace("_", " ")} · {placeLocation(place)}
      </p>
      <p>{place.description}</p>
      {place.website && <SourceLink url={place.website}>Website</SourceLink>}
      <Button variant="outline" onClick={retry}>
        Refresh place
      </Button>
      <ResourceState
        loading={loading}
        error={null}
        retry={retry}
        label="Refreshing place; showing the last loaded sources and activity…"
      />
      {detail ? (
        <PlaceSignals
          place={detail}
          ranking={data?.rankings.find((ranking) => ranking.placeId === place.id)}
        />
      ) : (
        <EmptyState
          title="More with your account"
          description="Sign in to see documented sources, activity signals and notes visible to you."
          action={
            <Link href="/login" className="text-brand underline">
              Sign in
            </Link>
          }
        />
      )}
      <div className="flex flex-wrap items-center gap-4">
        <SavePlace placeId={place.id} sharing onSaved={retry} />
        <Link
          href={`/plan?placeIds=${place.id}`}
          className="inline-flex min-h-11 items-center rounded-full border border-border px-5 text-sm font-semibold text-brand"
        >
          Add to a plan
        </Link>
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
          <PlacePreferences key={place.id} place={place} onSaved={retry} />
        </>
      )}
      {userId && detail && (
        <>
          <PlaceGallery place={detail} refresh={retry} />
          <PlaceMetadata place={detail} refresh={retry} />
        </>
      )}
    </div>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";
import type { TasteComparisonDto, TasteSharedProfileDto } from "../../../shared/memories-contract";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ResourceState } from "@/components/catalog/resource-state";
import { SavePlace } from "@/components/catalog/save-place";
import { MemoryPhoto } from "@/components/memories/memory-photo";
import { MemorySection } from "@/components/memories/memory-ui";
import { useMemoryResource } from "@/components/memories/memory-state";
import { interestLabel } from "@/components/memories/memory-model";

export function TasteTogether({ userId }: { userId: string }) {
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [area, setArea] = useState("");
  const shared = useMemoryResource<TasteSharedProfileDto>(`/api/users/${userId}/taste`);
  const comparison = useMemoryResource<TasteComparisonDto>(
    `/api/users/${userId}/taste-comparison${area}`,
  );
  return (
    <MemorySection title="You together">
      <p className="text-sm text-text-secondary">
        Common ground from interests you both chose to share with accepted friends. Private drafts,
        photo evidence and ratings are not used for this comparison.
      </p>
      <ResourceState {...shared} label="Checking shared portrait access…" />
      <ResourceState {...comparison} label="Comparing approved interests…" />
      {(shared.error || comparison.error) && (
        <p className="text-sm">
          Comparisons require an accepted friendship and a published friends portrait from both
          people.
          <Link href="/profile#taste" className="ml-1 text-brand underline">
            Review your sharing
          </Link>
        </p>
      )}
      {!shared.loading && !shared.error && shared.data && (
        <div className="space-y-3">
          <h3 className="font-serif text-lg font-bold text-brand">
            {shared.data.published.title ?? "Shared interests"}
          </h3>
          <ul className="flex flex-wrap gap-2">
            {shared.data.published.facets.map((facet) => (
              <li
                key={`${facet.interest}:${facet.intent}`}
                className="rounded-full border border-border px-3 py-2 text-sm"
              >
                {interestLabel(facet.interest)} ·{" "}
                {facet.intent === "enjoyed" ? "enjoyed" : "want to try"} · {facet.strength}/3
              </li>
            ))}
          </ul>
          {shared.data.published.collageMomentIds.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {shared.data.published.collageMomentIds.map((id) => (
                <MemoryPhoto
                  key={id}
                  path={`/api/moments/${id}/photo`}
                  alt="A photo explicitly shared in this taste portrait"
                />
              ))}
            </div>
          )}
        </div>
      )}
      {!comparison.loading && !comparison.error && comparison.data && (
        <>
          <ComparisonSummary comparison={comparison.data} />
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const params = new URLSearchParams();
              if (city.trim()) params.set("city", city.trim());
              if (country.trim()) params.set("country", country.trim().toUpperCase());
              setArea(params.size ? `?${params}` : "");
              comparison.retry();
            }}
          >
            <label className="min-w-0 flex-1 text-sm">
              City for places to try
              <Input
                maxLength={200}
                value={city}
                onChange={(event) => setCity(event.target.value)}
                placeholder="Any city"
              />
            </label>
            <label className="text-sm">
              Country code
              <Input
                maxLength={2}
                pattern="[A-Za-z]{2}"
                required={Boolean(city.trim())}
                value={country}
                onChange={(event) => setCountry(event.target.value)}
                placeholder="PT"
                className="w-24"
              />
            </label>
            <Button type="submit" variant="outline">
              Find common ground
            </Button>
          </form>
          <h3 className="font-serif text-lg font-bold text-brand">Places to try together</h3>
          {!comparison.data.suggestions.length && (
            <p className="text-sm">
              No matching catalog suggestions in this area yet. Try another city or add more
              approved interests.
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {comparison.data.suggestions.map(({ place, matchedInterests, reason }) => (
              <article key={place.id} className="space-y-3 rounded-xl border border-border p-4">
                <Link
                  href={`/places/${place.slug}`}
                  className="font-serif text-lg font-bold text-brand underline"
                >
                  {place.name}
                </Link>
                <p className="text-xs text-text-secondary">
                  {[place.city, place.country].filter(Boolean).join(", ") || "Area not documented"}
                </p>
                <p className="text-sm">{reason}</p>
                <p className="text-xs">Matches: {matchedInterests.map(interestLabel).join(", ")}</p>
                <p className="text-xs text-text-secondary">
                  Check the place page for documented hours, cost and availability. A suggestion
                  does not confirm opening times or bookings.
                </p>
                <SavePlace placeId={place.id} />
                <Link
                  href={`/plan?placeIds=${place.id}`}
                  className="inline-flex min-h-11 items-center text-sm text-brand underline"
                >
                  Plan a visit
                </Link>
              </article>
            ))}
          </div>
        </>
      )}
    </MemorySection>
  );
}

export function ComparisonSummary({ comparison }: { comparison: TasteComparisonDto }) {
  return (
    <div className="space-y-2 rounded-xl bg-surface-muted p-4">
      <h3 className="font-serif text-xl font-bold text-brand">
        {comparison.commonInterests.length
          ? `Your common ground: ${comparison.commonInterests.map(interestLabel).join(" and ")}`
          : "Still finding your common ground"}
      </h3>
      <p className="text-sm">{comparison.explanation}</p>
      <p className="text-xs text-text-secondary">
        Approved-interest coverage: {comparison.coverage === "ready" ? "ready" : "insufficient"} ·
        {comparison.overlap === "insufficient"
          ? " More approved interests needed"
          : ` Overlap: ${comparison.overlap}`}{" "}
        · definition v{comparison.definitionVersion}. Coverage reflects the shared facets, not
        friendship quality.
      </p>
    </div>
  );
}

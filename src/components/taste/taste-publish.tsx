"use client";

import { useState } from "react";
import type {
  MemoryMomentDto,
  TasteProfileDto,
  TastePublishRequest,
} from "../../../shared/memories-contract";
import { useAccount } from "@/components/account/account-provider";
import { ResourceState } from "@/components/catalog/resource-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MemoryPhoto } from "@/components/memories/memory-photo";
import { useMemoryAction, useMemoryPage } from "@/components/memories/memory-state";
import { ActionNotice, MemoryPager, MemorySection } from "@/components/memories/memory-ui";
import { interestLabel } from "@/components/memories/memory-model";

const facetKey = (facet: { interest: string; intent: string }) =>
  `${facet.interest}:${facet.intent}`;

export function TastePublish({ profile }: { profile: TasteProfileDto }) {
  const [title, setTitle] = useState(profile.titleOverride ?? profile.draft?.title ?? "");
  const [approved, setApproved] = useState<string[]>([]);
  const [collage, setCollage] = useState<string[]>(profile.collageMomentIds);
  const [consent, setConsent] = useState(false);
  const [mediaConsent, setMediaConsent] = useState(false);
  const action = useMemoryAction();
  const moments = useMemoryPage<MemoryMomentDto>("/api/moments");
  const { data, userId } = useAccount();
  const facets = profile.draft?.facets ?? [];
  const selectedFacets = facets.filter((facet) => approved.includes(facetKey(facet)));

  async function publish() {
    const body: TastePublishRequest = {
      expectedVersion: profile.version,
      sharing: "friends",
      title: title.trim() || null,
      facets: selectedFacets.map(({ interest, intent, strength }) => ({
        interest,
        intent,
        strength,
      })),
      collageMomentIds: collage,
      confirmShare: true,
    };
    await action.run(
      "/api/taste/publish",
      { method: "POST", body },
      "Approved portrait shared with accepted friends.",
    );
  }
  return (
    <MemorySection title="Choose what friends see">
      <p className="text-sm text-text-secondary">
        Your draft, evidence, notes, private preferences and source metadata stay private. Only the
        title, checked interests and separately approved collage below will be published.
      </p>
      <fieldset disabled={action.busy} className="space-y-3">
        <label className="block space-y-1 text-sm">
          Published title (optional)
          <Input
            value={title}
            maxLength={120}
            onChange={(event) => {
              setTitle(event.target.value);
              setConsent(false);
            }}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          {facets.map((facet) => (
            <label
              key={facetKey(facet)}
              className="flex min-h-11 items-center gap-2 rounded-full border border-border px-3 text-sm"
            >
              <input
                type="checkbox"
                checked={approved.includes(facetKey(facet))}
                onChange={(event) => {
                  setConsent(false);
                  setApproved(
                    event.target.checked
                      ? [...approved, facetKey(facet)]
                      : approved.filter((key) => key !== facetKey(facet)),
                  );
                }}
              />
              {interestLabel(facet.interest)} ·{" "}
              {facet.intent === "enjoyed" ? "enjoyed" : "want to try"}
            </label>
          ))}
        </div>
        {!facets.length && (
          <p className="text-sm">Add manual interests or refresh a private draft first.</p>
        )}
        <details>
          <summary className="min-h-11 cursor-pointer py-3 font-semibold text-brand">
            Collage · {collage.length}/6 photos selected
          </summary>
          <p className="mb-3 text-sm">
            Select only moments you authored. Publishing grants accepted friends access to these
            moments and their photos separately from your interests. Uncheck a photo to revoke it in
            the next publication.
          </p>
          <ResourceState {...moments} label="Loading your authored moments…" />
          <div className="grid gap-3 sm:grid-cols-2">
            {moments.data?.items
              .filter((moment) => moment.authorId === userId)
              .map((moment) => (
                <div
                  key={moment.id}
                  className="space-y-2 rounded-xl border border-border p-3 text-sm"
                >
                  <MemoryPhoto
                    path={`/api/moments/${moment.id}/photo`}
                    alt="Your possible collage photo"
                  />
                  <label className="flex min-h-11 items-center gap-2">
                    <input
                      type="checkbox"
                      checked={collage.includes(moment.id)}
                      disabled={!collage.includes(moment.id) && collage.length >= 6}
                      onChange={(event) => {
                        setMediaConsent(false);
                        setCollage(
                          event.target.checked
                            ? [...collage, moment.id]
                            : collage.filter((id) => id !== moment.id),
                        );
                      }}
                    />
                    {data?.places.find((place) => place.id === moment.confirmedStop?.placeId)
                      ?.name ?? "Unresolved memory"}
                  </label>
                </div>
              ))}
          </div>
          <MemoryPager {...moments} />
          {collage.length > 0 && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setCollage([]);
                setMediaConsent(false);
              }}
            >
              Clear collage selection
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              void action.run(
                "/api/taste",
                {
                  method: "PATCH",
                  body: { expectedVersion: profile.version, collageMomentIds: collage },
                },
                "Private collage selection saved. Publish separately to share it.",
              )
            }
          >
            Save private collage selection
          </Button>
        </details>
        <div className="rounded-xl bg-surface-muted p-4">
          <h3 className="font-serif font-bold text-brand">Publication preview</h3>
          <p className="mt-2 font-serif">{title.trim() || "No title"}</p>
          <p className="mt-1 text-sm">
            {selectedFacets
              .map(
                (facet) =>
                  `${interestLabel(facet.interest)} (${facet.intent === "enjoyed" ? "enjoyed" : "want to try"})`,
              )
              .join(" · ") || "No interests selected"}
          </p>
          <p className="mt-1 text-xs">{collage.length} selected collage moments</p>
          {collage.length > 0 && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              {collage.map((id) => (
                <MemoryPhoto
                  key={id}
                  path={`/api/moments/${id}/photo`}
                  alt="Selected publication collage photo"
                />
              ))}
            </div>
          )}
        </div>
        <label className="flex min-h-11 items-start gap-3 text-sm">
          <input
            className="mt-1"
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
          />
          I approve this title and these interests for accepted friends.
        </label>
        {collage.length > 0 && (
          <label className="flex min-h-11 items-start gap-3 text-sm">
            <input
              className="mt-1"
              type="checkbox"
              checked={mediaConsent}
              onChange={(event) => setMediaConsent(event.target.checked)}
            />
            I separately approve sharing the {collage.length} selected collage moments and photos.
          </label>
        )}
        <ActionNotice {...action} />
        <Button
          type="button"
          disabled={!consent || (collage.length > 0 && !mediaConsent)}
          onClick={() => void publish()}
        >
          Publish approved portrait
        </Button>
      </fieldset>
      {profile.sharing === "friends" && (
        <>
          <p className="text-xs text-text-secondary">
            Already downloaded photos cannot be recalled. Making your portrait private stops new
            portrait and collage access.
          </p>
          <Button
            variant="outline"
            disabled={action.busy}
            onClick={() =>
              void action.run(
                "/api/taste/publish",
                {
                  method: "POST",
                  body: {
                    expectedVersion: profile.version,
                    sharing: "private",
                    title: null,
                    facets: [],
                    collageMomentIds: [],
                    confirmShare: false,
                  } satisfies TastePublishRequest,
                },
                "Portrait is private. Friends can no longer load it.",
              )
            }
          >
            Make portrait private now
          </Button>
        </>
      )}
    </MemorySection>
  );
}

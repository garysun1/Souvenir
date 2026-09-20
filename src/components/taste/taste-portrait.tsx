"use client";

import { useEffect, useState } from "react";
import type {
  TasteProfileDto,
  TasteProfilePatch,
  TasteOverride,
  TastePreferences,
  TasteSourceRef,
  TasteAnalyzeRequest,
} from "../../../shared/memories-contract";
import { MEMORY_LIMITS, TASTE_INTERESTS } from "../../../shared/memories-contract";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResourceState } from "@/components/catalog/resource-state";
import { useAccount } from "@/components/account/account-provider";
import { useMemoryAction, useMemoryResource } from "@/components/memories/memory-state";
import {
  ActionNotice,
  ConfirmDelete,
  fieldClass,
  MemorySection,
} from "@/components/memories/memory-ui";
import {
  availableTasteSources,
  interestLabel,
  sourceKey,
} from "@/components/memories/memory-model";
import { TasteSources } from "./taste-sources";
import { TastePublish } from "./taste-publish";

export function TastePortrait() {
  const resource = useMemoryResource<TasteProfileDto>("/api/taste");
  useEffect(() => {
    if (resource.data?.analysisState !== "processing") return;
    const timer = window.setInterval(resource.retry, 5000);
    return () => window.clearInterval(timer);
  }, [resource.data?.analysisState, resource.retry]);
  return (
    <section id="taste" className="scroll-mt-20 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-serif text-2xl font-bold text-brand">Your taste portrait</h2>
        <Button variant="outline" disabled={resource.loading} onClick={resource.retry}>
          Reload portrait
        </Button>
      </div>
      <ResourceState {...resource} label="Loading your private portrait…" />
      {resource.data && <PortraitEditor key={resource.data.version} profile={resource.data} />}
    </section>
  );
}

function PortraitEditor({ profile }: { profile: TasteProfileDto }) {
  const action = useMemoryAction();
  const { data } = useAccount();
  const choices = availableTasteSources(data!);
  const [title, setTitle] = useState(profile.titleOverride ?? profile.draft?.title ?? "");
  const [sources, setSources] = useState<TasteSourceRef[]>(
    profile.selectedSources.filter(
      (source) =>
        !profile.excludedSources.some((excluded) => sourceKey(excluded) === sourceKey(source)),
    ),
  );
  const [consent, setConsent] = useState(false);
  const [note, setNote] = useState("");
  const [interest, setInterest] = useState<TasteOverride["interest"]>("gardens");
  const [intent, setIntent] = useState<TasteOverride["intent"]>("enjoyed");
  const [strength, setStrength] = useState<TasteOverride["strength"]>(2);
  const [preferences, setPreferences] = useState(profile.preferences);
  const sourceName = (source: TasteSourceRef) =>
    choices.find((choice) => sourceKey(choice.source) === sourceKey(source))?.label ??
    `${source.kind.replaceAll("_", " ")} · ${source.id.slice(0, 8)}`;
  const canOverride = (interest: TasteOverride["interest"], intent: TasteOverride["intent"]) =>
    profile.overrides.length < MEMORY_LIMITS.interests ||
    profile.overrides.some((item) => item.interest === interest && item.intent === intent);
  const patch = (body: Omit<TasteProfilePatch, "expectedVersion">, message?: string) =>
    action.run<TasteProfileDto>(
      "/api/taste",
      {
        method: "PATCH",
        body: { ...body, expectedVersion: profile.version },
      },
      message,
    );
  async function override(value: TasteOverride) {
    await patch(
      {
        overrides: [
          ...profile.overrides.filter(
            (item) => !(item.interest === value.interest && item.intent === value.intent),
          ),
          value,
        ],
      },
      "Manual choice saved. It takes priority over future inference.",
    );
  }
  return (
    <div className="space-y-4">
      <MemorySection
        title={profile.titleOverride ?? profile.draft?.title ?? "Still learning your taste"}
      >
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-surface-muted px-3 py-2">
            Private draft · only you see its evidence
          </span>
          <span className="rounded-full border border-border px-3 py-2">
            Published portrait: {profile.sharing === "friends" ? "accepted friends" : "private"}
          </span>
        </div>
        <p className="text-sm text-text-secondary">
          {profile.draft?.coverage === "ready"
            ? "Suggestions from your selected sources. Confirm or correct them before sharing."
            : "Still learning your taste. Choose a few interests yourself, or select meaningful sources below."}{" "}
          Analysis: {profile.analysisState}.
        </p>
        <div className="space-y-3">
          {profile.draft?.facets.map((facet) => (
            <article
              key={`${facet.interest}:${facet.intent}`}
              className="space-y-2 rounded-xl border border-border p-3"
            >
              <p className="font-serif font-bold text-brand">
                {interestLabel(facet.interest)}
                <span className="ml-2 font-sans text-xs font-normal">
                  {facet.intent === "enjoyed" ? "enjoyed" : "want to try"} · strength{" "}
                  {facet.strength}/3
                </span>
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  disabled={action.busy || !canOverride(facet.interest, facet.intent)}
                  onClick={() =>
                    void override({
                      interest: facet.interest,
                      intent: facet.intent,
                      strength: facet.strength,
                      action: "prefer",
                    })
                  }
                >
                  Confirm interest
                </Button>
                <Button
                  variant="ghost"
                  disabled={action.busy || !canOverride(facet.interest, facet.intent)}
                  onClick={() =>
                    void override({
                      interest: facet.interest,
                      intent: facet.intent,
                      strength: facet.strength,
                      action: "dismiss",
                    })
                  }
                >
                  Dismiss suggestion
                </Button>
              </div>
              <details>
                <summary className="min-h-11 cursor-pointer py-3 text-sm text-brand">
                  Why this appeared · only you
                </summary>
                <ul className="space-y-3">
                  {profile.evidence
                    .filter(
                      (evidence) => facet.evidenceIds.includes(evidence.id) && !evidence.excluded,
                    )
                    .map((evidence) => (
                      <li key={evidence.id} className="text-sm">
                        <p>{evidence.explanation}</p>
                        <p className="text-xs text-text-secondary">
                          {sourceName(evidence.source)} · observation confidence{" "}
                          {Math.round(evidence.confidence * 100)}%, not a rating of your enjoyment
                        </p>
                        <Button
                          variant="ghost"
                          disabled={action.busy}
                          onClick={() =>
                            void patch(
                              {
                                excludedSources: [
                                  ...profile.excludedSources,
                                  evidence.source,
                                ].filter(
                                  (item, index, all) =>
                                    all.findIndex(
                                      (other) => sourceKey(other) === sourceKey(item),
                                    ) === index,
                                ),
                              },
                              "Source excluded. Its derived evidence is no longer used.",
                            )
                          }
                        >
                          Exclude this source
                        </Button>
                      </li>
                    ))}
                  {!facet.evidenceIds.length && (
                    <li className="text-sm">Your explicit choice; no photo evidence needed.</li>
                  )}
                </ul>
              </details>
            </article>
          ))}
        </div>
        <label className="block space-y-1 text-sm">
          Your own title
          <Input maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={action.busy || !title.trim()}
            onClick={() => void patch({ titleOverride: title.trim() })}
          >
            Save my title
          </Button>
          <Button
            variant="outline"
            disabled={action.busy}
            onClick={() => void patch({ titleOverride: null })}
          >
            Use generated title
          </Button>
        </div>
      </MemorySection>
      <details className="rounded-2xl border border-border p-4">
        <summary className="min-h-11 cursor-pointer py-3 font-serif text-xl font-bold text-brand">
          Choose & correct interests
        </summary>
        <fieldset disabled={action.busy} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-sm">
              Interest
              <select
                className={fieldClass}
                value={interest}
                onChange={(event) => setInterest(event.target.value as TasteOverride["interest"])}
              >
                {TASTE_INTERESTS.map((interest) => (
                  <option key={interest} value={interest}>
                    {interestLabel(interest)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              What it means to you
              <select
                className={fieldClass}
                value={intent}
                onChange={(event) => setIntent(event.target.value as TasteOverride["intent"])}
              >
                <option value="enjoyed">Enjoyed visiting</option>
                <option value="want_to_try">Want to try</option>
              </select>
            </label>
            <label className="text-sm">
              Strength
              <select
                className={fieldClass}
                value={strength}
                onChange={(event) =>
                  setStrength(Number(event.target.value) as TasteOverride["strength"])
                }
              >
                <option value={1}>A little</option>
                <option value={2}>Interested</option>
                <option value={3}>A favorite</option>
              </select>
            </label>
          </div>
          {profile.overrides.length >= MEMORY_LIMITS.interests && (
            <p className="text-sm">
              Your {MEMORY_LIMITS.interests} manual choices are saved. Remove an override before
              adding a new interest.
            </p>
          )}
          <Button
            disabled={!canOverride(interest, intent)}
            onClick={() => void override({ interest, intent, strength, action: "prefer" })}
          >
            Save explicit interest
          </Button>
          <ul className="space-y-2">
            {profile.overrides.map((item) => (
              <li
                key={`${item.interest}:${item.intent}`}
                className="flex flex-wrap items-center gap-2 text-sm"
              >
                <span>
                  {interestLabel(item.interest)} ·{" "}
                  {item.intent === "enjoyed" ? "enjoyed" : "want to try"} ·
                  {item.action === "dismiss" ? " dismissed" : ` preferred (${item.strength}/3)`}
                </span>
                <Button
                  variant="ghost"
                  onClick={() =>
                    void patch(
                      {
                        overrides: profile.overrides.filter((value) => value !== item),
                      },
                      "Override removed. Future refreshes may suggest this interest again.",
                    )
                  }
                >
                  Remove override
                </Button>
              </li>
            ))}
          </ul>
        </fieldset>
      </details>
      <details className="rounded-2xl border border-border p-4">
        <summary className="min-h-11 cursor-pointer py-3 font-serif text-xl font-bold text-brand">
          Private travel preferences
        </summary>
        <p className="mb-3 text-sm text-text-secondary">
          Only your explicit choices. These are never inferred from photos or published in your
          taste portrait.
        </p>
        <fieldset className="space-y-3" disabled={action.busy}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">
              Pace
              <select
                className={fieldClass}
                value={preferences.pace ?? ""}
                onChange={(event) =>
                  setPreferences({
                    ...preferences,
                    pace: (event.target.value || null) as TastePreferences["pace"],
                  })
                }
              >
                <option value="">No preference</option>
                <option value="relaxed">Relaxed</option>
                <option value="balanced">Balanced</option>
                <option value="busy">Busy</option>
              </select>
            </label>
            <label className="text-sm">
              Budget
              <select
                className={fieldClass}
                value={preferences.budget ?? ""}
                onChange={(event) =>
                  setPreferences({
                    ...preferences,
                    budget: (event.target.value || null) as TastePreferences["budget"],
                  })
                }
              >
                <option value="">No preference</option>
                <option value="free">Free</option>
                <option value="moderate">Moderate</option>
                <option value="flexible">Flexible</option>
              </select>
            </label>
          </div>
          <label className="block text-sm">
            Accessibility needs (optional, private)
            <Input
              maxLength={500}
              value={preferences.accessibility ?? ""}
              onChange={(event) =>
                setPreferences({ ...preferences, accessibility: event.target.value || null })
              }
            />
          </label>
          <Button onClick={() => void patch({ preferences })}>Save preferences</Button>
        </fieldset>
      </details>
      <MemorySection title="Refresh my private portrait">
        <TasteSources
          selected={sources}
          excluded={profile.excludedSources}
          onChange={(sources) => {
            setSources(sources);
            setConsent(false);
          }}
          disabled={action.busy}
        />
        <label className="block space-y-1 text-sm">
          Optional context (not published)
          <textarea
            className={`${fieldClass} min-h-24 py-3`}
            maxLength={2000}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="What did you enjoy or want to try?"
          />
        </label>
        <label className="flex min-h-11 items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
          />
          Allow the configured AI provider to analyze images in these selected sources. Without
          permission, visits use existing text/place facts only. Imported photos require permission.
        </label>
        <p className="text-xs text-text-secondary">
          No personality, sensitive traits, face identities or emotions are inferred. You control
          the result; manual corrections survive refreshes.
        </p>
        <Button
          disabled={
            action.busy ||
            (!sources.length && !note.trim()) ||
            (!consent && sources.some((source) => source.kind === "import_item"))
          }
          onClick={async () => {
            const body: Omit<TasteAnalyzeRequest, "requestId"> = {
              expectedVersion: profile.version,
              sources,
              consentImages: consent,
              ...(note.trim() ? { note: note.trim() } : {}),
            };
            await action.post<TasteProfileDto>(
              "/api/taste/analyze",
              body,
              "Private analysis saved. Review before publishing.",
            );
          }}
        >
          Refresh my profile
        </Button>
        {profile.excludedSources.length > 0 && (
          <details>
            <summary className="min-h-11 cursor-pointer py-3 text-sm text-brand">
              Excluded sources ({profile.excludedSources.length})
            </summary>
            {profile.excludedSources.map((source) => (
              <div key={sourceKey(source)} className="flex flex-wrap items-center gap-2 text-sm">
                <span>{sourceName(source)}</span>
                <Button
                  variant="ghost"
                  disabled={action.busy}
                  onClick={() =>
                    void patch(
                      {
                        excludedSources: profile.excludedSources.filter(
                          (item) => sourceKey(item) !== sourceKey(source),
                        ),
                      },
                      "Source restored. Select it explicitly for the next refresh.",
                    )
                  }
                >
                  Allow this source again
                </Button>
              </div>
            ))}
          </details>
        )}
      </MemorySection>
      <ActionNotice {...action} />
      <TastePublish profile={profile} />
      <ConfirmDelete
        label="Delete taste profile"
        busy={action.busy}
        description="Removes your analysis, evidence, overrides and all profile-derived sharing. Original visits and photos remain."
        onConfirm={async () => {
          await action.run(
            "/api/taste",
            {
              method: "DELETE",
              body: { expectedVersion: profile.version },
            },
            "Taste profile and its sharing deleted.",
          );
        }}
      />
    </div>
  );
}

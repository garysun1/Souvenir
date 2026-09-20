"use client";

import { useState, type FormEvent } from "react";
import type {
  PlaceDto,
  PlacePreferencePut,
  RankingPut,
  Sentiment,
} from "../../../shared/api-contract";
import { useAccount } from "@/components/account/account-provider";
import { ErrorNotice } from "@/components/account/account-state";
import { Button } from "@/components/ui/button";
import { errorMessage } from "@/lib/web/api";
import { rankingInput } from "@/lib/web/ranking";

export function PlacePreferences({ place }: { place: PlaceDto }) {
  const { data, mutate } = useAccount();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const current = data?.placePreferences.find((item) => item.placeId === place.id);
  const assessment = data?.rankings.find((item) => item.placeId === place.id);
  const [sentiment, setSentiment] = useState<Sentiment>(assessment?.sentiment ?? "recommend");
  const [reference, setReference] = useState("");
  const [position, setPosition] = useState<"before" | "after" | "tie">("before");
  if (!data) return null;
  const visited = data.collection.some((edition) => edition.placeId === place.id);
  const comparisonIds =
    data.rankingGroups.find(
      (group) => group.category === place.category && group.sentiment === sentiment,
    )?.placeIds ?? [];
  async function updatePreference(body: PlacePreferencePut) {
    setBusy(true);
    setError(null);
    setMessage("");
    try {
      await mutate(`/api/me/places/${place.id}`, { method: "PUT", body });
      setMessage("Preference saved.");
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  async function rank(unranked: boolean) {
    if (!data) return;
    setBusy(true);
    setError(null);
    setMessage("");
    try {
      const body: RankingPut = unranked
        ? { sentiment, ranking: "unranked" }
        : rankingInput(
            place.id,
            place.category,
            sentiment,
            data.rankingGroups,
            reference,
            position,
          );
      await mutate(`/api/rankings/${place.id}`, { method: "PUT", body });
      setMessage(unranked ? "Recommendation saved without a rank." : "Ranking saved.");
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  function saveTip(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void updatePreference({ tip: String(new FormData(event.currentTarget).get("tip")).trim() });
  }
  return (
    <section className="space-y-4 rounded-xl border border-border p-4">
      <h2 className="font-serif text-xl font-bold text-brand">Only you</h2>
      <ErrorNotice message={error} />
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
      <Button
        variant="outline"
        disabled={busy}
        onClick={() => void updatePreference({ favorite: !current?.favorite })}
      >
        {current?.favorite ? "Remove favorite" : "Favorite this place"}
      </Button>
      <form onSubmit={saveTip} className="space-y-2">
        <label className="block space-y-2 text-sm">
          Private tip
          <textarea
            key={current?.tip ?? ""}
            name="tip"
            maxLength={280}
            defaultValue={current?.tip ?? ""}
            className="min-h-20 w-full rounded-xl border border-border p-3"
          />
        </label>
        <Button type="submit" variant="outline" disabled={busy}>
          Save tip
        </Button>
      </form>
      {visited && (
        <div className="space-y-3 border-t border-divider pt-4">
          <h3 className="font-serif text-lg font-bold">Would you recommend it?</h3>
          {assessment && (
            <p className="text-sm text-text-secondary">
              Saved: {assessment.sentiment} · {assessment.ranking}
              {assessment.rankScore === null ? "" : ` · ${assessment.rankScore.toFixed(1)}`}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {(["recommend", "depends", "skip"] as const).map((value) => (
              <Button
                key={value}
                variant={sentiment === value ? "default" : "outline"}
                aria-pressed={sentiment === value}
                disabled={busy}
                onClick={() => {
                  setSentiment(value);
                  setReference("");
                }}
              >
                {value === "recommend"
                  ? "Recommend"
                  : value === "depends"
                    ? "It depends"
                    : "Would skip"}
              </Button>
            ))}
          </div>
          <label className="block space-y-2 text-sm">
            Compare in {place.category.replace("_", " ")}
            <select
              className="min-h-11 w-full rounded-xl border border-border px-3"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
            >
              <option value="">Add to end of this recommendation group</option>
              {data.places
                .filter((item) => item.id !== place.id && comparisonIds.includes(item.id))
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
            </select>
          </label>
          {reference && (
            <label className="block space-y-2 text-sm">
              Your preference
              <select
                value={position}
                onChange={(event) => setPosition(event.target.value as "before" | "after" | "tie")}
                className="min-h-11 rounded-xl border border-border px-3"
              >
                <option value="before">Prefer this place</option>
                <option value="after">Prefer the other place</option>
                <option value="tie">Too close — tie</option>
              </select>
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} onClick={() => void rank(false)}>
              Save ranking
            </Button>
            <Button disabled={busy} variant="ghost" onClick={() => void rank(true)}>
              Skip ranking, save sentiment
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

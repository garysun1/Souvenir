"use client";

import Link from "next/link";
import { useState } from "react";
import type { LeaderboardDto, LeaderboardQuery } from "../../../shared/api-contract";
import { AccountRequired } from "@/components/account/account-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResourceState } from "@/components/catalog/resource-state";
import { useResource } from "@/lib/web/use-resource";

export function Leaderboard() {
  return (
    <AccountRequired>
      <Board />
    </AccountRequired>
  );
}

function Board() {
  const [scope, setScope] = useState<LeaderboardQuery["scope"]>("friends");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [offset, setOffset] = useState(0);
  const valid = scope !== "city" || Boolean(city.trim() && /^[A-Z]{2}$/.test(country));
  const resource = useResource<LeaderboardDto>(
    valid
      ? `/api/leaderboard?${new URLSearchParams({ scope, limit: "20", offset: String(offset), ...(scope === "city" ? { city: city.trim(), country } : {}) })}`
      : null,
    false,
    250,
  );
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="font-serif text-3xl font-bold text-brand">Places explored</h1>
      <p className="text-sm text-text-secondary">
        Ranked by distinct places, with ties sharing a rank. Friends include activity and statistics
        visible to you. City and global boards use public activity and public statistics.
      </p>
      <div className="flex flex-wrap gap-2">
        {(["friends", "city", "global"] as const).map((value) => (
          <Button
            key={value}
            aria-pressed={scope === value}
            variant={scope === value ? "default" : "outline"}
            onClick={() => {
              setScope(value);
              setOffset(0);
            }}
          >
            {value}
          </Button>
        ))}
      </div>
      {scope === "city" && (
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            City
            <Input
              value={city}
              maxLength={200}
              onChange={(event) => {
                setCity(event.target.value);
                setOffset(0);
              }}
            />
          </label>
          <label className="text-sm">
            Country code
            <Input
              value={country}
              maxLength={2}
              placeholder="e.g. PT"
              onChange={(event) => {
                setCountry(event.target.value.toUpperCase());
                setOffset(0);
              }}
            />
          </label>
        </div>
      )}
      {!valid && (
        <p role="status" className="text-sm">
          Enter a city and two-letter country code.
        </p>
      )}
      <ResourceState {...resource} label="Loading leaderboard…" />
      {resource.data?.entries.length === 0 && (
        <p className="text-sm">
          No eligible activity on this page. Shared statistics and visible visits are needed.
        </p>
      )}
      <ol className="divide-y divide-divider">
        {resource.data?.entries.map((entry) => (
          <li key={entry.user.id} className="flex items-center gap-3 py-4">
            <span className="w-12 font-serif text-xl font-bold text-brand">#{entry.rank}</span>
            <Link href={`/users/${entry.user.id}`} className="min-w-0 flex-1 text-brand">
              <span className="block break-words font-semibold">{entry.user.displayName}</span>
              <span className="block break-all text-xs">@{entry.user.handle}</span>
            </Link>
            <span className="text-sm">{entry.placesVisited} places</span>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          disabled={!offset || resource.loading}
          onClick={() => setOffset(Math.max(0, offset - 20))}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          disabled={resource.loading || resource.data?.entries.length !== 20}
          onClick={() => setOffset(offset + 20)}
        >
          Next
        </Button>
        <Button variant="ghost" onClick={resource.retry}>
          Refresh
        </Button>
      </div>
      {resource.data?.computedAt && (
        <p className="text-xs text-text-secondary">
          Computed {new Date(resource.data.computedAt).toLocaleString()}
        </p>
      )}
    </div>
  );
}

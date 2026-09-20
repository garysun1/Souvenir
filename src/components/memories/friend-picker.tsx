"use client";

import Link from "next/link";
import { useState } from "react";
import type { FriendsDto } from "../../../shared/worldwide-contract";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ResourceState } from "@/components/catalog/resource-state";
import { useMemoryResource } from "./memory-state";

export function FriendPicker({
  selected,
  onChange,
  disabled = false,
}: {
  selected: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}) {
  const resource = useMemoryResource<FriendsDto>("/api/friends");
  const [query, setQuery] = useState("");
  const friends = resource.data?.friends.filter((friend) => friend.status === "accepted") ?? [];
  const matches = friends.filter(({ user }) =>
    `${user.displayName} ${user.handle}`
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase()),
  );
  return (
    <fieldset disabled={disabled} className="min-w-0 space-y-3">
      <legend className="text-sm font-semibold">Who were you with?</legend>
      <div className="flex flex-wrap gap-2">
        {selected.map((id) => (
          <Button
            key={id}
            type="button"
            variant="outline"
            className="h-auto max-w-full whitespace-normal [overflow-wrap:anywhere]"
            aria-label={`Remove ${friends.find(({ user }) => user.id === id)?.user.displayName ?? "selected account"}`}
            onClick={() => onChange(selected.filter((value) => value !== id))}
          >
            {friends.find(({ user }) => user.id === id)?.user.displayName ?? "Selected account"} ×
          </Button>
        ))}
      </div>
      <label className="block space-y-1 text-sm">
        Search accepted friends
        <Input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Name or handle"
        />
      </label>
      <ResourceState {...resource} label="Loading accepted friends…" />
      <div className="max-h-52 overflow-y-auto">
        {matches.map(({ user }) => (
          <label key={user.id} className="flex min-h-11 items-center gap-3 py-2 text-sm">
            <input
              type="checkbox"
              className="shrink-0"
              checked={selected.includes(user.id)}
              disabled={!selected.includes(user.id) && selected.length >= 100}
              onChange={(event) =>
                onChange(
                  event.target.checked
                    ? [...selected, user.id]
                    : selected.filter((id) => id !== user.id),
                )
              }
            />
            <span className="min-w-0 [overflow-wrap:anywhere]">
              <span className="block">{user.displayName}</span>
              <span className="block text-text-secondary">@{user.handle}</span>
            </span>
          </label>
        ))}
      </div>
      {!resource.loading && !matches.length && (
        <p className="text-sm">
          No accepted friends match.
          <Link href="/friends" className="ml-1 text-brand underline">
            Manage friends
          </Link>
        </p>
      )}
      {selected.some((id) => resource.data && !friends.some(({ user }) => user.id === id)) && (
        <p role="alert" className="text-sm">
          A selected account is no longer an accepted friend. Remove it before sharing.
        </p>
      )}
    </fieldset>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";
import type { FriendsDto, SocialProfileDto } from "../../../shared/api-contract";
import { AccountRequired } from "@/components/account/account-state";
import { SharedLists } from "@/components/account/shared-lists";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ResourceState } from "@/components/catalog/resource-state";
import { useResource } from "@/lib/web/use-resource";
import { FriendActions } from "./friend-actions";
import { ActivityFeed } from "./activity-feed";
import { MutualSaves } from "./mutual-saves";

export function FriendsContent() {
  return (
    <AccountRequired>
      <Friends />
    </AccountRequired>
  );
}

function Friends() {
  const [search, setSearch] = useState("");
  const [revision, setRevision] = useState(0);
  const friends = useResource<FriendsDto>("/api/friends");
  const results = useResource<SocialProfileDto[]>(
    search.trim().length >= 2
      ? `/api/friends/search?${new URLSearchParams({ q: search.trim(), limit: "20" })}`
      : null,
    false,
    250,
  );
  const refresh = () => {
    friends.retry();
    results.retry();
    setRevision((value) => value + 1);
  };
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap justify-between gap-3">
        <h1 className="font-serif text-2xl font-bold text-brand">Explore with friends</h1>
        <Link href="/leaderboard" className="text-sm text-brand underline">
          Leaderboards
        </Link>
        <Button variant="outline" onClick={refresh}>
          Refresh connections
        </Button>
      </div>
      <MutualSaves />
      <ActivityFeed key={revision} />
      <details open={friends.data?.friends.length === 0}>
        <summary className="min-h-11 cursor-pointer py-3 font-serif text-xl font-bold text-brand">
          Find friends & manage connections
        </summary>
        <section className="space-y-3">
          <h2 className="font-serif text-xl font-bold text-brand">Find a friend</h2>
          <label className="block space-y-1 text-sm">
            Name or handle
            <Input
              maxLength={80}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="At least two characters"
            />
          </label>
          <ResourceState {...results} label="Searching people…" />
          {results.data?.length === 0 && (
            <p className="text-sm">No matching people. Try the beginning of a name or handle.</p>
          )}
          <ul className="space-y-3">
            {results.data?.map((user) => (
              <li key={user.id} className="space-y-2 rounded-xl border border-border p-4">
                <Link href={`/users/${user.id}`} className="text-brand underline">
                  {user.displayName} · @{user.handle}
                </Link>
                {friends.data && (
                  <FriendActions
                    userId={user.id}
                    relationship={
                      friends.data.friends.find((friend) => friend.user.id === user.id)?.status ??
                      "none"
                    }
                    refresh={refresh}
                  />
                )}
              </li>
            ))}
          </ul>
        </section>
        <section className="space-y-3">
          <h2 className="font-serif text-xl font-bold text-brand">Your connections</h2>
          <ResourceState {...friends} label="Loading connections…" />
          {friends.data?.friends.length === 0 && (
            <p className="text-sm">No connections yet. Search for someone to send a request.</p>
          )}
          {(["incoming", "outgoing", "accepted"] as const).map((status) => {
            const group = friends.data?.friends.filter((friend) => friend.status === status) ?? [];
            return (
              group.length > 0 && (
                <div key={status} className="space-y-3">
                  <h3 className="font-semibold">
                    {status === "incoming"
                      ? "Incoming requests"
                      : status === "outgoing"
                        ? "Sent requests"
                        : "Accepted friends"}
                  </h3>
                  {group.map((friend) => (
                    <article
                      key={friend.user.id}
                      className="space-y-2 rounded-xl border border-border p-4"
                    >
                      <Link
                        href={`/users/${friend.user.id}`}
                        className="font-serif font-bold text-brand underline"
                      >
                        {friend.user.displayName} · @{friend.user.handle}
                      </Link>
                      {status === "accepted" && (
                        <p className="text-xs text-text-secondary">
                          Taste overlap:{" "}
                          {friend.tasteOverlap === null
                            ? "unknown — not enough shared ratings"
                            : `${Math.round(friend.tasteOverlap * 100)}%`}
                        </p>
                      )}
                      <FriendActions
                        userId={friend.user.id}
                        relationship={status}
                        refresh={refresh}
                      />
                    </article>
                  ))}
                </div>
              )
            );
          })}
        </section>
      </details>
      <SharedLists />
    </div>
  );
}

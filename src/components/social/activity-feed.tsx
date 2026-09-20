"use client";

import Link from "next/link";
import { useState } from "react";
import type { ActivityEventDto, FeedDto } from "../../../shared/api-contract";
import { useAccount } from "@/components/account/account-provider";
import { Button } from "@/components/ui/button";
import { RecommendationBadge } from "@/components/ui/recommendation-badge";
import { ResourceState } from "@/components/catalog/resource-state";
import { useResource } from "@/lib/web/use-resource";
import { placeLocation, placePath } from "@/lib/web/worldwide";
import { SavePlace } from "@/components/catalog/save-place";

function Activity({ event }: { event: ActivityEventDto }) {
  const { data } = useAccount();
  if (event.kind === "friend")
    return (
      <p className="text-sm">
        Became friends with{" "}
        <Link href={`/users/${event.friend.id}`} className="text-brand underline">
          {event.friend.displayName}
        </Link>
        .
      </p>
    );
  if (event.kind === "set_complete") {
    const set = data?.sets.find((set) => set.id === event.completion.setId);
    return (
      <p className="text-sm">
        Completed{" "}
        {set ? (
          <Link href={`/sets/${encodeURIComponent(set.slug)}`} className="text-brand underline">
            {set.name}
          </Link>
        ) : (
          "a set"
        )}{" "}
        · {event.completion.visited}/{event.completion.total} places
      </p>
    );
  }
  return (
    <div className="space-y-2 text-sm">
      <p>
        {event.kind === "edition"
          ? "Visited "
          : event.kind === "note"
            ? "Added a place note at "
            : "Rated "}
        <Link
          href={placePath(event.place.slug)}
          className="font-serif font-bold text-brand underline"
        >
          {event.place.name}
        </Link>
      </p>
      <p className="text-xs text-text-secondary">{placeLocation(event.place)}</p>
      {event.kind === "ranking" && <RecommendationBadge sentiment={event.sentiment} />}
      {event.kind === "note" && <p className="whitespace-pre-wrap">{event.note.body}</p>}
      {event.kind === "edition" && (
        <p className="text-xs text-text-secondary">
          {new Date(event.edition.capturedAt).toLocaleDateString()} ·{" "}
          {event.edition.variant.replaceAll("_", " ")}
        </p>
      )}
      <SavePlace placeId={event.place.id} />
    </div>
  );
}

export function ActivityFeed() {
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const cursor = cursors[cursors.length - 1];
  const resource = useResource<FeedDto>(
    `/api/feed?${new URLSearchParams({ limit: "20", ...(cursor ? { cursor } : {}) })}`,
  );
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-serif text-xl font-bold text-brand">Friends&apos; activity</h2>
        <Button
          variant="outline"
          onClick={() => {
            setCursors([null]);
            resource.retry();
          }}
        >
          Refresh feed
        </Button>
      </div>
      <p className="text-xs text-text-secondary">
        Only currently authorized activity from accepted friends. Private moments, companions and
        capture photos are never included.
      </p>
      <ResourceState {...resource} label="Loading activity…" />
      {resource.data?.events.length === 0 && (
        <p className="text-sm">
          No visible activity on this page. Connect with friends and share a visit to get started.
        </p>
      )}
      <ol className="divide-y divide-divider">
        {resource.data?.events.map((event) => (
          <li key={event.id} className="space-y-2 py-4">
            <div className="flex flex-wrap justify-between gap-2">
              <Link href={`/users/${event.user.id}`} className="text-sm font-semibold text-brand">
                {event.user.displayName} <span className="font-normal">@{event.user.handle}</span>
              </Link>
              <time className="text-xs text-text-secondary" dateTime={event.createdAt}>
                {new Date(event.createdAt).toLocaleString()}
              </time>
            </div>
            <Activity event={event} />
          </li>
        ))}
      </ol>
      <div className="flex gap-2">
        {cursors.length > 1 && (
          <Button
            variant="outline"
            disabled={resource.loading}
            onClick={() => setCursors(cursors.slice(0, -1))}
          >
            Newer activity
          </Button>
        )}
        {resource.data?.nextCursor && (
          <Button
            variant="outline"
            disabled={resource.loading}
            onClick={() => setCursors([...cursors, resource.data!.nextCursor])}
          >
            Older activity
          </Button>
        )}
      </div>
    </section>
  );
}

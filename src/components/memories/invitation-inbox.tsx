"use client";

import Link from "next/link";
import type { AlbumInvitationDto, MomentTagInvitationDto } from "../../../shared/memories-contract";
import { Button } from "@/components/ui/button";
import { ResourceState } from "@/components/catalog/resource-state";
import { useMemoryAction, useMemoryPage } from "./memory-state";
import { ActionNotice, MemoryPager, MemorySection } from "./memory-ui";
import { AuthorName } from "./author-name";

export function InvitationInbox() {
  const albums = useMemoryPage<AlbumInvitationDto>("/api/album-invitations");
  const tags = useMemoryPage<MomentTagInvitationDto>("/api/moment-tag-invitations");
  const action = useMemoryAction();
  return (
    <MemorySection title="Your invitations">
      <p className="text-sm text-text-secondary">
        Album membership and individual moment tags have separate permissions. Accepting a tag does
        not join an album.
      </p>
      <ActionNotice {...action} />
      <h3 className="font-serif font-bold text-brand">Trip albums</h3>
      <ResourceState {...albums} label="Loading album invitations…" />
      {!albums.loading && albums.data?.items.length === 0 && (
        <p className="text-sm">No album invitations.</p>
      )}
      {albums.data?.items.map(({ albumTitle, ownerId, membership }) => (
        <article
          key={membership.id}
          className="space-y-2 rounded-xl border border-border p-3 text-sm"
        >
          <p className="font-serif font-bold">{albumTitle}</p>
          <p>
            Invited by <AuthorName userId={ownerId} /> · {membership.state}
          </p>
          {membership.state === "pending" && (
            <>
              <p>
                Joining lets you see and contribute to this album. Your personal collection remains
                separate.
              </p>
              <div className="flex flex-wrap gap-2">
                {(["accepted", "declined"] as const).map((state) => (
                  <Button
                    key={state}
                    variant={state === "accepted" ? "default" : "outline"}
                    disabled={action.busy}
                    onClick={() =>
                      void action.run(
                        `/api/albums/${membership.albumId}/members/${membership.id}`,
                        {
                          method: "PATCH",
                          body: { state, expectedVersion: membership.version },
                        },
                        `Album invitation ${state}.`,
                      )
                    }
                  >
                    {state === "accepted" ? "Join album" : "Decline"}
                  </Button>
                ))}
              </div>
            </>
          )}
          {membership.state === "accepted" && (
            <Link
              href={`/albums/${membership.albumId}`}
              className="inline-flex min-h-11 items-center text-brand underline"
            >
              Open album
            </Link>
          )}
        </article>
      ))}
      <MemoryPager {...albums} />
      <h3 className="font-serif font-bold text-brand">Moment tags</h3>
      <ResourceState {...tags} label="Loading tag invitations…" />
      {!tags.loading && tags.data?.items.length === 0 && (
        <p className="text-sm">No moment invitations.</p>
      )}
      {tags.data?.items.map(({ tag }) => (
        <article key={tag.id} className="space-y-2 rounded-xl border border-border p-3 text-sm">
          <p>
            <AuthorName userId={tag.senderId} /> shared a moment with you · {tag.state}
          </p>
          {(tag.state === "pending" || tag.state === "accepted") && (
            <>
              <Link
                href={`/moments/${tag.momentId}`}
                className="inline-flex min-h-11 items-center font-semibold text-brand underline"
              >
                {tag.state === "pending" ? "Preview shared moment before deciding" : "View moment"}
              </Link>
              <p className="text-xs text-text-secondary">
                This grants access to this one moment and photo, not its source visit or the rest of
                its album.
              </p>
              <div className="flex flex-wrap gap-2">
                {(tag.state === "pending"
                  ? (["accepted", "declined"] as const)
                  : (["removed"] as const)
                ).map((state) => (
                  <Button
                    key={state}
                    disabled={action.busy}
                    variant={state === "accepted" ? "default" : "outline"}
                    onClick={() =>
                      void action.run(
                        `/api/moments/${tag.momentId}/tags/${tag.id}`,
                        {
                          method: "PATCH",
                          body: { expectedVersion: tag.version, state },
                        },
                        `Tag ${state}.`,
                      )
                    }
                  >
                    {state === "accepted"
                      ? "Accept tag"
                      : state === "declined"
                        ? "Decline tag"
                        : "Remove my tag"}
                  </Button>
                ))}
              </div>
            </>
          )}
        </article>
      ))}
      <MemoryPager {...tags} />
    </MemorySection>
  );
}

"use client";

import Link from "next/link";
import { useState } from "react";
import type { TripAlbumDto } from "../../../shared/memories-contract";
import { AccountRequired } from "@/components/account/account-state";
import { ResourceState } from "@/components/catalog/resource-state";
import { useMemoryPage } from "./memory-state";
import { MemoryPager, MemorySection, MemoriesLinks } from "./memory-ui";
import { AlbumTarget } from "./album-target";
import { InvitationInbox } from "./invitation-inbox";
import { AuthorName } from "./author-name";

export function AlbumList() {
  return (
    <AccountRequired>
      <Albums />
    </AccountRequired>
  );
}

function Albums() {
  const resource = useMemoryPage<TripAlbumDto>("/api/albums");
  const [albumId, setAlbumId] = useState("");
  return (
    <div className="space-y-6">
      <MemoriesLinks />
      <div>
        <h1 className="font-serif text-3xl font-bold text-brand">Trips, kept together</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Days, confirmed places and moments from the people who were there. Each person chooses
          what to contribute.
        </p>
      </div>
      <MemorySection title="Your albums">
        <ResourceState {...resource} label="Loading your accessible albums…" />
        {!resource.loading && resource.data?.items.length === 0 && (
          <p className="text-sm">
            Start an album for a past trip or create one while reviewing an import.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {resource.data?.items.map((album) => (
            <article key={album.id} className="space-y-2 rounded-xl border border-border p-4">
              <Link
                href={`/albums/${album.id}`}
                className="inline-flex min-h-11 items-center font-serif text-xl font-bold text-brand underline"
              >
                {album.title}
              </Link>
              {album.description && <p className="text-sm">{album.description}</p>}
              <p className="text-xs">
                Owner: <AuthorName userId={album.ownerId} /> · you are {album.role}
              </p>
            </article>
          ))}
        </div>
        <MemoryPager {...resource} />
      </MemorySection>
      <MemorySection title="Start or choose an album">
        <AlbumTarget albumId={albumId} onChange={setAlbumId} />
        {albumId && (
          <Link
            href={`/albums/${albumId}`}
            className="inline-flex min-h-11 items-center text-brand underline"
          >
            Open selected album
          </Link>
        )}
      </MemorySection>
      <InvitationInbox />
    </div>
  );
}

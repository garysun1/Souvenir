"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TripAlbumDto, MemoryMomentDto } from "../../../shared/memories-contract";
import { AccountRequired } from "@/components/account/account-state";
import { ResourceState } from "@/components/catalog/resource-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMemoryAction, useMemoryPage, useMemoryResource } from "./memory-state";
import { ActionNotice, ConfirmDelete, MemoryPager, MemoriesLinks, fieldClass } from "./memory-ui";
import { AlbumMembers } from "./album-members";
import { MomentGroups } from "./moment-card";
import { ContributionForm } from "./contribution-form";

export function AlbumDetail({ albumId }: { albumId: string }) {
  return (
    <AccountRequired>
      <Album albumId={albumId} />
    </AccountRequired>
  );
}
function Album({ albumId }: { albumId: string }) {
  const resource = useMemoryResource<TripAlbumDto>(`/api/albums/${albumId}`);
  return (
    <div className="space-y-6">
      <MemoriesLinks />
      <Button variant="outline" disabled={resource.loading} onClick={resource.retry}>
        Refresh album
      </Button>
      <ResourceState {...resource} label="Checking album access…" />
      {!resource.error && resource.data && (
        <AlbumContent key={`${resource.data.id}:${resource.data.version}`} album={resource.data} />
      )}
    </div>
  );
}
function AlbumContent({ album }: { album: TripAlbumDto }) {
  const moments = useMemoryPage<MemoryMomentDto>(`/api/albums/${album.id}/moments`);
  const [title, setTitle] = useState(album.title);
  const [description, setDescription] = useState(album.description ?? "");
  const action = useMemoryAction();
  const router = useRouter();
  return (
    <>
      <div>
        <h1 className="font-serif text-3xl font-bold text-brand">{album.title}</h1>
        {album.description && (
          <p className="mt-2 whitespace-pre-wrap text-sm">{album.description}</p>
        )}
      </div>
      <AlbumMembers album={album} />
      <section className="space-y-4">
        <h2 className="font-serif text-2xl font-bold text-brand">Days, stops & contributions</h2>
        <p className="text-xs text-text-secondary">
          Grouped by each confirmed stop&apos;s local calendar day. Unresolved photos remain
          separate. Pages show the moments currently loaded.
        </p>
        <ResourceState {...moments} label="Loading authorized contributions…" />
        {!moments.loading && moments.data?.items.length === 0 && (
          <p className="text-sm">
            No contributions yet. Add your own moment or import selected photos into this album.
          </p>
        )}
        {!moments.loading && !moments.error && moments.data && (
          <MomentGroups moments={moments.data.items} />
        )}
        <MemoryPager {...moments} />
      </section>
      <ContributionForm albumId={album.id} />
      {album.role === "owner" && (
        <details className="rounded-2xl border border-border p-4">
          <summary className="min-h-11 cursor-pointer py-3 font-semibold text-brand">
            Edit album
          </summary>
          <div className="space-y-3">
            <label className="block text-sm">
              Title
              <Input
                maxLength={120}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>
            <label className="block text-sm">
              Description
              <textarea
                className={`${fieldClass} min-h-24 py-3`}
                maxLength={2000}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>
            <ActionNotice {...action} />
            <Button
              disabled={action.busy || !title.trim()}
              onClick={() =>
                void action.run(`/api/albums/${album.id}`, {
                  method: "PATCH",
                  body: {
                    expectedVersion: album.version,
                    title: title.trim(),
                    description: description.trim() || null,
                  },
                })
              }
            >
              Save album details
            </Button>
            <ConfirmDelete
              label="Delete album"
              busy={action.busy}
              description="Detaches contributions into their authors' private moments. Original media and independent explicit tags are not deleted."
              onConfirm={async () => {
                const deleted = await action.run(`/api/albums/${album.id}`, {
                  method: "DELETE",
                  body: { expectedVersion: album.version },
                });
                if (deleted) router.push("/albums");
              }}
            />
          </div>
        </details>
      )}
    </>
  );
}

"use client";

import { useState } from "react";
import type { TripAlbumDto } from "../../../shared/memories-contract";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ResourceState } from "@/components/catalog/resource-state";
import { useAccount } from "@/components/account/account-provider";
import { useMemoryAction, useMemoryPage } from "./memory-state";
import { ActionNotice, fieldClass, MemoryPager } from "./memory-ui";

export function AlbumTarget({
  albumId,
  onChange,
  sourceBatchId,
}: {
  albumId: string;
  onChange: (id: string) => void;
  sourceBatchId?: string;
}) {
  const albums = useMemoryPage<TripAlbumDto>("/api/albums");
  const [created, setCreated] = useState<TripAlbumDto | null>(null);
  const [title, setTitle] = useState("");
  const [outingId, setOutingId] = useState("");
  const { data } = useAccount();
  const action = useMemoryAction();
  const choices = albums.data?.items ?? [];
  return (
    <div className="space-y-3">
      <label className="block space-y-1 text-sm">
        Save destination
        <select
          className={fieldClass}
          value={albumId}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Only me · private memories</option>
          {albumId && !choices.some((album) => album.id === albumId) && (
            <option value={albumId}>
              {created?.id === albumId ? created.title : "Selected album"}
            </option>
          )}
          {choices.map((album) => (
            <option key={album.id} value={album.id}>
              {album.title} · {album.role}
            </option>
          ))}
        </select>
      </label>
      <ResourceState {...albums} label="Loading available albums…" />
      <MemoryPager {...albums} />
      <details>
        <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium text-brand">
          Create a trip album
        </summary>
        <div className="space-y-3">
          <label className="block text-sm">
            Album title
            <Input
              maxLength={120}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label className="block text-sm">
            Link an outing (optional)
            <select
              className={fieldClass}
              value={outingId}
              onChange={(event) => setOutingId(event.target.value)}
            >
              <option value="">Past trip / no outing</option>
              {data?.plans.map((plan) => (
                <option key={plan.id} value={plan.id}>
                  {plan.plan.title}
                </option>
              ))}
            </select>
          </label>
          <p className="text-xs text-text-secondary">
            Starts private. Invite accepted friends separately from the album page.
          </p>
          <ActionNotice {...action} />
          <Button
            type="button"
            disabled={action.busy || !title.trim()}
            onClick={async () => {
              const album = await action.post<TripAlbumDto>(
                "/api/albums",
                {
                  title: title.trim(),
                  sourceBatchId: sourceBatchId ?? null,
                  outingId: outingId || null,
                },
                "Album created.",
              );
              if (album) {
                setCreated(album);
                onChange(album.id);
                setTitle("");
              }
            }}
          >
            Create album
          </Button>
        </div>
      </details>
    </div>
  );
}

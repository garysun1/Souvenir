"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type {
  ImportBatchDto,
  ImportCommitDto,
  ImportAnalyzeRequest,
  ImportCommitRequest,
} from "../../../shared/memories-contract";
import { MEMORY_LIMITS } from "../../../shared/memories-contract";
import { AccountRequired, ErrorNotice } from "@/components/account/account-state";
import { useAccount } from "@/components/account/account-provider";
import { ResourceState } from "@/components/catalog/resource-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/web/api";
import { ImportItem } from "./import-item";
import { AlbumTarget } from "./album-target";
import {
  prepareImage,
  readUploadQueue,
  saveUploadQueue,
  uploadImage,
  type PendingImage,
} from "./import-upload";
import { ActionNotice, ConfirmDelete, MemorySection } from "./memory-ui";
import { notifyMemoriesChanged, useMemoryAction, useMemoryResource } from "./memory-state";
import { commitSelection, momentGroups } from "./memory-model";

export function ImportDetail({ batchId }: { batchId: string }) {
  return (
    <AccountRequired>
      <Batch key={batchId} batchId={batchId} />
    </AccountRequired>
  );
}
function Batch({ batchId }: { batchId: string }) {
  const { userId, request, client, data } = useAccount();
  const resource = useMemoryResource<ImportBatchDto>(`/api/imports/${batchId}`);
  const action = useMemoryAction();
  const router = useRouter();
  const [queue, setQueue] = useState<PendingImage[]>([]);
  const [queueReady, setQueueReady] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [visits, setVisits] = useState<string[]>([]);
  const [consent, setConsent] = useState(false);
  const [albumId, setAlbumId] = useState("");
  const [share, setShare] = useState(false);
  const [committed, setCommitted] = useState<ImportCommitDto | null>(null);
  const cancel = useRef(false);
  const locked = useRef(false);
  const mounted = useRef(true);
  const batch = resource.data;
  useEffect(() => {
    mounted.current = true;
    let active = true;
    void readUploadQueue(userId!, batchId)
      .then((saved) => {
        if (active) {
          setQueue(saved ?? []);
          setQueueReady(true);
        }
      })
      .catch((failure) => {
        if (active) setError(errorMessage(failure));
      });
    return () => {
      active = false;
      mounted.current = false;
      cancel.current = true;
    };
  }, [userId, batchId]);
  useEffect(() => {
    if (!batch?.items.some((item) => item.state === "processing")) return;
    const timer = window.setInterval(resource.retry, 5000);
    return () => window.clearInterval(timer);
  }, [batch?.items, resource.retry]);

  async function chooseFiles(files: File[]) {
    if (!batch || locked.current) return;
    locked.current = true;
    setUploading(true);
    setError(null);
    try {
      const pendingCount = queue.filter(
        (entry) => !batch.items.some((item) => item.sha256 === entry.registration.sha256),
      ).length;
      if (batch.items.length + pendingCount + files.length > MEMORY_LIMITS.batchItems)
        throw new Error(
          "This batch can hold at most 20 photos. Choose fewer files or start another batch.",
        );
      const next = [...queue];
      for (const [index, file] of files.entries()) {
        setProgress(`Checking photo ${index + 1} of ${files.length}…`);
        const entry = await prepareImage(file);
        if (!next.some((existing) => existing.registration.sha256 === entry.registration.sha256))
          next.push(entry);
      }
      await saveUploadQueue(userId!, batchId, next);
      if (mounted.current) {
        setQueue(next);
        setProgress(`${next.length} photos ready to upload.`);
      }
    } catch (failure) {
      if (mounted.current) setError(errorMessage(failure));
    } finally {
      locked.current = false;
      if (mounted.current) setUploading(false);
    }
  }

  async function upload() {
    if (!client || locked.current) return;
    locked.current = true;
    cancel.current = false;
    setUploading(true);
    setError(null);
    let remaining = [...queue];
    const total = remaining.length;
    try {
      for (const [index, pending] of queue.entries()) {
        if (cancel.current) break;
        setProgress(`Uploading ${index + 1} of ${total}: ${pending.registration.fileName}`);
        await uploadImage(batchId, pending, {
          userId: userId!,
          request,
          upload: async (contract, bytes) => {
            const session = await client.auth.getSession();
            if (cancel.current || session.data.session?.user.id !== userId)
              throw new Error("Upload paused. Sign in to the same account to resume.");
            const result = await client.storage
              .from(contract.bucket)
              .uploadToSignedUrl(contract.path, contract.token, bytes, {
                contentType: pending.registration.contentType,
              });
            if (result.error)
              throw new Error(
                "Photo upload failed. Your selected files are retained; retry this batch.",
              );
          },
        });
        remaining = remaining.slice(1);
        await saveUploadQueue(userId!, batchId, remaining);
        if (mounted.current) {
          setQueue(remaining);
          resource.retry();
        }
      }
      if (mounted.current)
        setProgress(
          remaining.length
            ? "Paused. Resume the remaining files when ready."
            : "All selected files uploaded.",
        );
      notifyMemoriesChanged();
    } catch (failure) {
      if (mounted.current) setError(errorMessage(failure));
    } finally {
      locked.current = false;
      if (mounted.current) setUploading(false);
    }
  }
  const toggle = (
    setter: (values: string[]) => void,
    values: string[],
    id: string,
    checked: boolean,
  ) => setter(checked ? [...new Set([...values, id])] : values.filter((value) => value !== id));
  const chosen = selected.filter((id) =>
    batch?.items.some((item) => item.id === id && !["committed", "duplicate"].includes(item.state)),
  );
  const analyzeIds = chosen.filter((id) =>
    batch?.items.some(
      (item) =>
        item.id === id && ["uploaded", "ready", "failed", "processing"].includes(item.state),
    ),
  );
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link href="/collection/imports" className="text-sm text-brand underline">
        All imports
      </Link>
      <ResourceState {...resource} label="Loading import progress…" />
      {batch && (
        <>
          <header className="space-y-2">
            <h1 className="font-serif text-3xl font-bold text-brand">{batch.title}</h1>
            <p className="text-sm text-text-secondary">
              {batch.items.length}/20 photos · {batch.state} · Private source batch
            </p>
            <Button variant="outline" onClick={resource.retry} disabled={resource.loading}>
              Refresh progress
            </Button>
          </header>
          <MemorySection title="1. Choose & upload">
            <p className="text-sm">
              Selected files are kept on this device until uploaded, so interruptions can resume.
              Uploading does not authorize AI analysis or sharing.
            </p>
            <label className="block space-y-2 text-sm">
              JPEG, PNG or WebP · up to 10 MiB each
              <Input
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp"
                disabled={
                  !queueReady ||
                  uploading ||
                  batch.state === "cancelled" ||
                  batch.items.length >= 20
                }
                onChange={(event) => {
                  const files = Array.from(event.target.files ?? []);
                  event.target.value = "";
                  if (files.length) void chooseFiles(files);
                }}
              />
            </label>
            <ul className="space-y-2 text-sm">
              {queue.map((entry) => (
                <li
                  key={entry.registration.requestId}
                  className="flex items-center justify-between gap-2"
                >
                  <span className="min-w-0 break-words">
                    {entry.registration.fileName} · {(entry.file.size / 1024 / 1024).toFixed(1)} MiB
                  </span>
                  <Button
                    variant="ghost"
                    disabled={uploading}
                    onClick={async () => {
                      const next = queue.filter((item) => item !== entry);
                      try {
                        await saveUploadQueue(userId!, batchId, next);
                        setQueue(next);
                      } catch (failure) {
                        setError(errorMessage(failure));
                      }
                    }}
                  >
                    Remove local file
                  </Button>
                </li>
              ))}
            </ul>
            <ErrorNotice message={error} />
            {progress && (
              <p role="status" aria-live="polite" className="text-sm">
                {progress}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button disabled={uploading || !queue.length} onClick={() => void upload()}>
                Upload / resume {queue.length ? `(${queue.length})` : ""}
              </Button>
              {uploading && (
                <Button
                  variant="outline"
                  onClick={() => {
                    cancel.current = true;
                    setProgress("Pausing after the current file…");
                  }}
                >
                  Pause after this photo
                </Button>
              )}
            </div>
          </MemorySection>
          <MemorySection title="2. Review days & stops">
            <p className="text-sm text-text-secondary">
              Scene analysis is optional. A photo can inform your taste without becoming a visit.
              Only your confirmed stop can create a visit.
            </p>
            {batch.items.length === 0 && (
              <p className="text-sm">Upload your first photos to start reviewing.</p>
            )}
            {momentGroups(batch.items).map((group) => (
              <section key={group.items[0].id} className="space-y-3">
                <h3 className="font-serif text-lg font-bold text-brand">
                  {group.day}
                  {group.placeId
                    ? ` · ${data?.places.find((place) => place.id === group.placeId)?.name ?? "Confirmed stop"}`
                    : ""}
                  {group.groupKey ? ` · ${group.groupKey}` : ""}
                </h3>
                <div className="grid gap-4 md:grid-cols-2">
                  {group.items.map((item) => (
                    <ImportItem
                      key={`${item.id}:${item.version}`}
                      item={item}
                      selected={chosen.includes(item.id)}
                      createVisit={visits.includes(item.id)}
                      onSelect={(checked) => {
                        toggle(setSelected, selected, item.id, checked);
                        setConsent(false);
                        setShare(false);
                      }}
                      onVisit={(checked) => toggle(setVisits, visits, item.id, checked)}
                    />
                  ))}
                </div>
              </section>
            ))}
            <label className="flex min-h-11 items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
              />
              I agree to send the selected photos to the configured AI provider for scene and
              interest suggestions. No face identity, emotion or sensitive-trait inference.
            </label>
            <Button
              variant="outline"
              disabled={action.busy || !consent || !analyzeIds.length || analyzeIds.length > 5}
              onClick={async () => {
                const body: Omit<ImportAnalyzeRequest, "requestId"> = {
                  expectedVersion: batch.version,
                  consentImages: true,
                  itemIds: analyzeIds,
                };
                const result = await action.post<ImportBatchDto>(
                  `/api/imports/${batchId}/analyze`,
                  body,
                  "Analysis progress saved. Refresh or retry unfinished photos.",
                );
                if (result) setConsent(false);
              }}
            >
              Analyze / retry selected photos ({analyzeIds.length}/5)
            </Button>
            {analyzeIds.length > 5 && (
              <p className="text-sm">Analyze at most five selected photos per call.</p>
            )}
          </MemorySection>
          <MemorySection title="3. Save selected memories">
            <AlbumTarget
              albumId={albumId}
              onChange={(id) => {
                setAlbumId(id);
                setShare(false);
              }}
              sourceBatchId={batchId}
            />
            {albumId && (
              <label className="flex min-h-11 items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={share}
                  onChange={(event) => setShare(event.target.checked)}
                />
                Share the selected photos, notes and confirmed stops with this album&apos;s accepted
                members.
              </label>
            )}
            <p className="text-xs text-text-secondary">
              Visits are created only for checked “Also record my visit” items. Nothing creates a
              visit in another person&apos;s collection.
            </p>
            <ActionNotice {...action} />
            <Button
              disabled={action.busy || uploading || !chosen.length || Boolean(albumId && !share)}
              onClick={async () => {
                try {
                  const items = commitSelection(batch.items, chosen, visits);
                  const body: Omit<ImportCommitRequest, "requestId"> = {
                    expectedVersion: batch.version,
                    items,
                    target: albumId
                      ? { kind: "album", albumId, confirmShare: true }
                      : { kind: "private" },
                  };
                  const result = await action.post<ImportCommitDto>(
                    `/api/imports/${batchId}/commit`,
                    body,
                    "Memories saved.",
                  );
                  if (result) {
                    setCommitted(result);
                    setSelected([]);
                    setVisits([]);
                    setShare(false);
                  }
                } catch (failure) {
                  setError(errorMessage(failure));
                }
              }}
            >
              Save {chosen.length || ""} selected memories
            </Button>
            {committed && (
              <div role="status" className="space-y-2 text-sm">
                <p>
                  {committed.moments.length} memories saved · {committed.editionIds.length} personal
                  visits recorded.
                </p>
                <Link
                  className="block text-brand underline"
                  href={albumId ? `/albums/${albumId}` : "/moments"}
                >
                  Open saved memories
                </Link>
                <Link className="block text-brand underline" href="/profile#taste">
                  Choose these photos for your taste portrait
                </Link>
              </div>
            )}
          </MemorySection>
          <ConfirmDelete
            label="Delete batch"
            busy={action.busy || uploading}
            description="Deletes this import and revokes its derived moments and taste evidence. Independently recorded visits remain."
            onConfirm={async () => {
              const result = await action.run(`/api/imports/${batchId}`, {
                method: "DELETE",
                body: { expectedVersion: batch.version },
              });
              if (result) {
                await saveUploadQueue(userId!, batchId, []);
                router.push("/collection/imports");
              }
            }}
          />
        </>
      )}
    </div>
  );
}

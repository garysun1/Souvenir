"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { MemoryMediaSource } from "../../../shared/memories-contract";
import { useAccount } from "@/components/account/account-provider";
import { ErrorNotice } from "@/components/account/account-state";
import { Button } from "@/components/ui/button";
import { SignedPhoto } from "@/components/collection/signed-photo";
import { errorMessage } from "@/lib/web/api";
import { AlbumTarget } from "./album-target";
import { FriendPicker } from "./friend-picker";
import { MemorySection, fieldClass } from "./memory-ui";
import { notifyMemoriesChanged } from "./memory-state";
import {
  contributionDraftSchema,
  submitContribution,
  type ContributionDraft,
  type ContributionProgress,
} from "./contribution-state";

export function ContributionForm({
  source,
  albumId = "",
  captureId,
}: {
  source?: MemoryMediaSource;
  albumId?: string;
  captureId?: string;
}) {
  const { data, userId, request, refresh } = useAccount();
  const storageKey = `souvenir:contribution:v1:${userId}:${captureId ?? (albumId || "moments")}`;
  const [draft, setDraft] = useState<ContributionDraft | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [discard, setDiscard] = useState(false);
  const mounted = useRef(true);
  const locked = useRef(false);

  useEffect(() => {
    mounted.current = true;
    const load = window.setTimeout(() => {
      try {
        const stored = localStorage.getItem(storageKey);
        setDraft(
          stored
            ? contributionDraftSchema.parse(JSON.parse(stored))
            : {
                version: 1,
                editionId: "",
                albumId,
                friendIds: [],
                note: "",
                pending: null,
                completedMomentId: null,
              },
        );
      } catch {
        setError(
          "This device's sharing draft is unavailable. Clear it below to start again. Existing shared moments are not removed.",
        );
      }
    }, 0);
    return () => {
      mounted.current = false;
      window.clearTimeout(load);
    };
  }, [storageKey, albumId]);

  function persist(next: ContributionDraft) {
    localStorage.setItem(storageKey, JSON.stringify(next));
    if (mounted.current) setDraft(next);
  }
  function update(changes: Partial<ContributionDraft>) {
    if (!draft) return;
    try {
      persist({ ...draft, ...changes });
      setConfirmed(false);
      setError(null);
    } catch {
      setError("Enable device storage or free space before continuing this resumable share.");
    }
  }
  function clear() {
    try {
      persist({
        version: 1,
        editionId: "",
        albumId,
        friendIds: [],
        note: "",
        pending: null,
        completedMomentId: null,
      });
      setDiscard(false);
      setConfirmed(false);
      setError(null);
    } catch {
      setError("Could not clear the device draft. Check browser storage permissions.");
    }
  }
  async function share() {
    const selectedSource =
      source ?? (draft?.editionId ? { kind: "edition" as const, id: draft.editionId } : null);
    if (!draft || !selectedSource || !confirmed || locked.current) return;
    locked.current = true;
    setBusy(true);
    setError(null);
    let current = draft;
    try {
      const pending: ContributionProgress = draft.pending ?? {
        request: {
          requestId: crypto.randomUUID(),
          source: selectedSource,
          target: draft.albumId
            ? { kind: "album", albumId: draft.albumId, confirmShare: true }
            : { kind: "private" },
          note: draft.note.trim() || null,
        },
        tags: draft.friendIds.map((userId) => ({ userId, requestId: crypto.randomUUID() })),
        momentId: null,
        completedTagUsers: [],
      };
      const id = await submitContribution(pending, { request }, (progress) => {
        current = { ...current, pending: progress };
        persist(current);
      });
      persist({ ...current, pending: null, completedMomentId: id });
      if (mounted.current) {
        setConfirmed(false);
        notifyMemoriesChanged();
      }
      void refresh();
    } catch (failure) {
      if (mounted.current) setError(errorMessage(failure));
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  if (draft?.completedMomentId)
    return (
      <MemorySection title="Moment saved">
        <p className="text-sm">
          Your explicit sharing choices were saved. Tags remain pending until recipients respond.
        </p>
        <Link
          href={`/moments/${draft.completedMomentId}`}
          className="inline-flex min-h-11 items-center text-brand underline"
        >
          Review moment & tag status
        </Link>
        <Button type="button" variant="outline" onClick={clear}>
          Choose another contribution
        </Button>
      </MemorySection>
    );

  const preparingCapture = Boolean(captureId && !source);
  const selectedEdition = data?.collection.find(
    (edition) => edition.id === (source?.kind === "edition" ? source.id : draft?.editionId),
  );
  return (
    <MemorySection
      title={preparingCapture ? "Share after capture (optional)" : "Contribute your own moment"}
    >
      <ErrorNotice message={error} />
      {draft && (
        <>
          <p className="text-sm text-text-secondary">
            {preparingCapture
              ? "Choose accounts and an album now; after the visit is saved you will approve sharing separately."
              : "This creates a selected moment. It never creates a visit for you or for another member."}{" "}
            Legacy private companion names and your original visit notes stay separate.
          </p>
          {draft.pending && (
            <p role="status" className="rounded-xl bg-surface-muted p-3 text-sm">
              A share was interrupted. Its choices are locked for safe retry.
              {draft.pending.momentId && (
                <>
                  {" "}
                  The moment was saved; {draft.pending.completedTagUsers.length}/
                  {draft.pending.tags.length} tag requests completed.
                </>
              )}
            </p>
          )}
          <fieldset disabled={busy || Boolean(draft.pending)} className="min-w-0 space-y-4">
            {!source && !captureId && (
              <label className="block space-y-1 text-sm">
                Choose your saved visit
                <select
                  className={fieldClass}
                  value={draft.editionId}
                  onChange={(event) => update({ editionId: event.target.value })}
                >
                  <option value="">Choose a visit</option>
                  {data?.collection.map((edition) => (
                    <option key={edition.id} value={edition.id}>
                      {edition.place.name} ·{" "}
                      {new Date(edition.capturedAt).toLocaleDateString(undefined, {
                        timeZone: edition.timezone,
                      })}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {albumId ? (
              <p className="text-sm">
                Destination: this album. Accepted members will see this contribution.
              </p>
            ) : (
              <AlbumTarget albumId={draft.albumId} onChange={(albumId) => update({ albumId })} />
            )}
            <FriendPicker
              selected={draft.friendIds}
              onChange={(friendIds) => update({ friendIds })}
            />
            <label className="block space-y-1 text-sm">
              Words to include in this selected moment (optional)
              <textarea
                className={`${fieldClass} min-h-24 py-3`}
                maxLength={2000}
                value={draft.note}
                onChange={(event) => update({ note: event.target.value })}
              />
            </label>
          </fieldset>
          {!preparingCapture && (
            <>
              {selectedEdition && (
                <div className="space-y-2">
                  <p className="text-sm font-semibold">
                    Selected photo · {selectedEdition.place.name}
                  </p>
                  {selectedEdition.photo ? (
                    <SignedPhoto
                      editionId={selectedEdition.id}
                      photo={selectedEdition.photo}
                      alt="Your selected photo to share"
                    />
                  ) : (
                    <p className="text-sm">This visit has no personal photo.</p>
                  )}
                </div>
              )}
              <div className="space-y-2 rounded-xl bg-surface-muted p-4 text-sm">
                <p>
                  {draft.albumId
                    ? "Shares this moment, its confirmed stop, selected words and photo with the selected album's accepted members."
                    : "Keeps the moment private unless you send the selected tags below."}
                </p>
                <p>
                  {draft.friendIds.length} selected accounts will receive a tag invitation. Each
                  recipient can preview this specific moment and photo before accepting. Tags do not
                  grant album membership.
                </p>
              </div>
              <label className="flex min-h-11 items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={confirmed}
                  disabled={busy}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                I approve these recipients and this destination for this selected moment and photo.
              </label>
              <Button
                type="button"
                disabled={busy || !confirmed || (!source && !draft.editionId)}
                onClick={() => void share()}
              >
                {busy
                  ? "Saving sharing progress…"
                  : draft.pending
                    ? "Retry approved share"
                    : "Save approved moment"}
              </Button>
            </>
          )}
          {preparingCapture && (
            <p className="text-xs text-text-secondary">
              No invitations are sent when you save the personal visit. Review the separate sharing
              step after capture. These choices stay on this device until cleared.
            </p>
          )}
        </>
      )}
      <Button type="button" disabled={busy} variant="ghost" onClick={() => setDiscard(true)}>
        Clear sharing draft
      </Button>
      {discard && (
        <div className="space-y-3 rounded-xl border border-border p-3 text-sm">
          <p>
            Clear local choices? If a request already reached the server, clearing does not undo it.
            Review your moments before starting a different share.
          </p>
          {draft?.pending?.momentId && (
            <Link
              href={`/moments/${draft.pending.momentId}`}
              className="block text-brand underline"
            >
              Review partially shared moment
            </Link>
          )}
          <Button type="button" variant="destructive" onClick={clear}>
            Clear device draft
          </Button>
          <Button type="button" variant="ghost" onClick={() => setDiscard(false)}>
            Keep draft
          </Button>
        </div>
      )}
    </MemorySection>
  );
}

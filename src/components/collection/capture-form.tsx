"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import type { CollectionEntryDto } from "../../../shared/api-contract";
import { SouvenirCard } from "./souvenir-card";
import { useAccount } from "@/components/account/account-provider";
import { AccountRequired, ErrorNotice } from "@/components/account/account-state";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { companionNames, localDateTime } from "@/lib/web/collection";
import { errorMessage } from "@/lib/web/api";
import { canonicalPlaceId } from "@/lib/web/worldwide";
import { PlacePicker } from "./place-picker";
import { VisibilitySelect } from "@/components/catalog/place-metadata";
import {
  capturePhotoPath,
  commitCapture,
  photoMetadata,
  readCaptureDraft,
  removeCaptureDraft,
  writeCaptureDraft,
  similarVisit,
  type CaptureDraft,
} from "@/lib/web/capture";

export function CaptureForm({
  placeId = "",
  outingId = null,
}: {
  placeId?: string;
  outingId?: string | null;
}) {
  return (
    <AccountRequired>
      <CaptureEditor placeId={placeId} outingId={outingId} />
    </AccountRequired>
  );
}

function CaptureEditor({ placeId, outingId }: { placeId: string; outingId: string | null }) {
  const { data, client, request, refresh } = useAccount();
  const [draft, setDraft] = useState<CaptureDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [discarding, setDiscarding] = useState(false);
  const [savedEdition, setSavedEdition] = useState<CollectionEntryDto | null>(null);
  const [separate, setSeparate] = useState(false);
  const [duplicateOpen, setDuplicateOpen] = useState(false);
  const userId = data!.user.id;

  const newDraft = (): CaptureDraft => ({
    requestId: crypto.randomUUID(),
    placeId,
    capturedAt: new Date().toISOString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    note: "",
    companions: "",
    outingId,
    photo: null,
    photoName: null,
    submission: null,
    completedEditionId: null,
  });

  useEffect(() => {
    let active = true;
    void readCaptureDraft(userId)
      .then((saved) => {
        if (active)
          setDraft(
            (saved?.completedEditionId && (saved.placeId !== placeId || saved.outingId !== outingId)
              ? undefined
              : saved) ?? {
              requestId: crypto.randomUUID(),
              placeId,
              capturedAt: new Date().toISOString(),
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              note: "",
              companions: "",
              outingId,
              photo: null,
              photoName: null,
              submission: null,
              completedEditionId: null,
            },
          );
      })
      .catch((failure) => {
        if (active) setError(errorMessage(failure));
      });
    return () => {
      active = false;
    };
  }, [userId, placeId, outingId]);

  async function update(changes: Partial<CaptureDraft>) {
    if (!draft) return;
    const next = { ...draft, ...changes };
    if (changes.placeId || changes.capturedAt) {
      setSeparate(false);
      setDuplicateOpen(false);
    }
    setDraft(next);
    try {
      await writeCaptureDraft(userId, next);
      setError(null);
    } catch (failure) {
      setError(errorMessage(failure));
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!draft || !client || busy) return;
    if (!draft.submission && !separate && similarVisit(draft, data!.collection)) {
      setDuplicateOpen(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (!canonicalPlaceId(draft.placeId))
        throw new Error("Choose a real destination before saving.");
      const confirmed: CaptureDraft = draft.submission
        ? draft
        : {
            ...draft,
            submission: {
              requestId: draft.requestId,
              placeId: draft.placeId,
              capturedAt: draft.capturedAt,
              timezone: draft.timezone,
              note: draft.note.trim() || null,
              companions: companionNames(draft.companions),
              variant: data!.collection.some((edition) => edition.placeId === draft.placeId)
                ? "revisit"
                : "standard",
              photoPath: draft.photo
                ? capturePhotoPath(userId, draft.requestId, draft.photo)
                : null,
              origin: "capture",
              outingId: draft.outingId,
              visibility: draft.visibility ?? "private",
            },
          };
      await writeCaptureDraft(userId, confirmed);
      setDraft(confirmed);
      const edition = await commitCapture(confirmed, {
        request,
        upload: async (upload, bytes, contentType) => {
          const { data: session } = await client.auth.getSession();
          if (session.session?.user.id !== userId)
            throw new Error("Your account changed. Sign in again.");
          const result = await client.storage
            .from(upload.bucket)
            .uploadToSignedUrl(upload.path, upload.token, bytes, { contentType });
          if (result.error) throw new Error("Photo upload failed. Keep this draft and retry.");
        },
      });
      const completed = { ...confirmed, completedEditionId: edition.id };
      const place = data!.places.find((item) => item.id === edition.placeId);
      if (place) setSavedEdition({ ...edition, place });
      setDraft(completed);
      await writeCaptureDraft(userId, completed);
      await refresh();
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }

  async function startNew(nextPlaceId = placeId, nextOutingId = outingId) {
    try {
      await removeCaptureDraft(userId);
      const next = { ...newDraft(), placeId: nextPlaceId, outingId: nextOutingId };
      await writeCaptureDraft(userId, next);
      setDraft(next);
      setSavedEdition(null);
      setSeparate(false);
      setDuplicateOpen(false);
      setDiscarding(false);
      setError(null);
    } catch (failure) {
      setError(errorMessage(failure));
    }
  }

  if (!draft)
    return (
      <div className="space-y-3">
        <ErrorNotice message={error} />
        <p role="status">
          {error ? "Reload this page after enabling browser storage." : "Loading your draft…"}
        </p>
      </div>
    );
  const edition =
    savedEdition ?? data!.collection.find((item) => item.id === draft.completedEditionId);
  const outing = data!.plans.find((item) => item.id === draft.outingId);
  const nextStop = outing?.plan.stops.find(
    (stop) =>
      stop.placeId !== draft.placeId &&
      !data!.collection.some(
        (item) => item.outingId === outing.id && item.placeId === stop.placeId,
      ),
  );
  const duplicate = similarVisit(draft, data!.collection);
  if (draft.completedEditionId)
    return (
      <div className="mx-auto max-w-md space-y-5 rounded-xl border border-border p-5">
        <h1 className="font-serif text-2xl font-bold text-brand">Added to your collection</h1>
        <p role="status" className="text-sm">
          Your souvenir is saved.
        </p>
        {edition && <SouvenirCard edition={edition} outingTitle={outing?.plan.title} />}
        <ErrorNotice message={error} />
        <Link href={`/editions/${draft.completedEditionId}`} className="block text-brand underline">
          View saved edition
        </Link>
        <Link
          href="/collection"
          className="inline-flex min-h-11 items-center rounded-full bg-brand px-4 text-sm text-white"
        >
          See your album
        </Link>
        {edition && (
          <Link
            href={`/places/${edition.place.slug}#recommend`}
            className="block min-h-11 py-3 text-brand underline"
          >
            Recommend this place
          </Link>
        )}
        {nextStop && (
          <Button onClick={() => void startNew(nextStop.placeId, outing!.id)}>
            Continue outing ·{" "}
            {data!.places.find((place) => place.id === nextStop.placeId)?.name ?? "Next stop"}
          </Button>
        )}
        <Button variant="outline" onClick={() => void startNew()}>
          Capture another visit
        </Button>
      </div>
    );
  const locked = Boolean(draft.submission);
  return (
    <form onSubmit={save} className="mx-auto max-w-xl space-y-5">
      <div>
        <h1 className="font-serif text-2xl font-bold text-brand">Keep the moment</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Choose the real place you visited. Photos and moments stay private to your account.
        </p>
      </div>
      <ErrorNotice message={error} />
      {locked && (
        <p className="rounded-xl bg-surface-muted p-3 text-sm">
          This visit is ready to retry. Its details and photo are locked so a retry cannot create a
          duplicate.
        </p>
      )}
      <fieldset disabled={busy || locked} className="space-y-4">
        <section className="space-y-3">
          <h2 className="font-serif text-xl font-bold text-brand">1. Keep a photo</h2>
          <p className="text-sm text-text-secondary">
            Optional. You can also keep a visit without a personal photo.
          </p>
          <label className="block space-y-2 text-sm font-medium">
            Photo · JPEG, PNG or WebP, up to 10 MiB
            <Input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) => {
                const photo = event.target.files?.[0];
                if (!photo) return;
                try {
                  photoMetadata(photo);
                  void update({ photo, photoName: photo.name });
                } catch (failure) {
                  setError(errorMessage(failure));
                }
              }}
            />
          </label>
          {draft.photo && (
            <div className="flex items-center gap-3 text-sm">
              <span>{draft.photoName}</span>
              <Button variant="ghost" onClick={() => void update({ photo: null, photoName: null })}>
                Remove photo
              </Button>
            </div>
          )}
        </section>
        <h2 className="font-serif text-xl font-bold text-brand">2. Confirm your visit</h2>
        <PlacePicker
          value={draft.placeId}
          onSelect={(place) => void update({ placeId: place.id })}
        />
        <VisibilitySelect
          value={draft.visibility ?? "private"}
          onChange={(visibility) => void update({ visibility })}
          label="Share this visit"
        />
        <p className="text-xs text-text-secondary">
          Shared activity includes the place and visit date. Your moment, companions and original
          photo stay private.
        </p>
        <details>
          <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">
            Date, moment & companions · {new Date(draft.capturedAt).toLocaleDateString()}
          </summary>
          <div className="space-y-4 pt-3">
            <label className="block space-y-2 text-sm font-medium">
              Visit date and time
              <Input
                type="datetime-local"
                required
                value={localDateTime(draft.capturedAt)}
                onChange={(event) => {
                  if (event.target.value)
                    void update({
                      capturedAt: new Date(event.target.value).toISOString(),
                      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                    });
                }}
              />
            </label>
            <p className="text-xs text-text-secondary">
              Times are shown in {Intl.DateTimeFormat().resolvedOptions().timeZone}. Recorded
              timezone: {draft.timezone}.
            </p>
            <label className="block space-y-2 text-sm font-medium">
              Moment (optional)
              <textarea
                className="min-h-28 w-full rounded-xl border border-border p-3"
                maxLength={2000}
                value={draft.note}
                onChange={(event) => void update({ note: event.target.value })}
              />
            </label>
            <label className="block space-y-2 text-sm font-medium">
              Companions (optional)
              <Input
                placeholder="Names, separated by commas"
                value={draft.companions}
                onChange={(event) => void update({ companions: event.target.value })}
              />
            </label>
            <p className="text-xs text-text-secondary">
              Companion names do not invite or share with another account.
            </p>
          </div>
        </details>
        {draft.outingId && (
          <label className="flex gap-2 text-sm">
            <input type="checkbox" checked onChange={() => void update({ outingId: null })} />
            Link this visit to {outing?.plan.title ?? "the selected plan"}
          </label>
        )}
      </fieldset>
      {duplicateOpen && duplicate && (
        <div role="alert" className="space-y-3 rounded-xl border border-border p-4">
          <p className="text-sm">You already kept a visit here at nearly the same time.</p>
          <Link href={`/editions/${duplicate.id}`} className="block py-3 text-brand underline">
            Open existing souvenir
          </Link>
          <label className="flex min-h-11 items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={separate}
              onChange={(event) => setSeparate(event.target.checked)}
            />
            Keep this as a separate visit
          </label>
        </div>
      )}
      <Button type="submit" disabled={busy || !draft.placeId}>
        {busy ? "Saving…" : locked ? "Retry this visit" : "Save visit & reveal"}
      </Button>
      <Button variant="ghost" type="button" disabled={busy} onClick={() => setDiscarding(true)}>
        Discard draft
      </Button>
      {discarding && (
        <div className="space-y-3 rounded-xl border border-border p-4">
          <p className="text-sm">
            Discard this device draft? If a save was interrupted, refresh your collection first to
            check whether it was committed.
          </p>
          <Link href="/collection" className="block text-sm underline">
            Check collection
          </Link>
          <Button variant="destructive" onClick={() => void startNew()}>
            Discard and start a new visit
          </Button>
          <Button variant="ghost" onClick={() => setDiscarding(false)}>
            Keep draft
          </Button>
        </div>
      )}
    </form>
  );
}

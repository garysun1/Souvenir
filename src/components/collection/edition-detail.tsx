"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { EditionPatch, Visibility } from "../../../shared/api-contract";
import { AccountRequired, ErrorNotice, RefreshAccount } from "@/components/account/account-state";
import { useAccount } from "@/components/account/account-provider";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { SignedPhoto } from "./signed-photo";
import { PlacePreferences } from "@/components/catalog/place-preferences";
import { companionNames, localDateTime } from "@/lib/web/collection";
import { errorMessage } from "@/lib/web/api";
import { setProgress } from "@/lib/web/collection";

export function EditionDetail({ id }: { id: string }) {
  return (
    <AccountRequired>
      <Edition id={id} />
    </AccountRequired>
  );
}

function Edition({ id }: { id: string }) {
  const { data, mutate } = useAccount();
  const router = useRouter();
  const edition = data!.collection.find((entry) => entry.id === id);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!edition) return;
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const enteredTime = String(fields.get("capturedAt"));
      const changedTime = enteredTime !== localDateTime(edition.capturedAt);
      const body: EditionPatch = {
        note: String(fields.get("note")).trim() || null,
        companions: companionNames(String(fields.get("companions"))),
        visibility: String(fields.get("visibility")) as Visibility,
        ...(changedTime
          ? {
              capturedAt: new Date(enteredTime).toISOString(),
              timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            }
          : {}),
      };
      await mutate(`/api/editions/${id}`, { method: "PATCH", body });
      setEditing(false);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    setError(null);
    try {
      await mutate(`/api/editions/${id}`, { method: "DELETE" });
      router.replace("/collection");
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  if (!edition)
    return (
      <EmptyState
        title="This edition is unavailable"
        description="It may have been deleted, or belong to a different account."
        action={
          <Link href="/collection" className="underline">
            Back to collection
          </Link>
        }
      />
    );
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-center justify-between gap-3">
        <Link
          href={`/places/${edition.place.slug}`}
          className="font-serif text-2xl font-bold text-brand"
        >
          {edition.place.name}
        </Link>
        <RefreshAccount />
      </div>
      <p className="text-sm text-text-secondary">
        Edition {edition.visitSequence} ·{" "}
        {edition.visitSequence > 1 ? "Return visit" : "First visit"} ·{" "}
        {new Date(edition.capturedAt).toLocaleString(undefined, { timeZone: edition.timezone })} ·
        Recorded in {edition.timezone}
      </p>
      {edition.photo && (
        <SignedPhoto
          editionId={id}
          photo={edition.photo}
          alt={`Your visit to ${edition.place.name}`}
        />
      )}
      <ErrorNotice message={error} />
      {editing ? (
        <form onSubmit={save} className="space-y-4">
          <label className="block space-y-2 text-sm">
            Share this visit
            <select
              name="visibility"
              defaultValue={edition.visibility ?? "private"}
              className="min-h-11 w-full rounded-xl border border-border px-3"
            >
              <option value="private">Only me</option>
              <option value="friends">Accepted friends</option>
              <option value="public">Public</option>
            </select>
          </label>
          <p className="text-xs text-text-secondary">
            Your moment, companions and original photo remain private.
          </p>
          <label className="block space-y-2 text-sm">
            Visit date/time ({Intl.DateTimeFormat().resolvedOptions().timeZone})
            <Input
              name="capturedAt"
              type="datetime-local"
              required
              defaultValue={localDateTime(edition.capturedAt)}
            />
          </label>
          <label className="block space-y-2 text-sm">
            Moment
            <textarea
              name="note"
              className="min-h-28 w-full rounded-xl border border-border p-3"
              maxLength={2000}
              defaultValue={edition.note ?? ""}
            />
          </label>
          <label className="block space-y-2 text-sm">
            Companions, separated by commas
            <Input name="companions" defaultValue={edition.companions.join(", ")} />
          </label>
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save changes"}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => setEditing(false)}>
            Cancel
          </Button>
        </form>
      ) : (
        <div className="space-y-3">
          <p className="whitespace-pre-wrap">{edition.note ?? "No moment added yet."}</p>
          <p className="text-sm text-text-secondary">
            {edition.companions.length
              ? `With ${edition.companions.join(", ")}`
              : "No companions recorded"}
          </p>
          <Button variant="outline" onClick={() => setEditing(true)}>
            Edit moment
          </Button>
        </div>
      )}
      <PlacePreferences place={edition.place} />
      {edition.outingId && (
        <Link
          href={`/collection?outingId=${edition.outingId}`}
          className="block min-h-11 py-3 text-brand underline"
        >
          See this outing&apos;s memories
        </Link>
      )}
      {data!.collection.filter((item) => item.placeId === edition.placeId && item.id !== edition.id)
        .length > 0 && (
        <section className="space-y-2">
          <h2 className="font-serif text-xl font-bold text-brand">Your return visits</h2>
          {data!.collection
            .filter((item) => item.placeId === edition.placeId && item.id !== edition.id)
            .map((item) => (
              <Link
                key={item.id}
                href={`/editions/${item.id}`}
                className="block min-h-11 py-3 text-sm text-brand underline"
              >
                Edition {item.visitSequence} ·{" "}
                {new Date(item.capturedAt).toLocaleDateString(undefined, {
                  timeZone: item.timezone,
                })}
              </Link>
            ))}
        </section>
      )}
      {data!.sets
        .filter((set) => set.places.some((place) => place.id === edition.placeId))
        .map((set) => (
          <section key={set.id} className="space-y-2 rounded-xl bg-surface-muted p-4">
            <h2 className="font-serif text-xl font-bold text-brand">{set.name}</h2>
            <p className="text-sm">
              {setProgress(set, data!.collection)} of {set.places.length} places collected
            </p>
            <Link
              href={`/sets/${set.slug}`}
              className="inline-flex min-h-11 items-center text-brand underline"
            >
              Explore the next stop
            </Link>
          </section>
        ))}
      <div className="flex flex-wrap gap-4">
        <Link
          className="inline-flex min-h-11 items-center text-sm text-brand underline"
          href={`/capture?placeId=${edition.placeId}`}
        >
          Capture a new visit
        </Link>
        <Button variant="ghost" onClick={() => setDeleting(true)}>
          Delete edition
        </Button>
      </div>
      {deleting && (
        <div className="space-y-3 rounded-xl border border-negative p-4">
          <p className="text-sm">
            Delete this visit and its private photo? If it is your last visit here, the place leaves
            Been and its visit ranking is removed. Saves, favorites and tips stay.
          </p>
          <Button variant="destructive" disabled={busy} onClick={() => void remove()}>
            {busy ? "Deleting…" : "Delete permanently"}
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => setDeleting(false)}>
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}

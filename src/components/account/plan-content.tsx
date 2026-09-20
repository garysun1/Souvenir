"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import type {
  PlanContent as PlanDocument,
  PlanCreate,
  PlanDto,
} from "../../../shared/api-contract";
import { useAccount } from "./account-provider";
import { AccountRequired, ErrorNotice, RefreshAccount } from "./account-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { errorMessage } from "@/lib/web/api";
import { minuteLabel, samplePlan } from "@/lib/web/plans";
import { localDateTime } from "@/lib/web/collection";

export function PlanContent() {
  return (
    <AccountRequired>
      <Plans />
    </AccountRequired>
  );
}

function Plans() {
  const { data, mutate } = useAccount();
  const [creating, setCreating] = useState(false);
  const [pending, setPending] = useState<PlanCreate | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const snapshot = data!;
  async function accept(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const fields = new FormData(event.currentTarget);
      const body =
        pending ??
        samplePlan(
          snapshot.user.id,
          crypto.randomUUID(),
          String(fields.get("title")),
          String(fields.get("date")),
          selectedIds,
          snapshot.places,
        );
      setPending(body);
      await mutate("/api/outings", { method: "POST", body });
      setPending(null);
      setCreating(false);
      setSelectedIds([]);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-serif text-2xl font-bold text-brand">Your plans</h1>
        <RefreshAccount />
      </div>
      <p className="text-sm text-text-secondary">
        Accepted plans sync with mobile. Completing visits updates each plan&apos;s status.
      </p>
      {!creating && <Button onClick={() => setCreating(true)}>Draft a sample itinerary</Button>}
      {creating && (
        <form onSubmit={accept} className="space-y-4 rounded-xl border border-border p-4">
          <h2 className="font-serif text-xl font-bold">Sample itinerary · Simulation</h2>
          <p className="text-sm text-text-secondary">
            45 minutes per stop, with 15 minutes between stops, starting at 14:00. Route, travel
            time, costs, hours, weather and bookings are not verified.
          </p>
          <ErrorNotice message={error} />
          {pending && (
            <p className="text-sm">
              The submitted itinerary is locked for safe retry. Retry accepts the same plan, even if
              the first response was lost.
            </p>
          )}
          <fieldset disabled={busy || Boolean(pending)} className="space-y-3">
            <label className="block space-y-2 text-sm">
              Title
              <Input name="title" required maxLength={200} placeholder="An afternoon out" />
            </label>
            <label className="block space-y-2 text-sm">
              Date
              <Input
                type="date"
                name="date"
                required
                defaultValue={localDateTime(new Date().toISOString()).slice(0, 10)}
              />
            </label>
            <p className="text-sm">Select up to six places in visit order.</p>
            <div className="max-h-72 overflow-auto rounded-xl border border-border p-3">
              {snapshot.places.map((place) => (
                <label key={place.id} className="flex min-h-11 items-center gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(place.id)}
                    disabled={!selectedIds.includes(place.id) && selectedIds.length >= 6}
                    onChange={(event) =>
                      setSelectedIds(
                        event.target.checked
                          ? [...selectedIds, place.id]
                          : selectedIds.filter((id) => id !== place.id),
                      )
                    }
                  />
                  {selectedIds.includes(place.id) && `${selectedIds.indexOf(place.id) + 1}. `}
                  {place.name}
                </label>
              ))}
            </div>
          </fieldset>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy || !selectedIds.length}>
              {busy ? "Accepting…" : pending ? "Retry accepting plan" : "Accept sample plan"}
            </Button>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                if (
                  !pending ||
                  window.confirm(
                    "An interrupted save may already have succeeded. Discard this retry draft? Refresh your plans to check.",
                  )
                ) {
                  setPending(null);
                  setCreating(false);
                  setError(null);
                }
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
      {!snapshot.plans.length && (
        <p className="text-sm text-text-secondary">
          No accepted plans yet. Accept an itinerary here or in the mobile app.
        </p>
      )}
      {snapshot.plans.map((plan) => (
        <SavedPlan key={plan.id} plan={plan} />
      ))}
    </div>
  );
}

function SavedPlan({ plan }: { plan: PlanDto }) {
  const { data, mutate } = useAccount();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function revise(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const body: PlanDocument = {
      ...plan.plan,
      title: String(fields.get("title")).trim(),
      version: plan.plan.version + 1,
    };
    setBusy(true);
    setError(null);
    try {
      await mutate(`/api/outings/${plan.id}`, { method: "PATCH", body });
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
      await mutate(`/api/outings/${plan.id}`, { method: "DELETE" });
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-4 rounded-xl border border-border p-4">
      <h2 className="font-serif text-xl font-bold text-brand">{plan.plan.title}</h2>
      <p className="text-sm capitalize">
        {plan.plan.constraints.date} · {plan.status} ·{" "}
        {plan.plan.provenance === "simulation"
          ? "Simulation — verify all estimates"
          : "Manually planned"}{" "}
        · {plan.memberIds.length} {plan.memberIds.length === 1 ? "participant" : "participants"}
      </p>
      <ErrorNotice message={error} />
      <ol className="space-y-3">
        {plan.plan.stops.map((stop, index) => {
          const place = data!.places.find((item) => item.id === stop.placeId);
          return (
            <li
              key={`${index}-${stop.placeId}`}
              className="flex flex-wrap items-center justify-between gap-3 border-t border-divider pt-3"
            >
              <div>
                <Link
                  href={place ? `/places/${place.slug}` : "/discover"}
                  className="font-serif font-bold"
                >
                  {index + 1}. {place?.name ?? "Place unavailable"}
                </Link>
                <p className="text-sm text-text-secondary">
                  {minuteLabel(stop.arrivalMinute)}–{minuteLabel(stop.departureMinute)} ·{" "}
                  {plan.plan.provenance === "simulation" ? "Sample timing" : "Planned timing"}
                </p>
              </div>
              <Link
                className="min-h-11 py-3 text-sm text-brand underline"
                href={`/capture?placeId=${stop.placeId}&outingId=${plan.id}`}
              >
                Capture visit
              </Link>
            </li>
          );
        })}
      </ol>
      {plan.plan.checks.length > 0 && (
        <ul className="space-y-1 text-xs text-text-secondary">
          {plan.plan.checks.map((check, index) => (
            <li key={index}>{check}</li>
          ))}
        </ul>
      )}
      {plan.createdBy === data!.user.id && (
        <div className="space-y-3">
          {editing ? (
            <form onSubmit={revise} className="space-y-3">
              <label className="block space-y-2 text-sm">
                Plan title
                <Input name="title" required maxLength={200} defaultValue={plan.plan.title} />
              </label>
              <Button type="submit" disabled={busy}>
                Save title
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </form>
          ) : (
            <Button variant="outline" disabled={busy} onClick={() => setEditing(true)}>
              Edit title
            </Button>
          )}
          <Button variant="ghost" disabled={busy} onClick={() => setDeleting(true)}>
            Delete plan
          </Button>
          {deleting && (
            <div className="space-y-2">
              <p className="text-sm">
                Delete this plan? Everyone&apos;s captured visits stay in their collections.
              </p>
              <Button variant="destructive" disabled={busy} onClick={() => void remove()}>
                Confirm deletion
              </Button>
              <Button variant="ghost" disabled={busy} onClick={() => setDeleting(false)}>
                Keep plan
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

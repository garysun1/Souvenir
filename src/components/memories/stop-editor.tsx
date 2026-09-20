"use client";

import { useState } from "react";
import type { ConfirmedMemoryStop, ImportMetadata } from "../../../shared/memories-contract";
import { PlacePicker } from "@/components/collection/place-picker";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ErrorNotice } from "@/components/account/account-state";
import { confirmedStop } from "./memory-model";

export function StopEditor({
  value,
  metadata,
  busy,
  onSave,
}: {
  value: ConfirmedMemoryStop | null;
  metadata?: ImportMetadata;
  busy: boolean;
  onSave: (stop: ConfirmedMemoryStop | null) => Promise<void>;
}) {
  const [placeId, setPlaceId] = useState(value?.placeId ?? "");
  const [instant, setInstant] = useState(value?.capturedAt ?? metadata?.capturedAt ?? "");
  const [timezone, setTimezone] = useState(value?.timezone ?? metadata?.timezone ?? "");
  const [error, setError] = useState<string | null>(null);
  return (
    <fieldset disabled={busy} className="space-y-3">
      <p className="text-sm text-text-secondary">
        Confirm where and when this photo was taken. Today&apos;s device location is not evidence of
        a historical visit. Missing metadata stays unresolved until you confirm it.
      </p>
      <PlacePicker value={placeId} onSelect={(place) => setPlaceId(place.id)} allowNearby={false} />
      <label className="block space-y-1 text-sm">
        Capture date, time and UTC offset
        <Input
          value={instant}
          onChange={(event) => setInstant(event.target.value)}
          placeholder="2026-09-20T14:30:00+02:00"
        />
      </label>
      <label className="block space-y-1 text-sm">
        IANA timezone at the place
        <Input
          value={timezone}
          onChange={(event) => setTimezone(event.target.value)}
          placeholder="Europe/Paris"
        />
      </label>
      <ErrorNotice message={error} />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={() => {
            try {
              const stop = confirmedStop(placeId, instant.trim(), timezone.trim());
              setError(null);
              void onSave(stop);
            } catch (failure) {
              setError(failure instanceof Error ? failure.message : "Check the date and place.");
            }
          }}
        >
          Confirm historical stop
        </Button>
        {value && (
          <Button type="button" variant="outline" onClick={() => void onSave(null)}>
            Mark unresolved
          </Button>
        )}
      </div>
    </fieldset>
  );
}

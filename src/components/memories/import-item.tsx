"use client";

import Link from "next/link";
import { useState } from "react";
import type {
  ImportItemDto,
  ImportItemPatch,
  ImportMetadata,
} from "../../../shared/memories-contract";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAccount } from "@/components/account/account-provider";
import { useMemoryAction } from "./memory-state";
import { ActionNotice, ConfirmDelete, fieldClass } from "./memory-ui";
import { MemoryPhoto } from "./memory-photo";
import { StopEditor } from "./stop-editor";
import { canCommit, interestLabel } from "./memory-model";

export function ImportItem({
  item,
  selected,
  createVisit,
  onSelect,
  onVisit,
}: {
  item: ImportItemDto;
  selected: boolean;
  createVisit: boolean;
  onSelect: (selected: boolean) => void;
  onVisit: (visit: boolean) => void;
}) {
  const action = useMemoryAction();
  const { data } = useAccount();
  const [group, setGroup] = useState(item.groupKey ?? "");
  const path = `/api/imports/${item.batchId}/items/${item.id}`;
  const stop = item.confirmedStop;
  const place = data?.places.find((place) => place.id === stop?.placeId);
  async function patch(body: Omit<ImportItemPatch, "expectedVersion">) {
    await action.run(path, { method: "PATCH", body: { ...body, expectedVersion: item.version } });
  }
  return (
    <article className="min-w-0 space-y-3 rounded-2xl border border-border p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="min-w-0 break-words font-serif font-bold text-brand">{item.fileName}</h3>
        <span className="shrink-0 rounded-full bg-surface-muted px-2 py-1 text-xs">
          {item.state.replaceAll("_", " ")}
        </span>
      </div>
      {!["pending_upload", "duplicate"].includes(item.state) && (
        <MemoryPhoto path={`${path}/photo`} alt={item.fileName} />
      )}
      {item.state === "duplicate" && (
        <p className="text-sm">
          Identical bytes are already in your imports. This copy will not create another visit or
          memory.
        </p>
      )}
      {item.state === "pending_upload" && (
        <p className="text-sm">
          Upload incomplete. Resume with the files kept on this device below. If they are
          unavailable, remove this pending item before selecting the file again.
        </p>
      )}
      {item.error && (
        <p role="alert" className="text-sm text-destructive">
          {item.error.message}{" "}
          {item.error.retryable
            ? "Select this photo and retry analysis, or review and save its metadata to continue without analysis."
            : "Review and save this photo’s metadata or confirm its stop to continue without analysis."}
        </p>
      )}
      {item.analysis && (
        <div className="text-sm">
          <p>{item.analysis.scene}</p>
          <p className="text-text-secondary">
            {item.analysis.interests.map(interestLabel).join(" · ")}
          </p>
          <p className="mt-1 text-xs">
            AI scene suggestions are not confirmed places or proof of your preferences.
          </p>
        </div>
      )}
      <p className="text-sm">
        {stop
          ? `${place?.name ?? "Confirmed place"} · ${new Date(stop.capturedAt).toLocaleString(undefined, { timeZone: stop.timezone })} (${stop.timezone})`
          : "Unresolved stop · not a recorded visit"}
      </p>
      {item.editionId && (
        <Link className="text-sm text-brand underline" href={`/editions/${item.editionId}`}>
          Open recorded visit
        </Link>
      )}
      {!["duplicate", "committed", "pending_upload"].includes(item.state) && (
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={selected}
            onChange={(event) => onSelect(event.target.checked)}
          />
          Select for analysis / save
        </label>
      )}
      {selected && canCommit(item) && (
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={createVisit && Boolean(stop)}
            disabled={!stop}
            onChange={(event) => onVisit(event.target.checked)}
          />
          Also record my visit {stop ? "" : "(confirm the stop first)"}
        </label>
      )}
      {!["duplicate", "committed"].includes(item.state) && (
        <>
          <details>
            <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-brand">
              Review metadata & correct this stop
            </summary>
            <div className="space-y-4">
              <p className="text-xs text-text-secondary">
                Metadata source: {item.metadata.origin} · capture instant:{" "}
                {item.metadata.capturedAt ?? "unknown"} · timezone:{" "}
                {item.metadata.timezone ?? "unknown"} · GPS: {item.metadata.latitude ?? "unknown"},{" "}
                {item.metadata.longitude ?? "unknown"} · accuracy:{" "}
                {item.metadata.accuracyM === null ? "unknown" : `${item.metadata.accuracyM} m`}.
                EXIF without an offset does not establish an instant.
              </p>
              <StopEditor
                value={stop}
                metadata={item.metadata}
                busy={action.busy}
                onSave={(confirmedStop) => patch({ confirmedStop })}
              />
              <MetadataEditor
                metadata={item.metadata}
                busy={action.busy}
                onSave={(metadata) => patch({ metadata })}
              />
            </div>
          </details>
          <details>
            <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-brand">
              Merge or split grouping
            </summary>
            <p className="text-xs text-text-secondary">
              Use the same group label to merge photos at the same confirmed day and place. Use
              different labels to split them. Unresolved photos remain separate.
            </p>
            <label className="mt-2 block text-sm">
              Group label (optional)
              <Input
                maxLength={80}
                value={group}
                onChange={(event) => setGroup(event.target.value)}
              />
            </label>
            <Button
              type="button"
              className="mt-2"
              variant="outline"
              disabled={action.busy}
              onClick={() => void patch({ groupKey: group.trim() || null })}
            >
              Save grouping
            </Button>
          </details>
        </>
      )}
      <ActionNotice {...action} />
      <ConfirmDelete
        label="Remove import item"
        busy={action.busy}
        description="This revokes derived moment and taste-evidence access. An independently recorded visit remains."
        onConfirm={async () => {
          await action.run(path, { method: "DELETE", body: { expectedVersion: item.version } });
        }}
      />
    </article>
  );
}

function MetadataEditor({
  metadata,
  busy,
  onSave,
}: {
  metadata: ImportMetadata;
  busy: boolean;
  onSave: (metadata: ImportMetadata) => Promise<void>;
}) {
  return (
    <details>
      <summary className="min-h-11 cursor-pointer py-3 text-sm">
        Edit metadata suggestions separately
      </summary>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          const fields = new FormData(event.currentTarget);
          const number = (name: string) =>
            String(fields.get(name)).trim() ? Number(fields.get(name)) : null;
          void onSave({
            ...metadata,
            latitude: number("lat"),
            longitude: number("lng"),
            accuracyM: number("accuracy"),
            origin: "manual",
          });
        }}
      >
        <p className="text-xs">Editing metadata does not confirm a stop or record a visit.</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {[
            ["lat", "Latitude", metadata.latitude, -90, 90],
            ["lng", "Longitude", metadata.longitude, -180, 180],
            ["accuracy", "Accuracy (m)", metadata.accuracyM, 0, 20000000],
          ].map(([name, label, value, min, max]) => (
            <label key={String(name)} className="text-sm">
              {label}
              <input
                name={String(name)}
                type="number"
                step="any"
                className={fieldClass}
                defaultValue={value ?? ""}
                min={Number(min)}
                max={Number(max)}
              />
            </label>
          ))}
        </div>
        <Button type="submit" variant="outline" disabled={busy}>
          Save metadata suggestions
        </Button>
      </form>
    </details>
  );
}

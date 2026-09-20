"use client";

import Link from "next/link";
import type { ImportBatchDto, TasteSourceRef } from "../../../shared/memories-contract";
import { useAccount } from "@/components/account/account-provider";
import { ResourceState } from "@/components/catalog/resource-state";
import { MemoryPager } from "@/components/memories/memory-ui";
import { useMemoryPage } from "@/components/memories/memory-state";
import { availableTasteSources, sourceKey } from "@/components/memories/memory-model";

export function TasteSources({
  selected,
  excluded,
  onChange,
  disabled,
}: {
  selected: TasteSourceRef[];
  excluded: TasteSourceRef[];
  onChange: (sources: TasteSourceRef[]) => void;
  disabled: boolean;
}) {
  const { data } = useAccount();
  const imports = useMemoryPage<ImportBatchDto>("/api/imports");
  const choices = availableTasteSources(data!);
  const selectedKeys = new Set(selected.map(sourceKey));
  const excludedKeys = new Set(excluded.map(sourceKey));
  const change = (source: TasteSourceRef, checked: boolean) =>
    onChange(
      checked
        ? [...selected, source]
        : selected.filter((item) => sourceKey(item) !== sourceKey(source)),
    );
  const option = (source: TasteSourceRef, label: string) => {
    const excluded = excludedKeys.has(sourceKey(source));
    return (
      <label
        key={sourceKey(source)}
        className="flex min-h-11 items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-surface-muted"
      >
        <input
          type="checkbox"
          checked={selectedKeys.has(sourceKey(source))}
          disabled={
            disabled || excluded || (!selectedKeys.has(sourceKey(source)) && selected.length >= 100)
          }
          onChange={(event) => change(source, event.target.checked)}
        />
        <span>
          {label}
          <span className="block text-xs text-text-secondary">
            {source.kind.replaceAll("_", " ")}
            {excluded ? " · excluded (restore below to use again)" : ""}
          </span>
        </span>
      </label>
    );
  };
  return (
    <div className="space-y-3">
      <p className="text-sm">
        {selected.length}/100 selected inputs. Select only what you want used for this refresh. A
        visit or photo is a weak signal, not proof that you enjoyed it.
      </p>
      <details>
        <summary className="min-h-11 cursor-pointer py-3 font-semibold text-brand">
          Your visits, saves & explicit recommendations
        </summary>
        <div className="max-h-80 overflow-y-auto">
          {choices.map(({ source, label }) => option(source, label))}
          {!choices.length && (
            <p className="text-sm">No visits, saves, favorites or recommendations yet.</p>
          )}
        </div>
      </details>
      <details>
        <summary className="min-h-11 cursor-pointer py-3 font-semibold text-brand">
          Selected imported photos
        </summary>
        <ResourceState {...imports} label="Loading private import sources…" />
        <div className="max-h-80 space-y-3 overflow-y-auto">
          {imports.data?.items.map((batch) => (
            <fieldset key={batch.id}>
              <legend className="font-serif font-bold">{batch.title}</legend>
              {batch.items
                .filter((item) => ["uploaded", "ready", "committed"].includes(item.state))
                .map((item) => option({ kind: "import_item", id: item.id }, item.fileName))}
              <Link
                href={`/collection/imports/${batch.id}`}
                className="inline-flex min-h-11 items-center text-xs text-brand underline"
              >
                Review batch
              </Link>
            </fieldset>
          ))}
        </div>
        <MemoryPager {...imports} />
        <Link
          href="/collection/imports"
          className="inline-flex min-h-11 items-center text-sm text-brand underline"
        >
          Import more memories
        </Link>
      </details>
    </div>
  );
}

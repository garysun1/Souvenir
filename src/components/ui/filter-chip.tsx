"use client";

import { ChevronDown, X } from "lucide-react";
import { cn } from "cn";

export function FilterChip({
  label,
  selected = false,
  chevron = false,
  onClick,
}: {
  label: string;
  selected?: boolean;
  chevron?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex min-h-10 shrink-0 items-center gap-1 rounded-full border px-4 text-sm font-medium transition",
        selected ? "border-brand bg-brand text-white" : "border-border bg-white text-text-primary",
      )}
      onClick={onClick}
    >
      {label}
      {chevron && <ChevronDown className="size-3.5" />}
    </button>
  );
}

export function FilterRow({
  filters,
  onClear,
}: {
  filters: Array<{ label: string; selected?: boolean; chevron?: boolean; onClick?: () => void }>;
  onClear?: () => void;
}) {
  return (
    <div className="-mx-[18px] flex gap-2 overflow-x-auto px-[18px] pb-1 [scrollbar-width:none]">
      {filters.map((filter) => (
        <FilterChip key={filter.label} {...filter} />
      ))}
      {onClear && (
        <button
          type="button"
          className="inline-flex min-h-10 shrink-0 items-center gap-1 px-2 text-sm text-text-secondary"
          onClick={onClear}
        >
          <X className="size-3.5" /> Clear
        </button>
      )}
    </div>
  );
}

"use client";

import { cn } from "cn";

export function UnderlineTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: readonly T[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex border-b border-divider" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab}
          type="button"
          role="tab"
          aria-selected={value === tab}
          className={cn(
            "min-h-11 flex-1 border-b-2 px-2 text-sm font-medium capitalize",
            value === tab ? "border-brand text-brand" : "border-transparent text-text-secondary",
          )}
          onClick={() => onChange(tab)}
        >
          {tab}
        </button>
      ))}
    </div>
  );
}

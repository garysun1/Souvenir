"use client";

import { cn } from "cn";

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex rounded-full border border-brand p-0.5" role="group">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          className={cn(
            "min-h-10 flex-1 rounded-full px-4 text-sm font-semibold capitalize",
            value === option ? "bg-brand text-white" : "text-brand",
          )}
          onClick={() => onChange(option)}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

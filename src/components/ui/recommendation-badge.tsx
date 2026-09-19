import type { Sentiment } from "@/lib/schemas";
import { cn } from "cn";

const styles: Record<Sentiment | "unknown", string> = {
  recommend: "border-positive bg-positive/20",
  depends: "border-neutral bg-neutral",
  skip: "border-negative bg-negative",
  unknown: "border-border bg-surface-muted",
};

export function RecommendationBadge({ sentiment }: { sentiment?: Sentiment }) {
  const value = sentiment ?? "unknown";
  return (
    <span
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-full border-[1.5px] text-[10px] font-bold capitalize text-text-primary",
        styles[value],
      )}
      title={value}
    >
      {value === "unknown" ? "?" : value === "depends" ? "Maybe" : value}
    </span>
  );
}

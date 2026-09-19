import Link from "next/link";
import type { ReactNode } from "react";
import type { Place } from "@/lib/schemas";

export function PlaceRow({
  place,
  ordinal,
  trailing,
}: {
  place: Place;
  ordinal?: number;
  trailing?: ReactNode;
}) {
  return (
    <Link
      href={`/places/${place.slug}`}
      className="flex min-h-20 items-center gap-3 border-b border-divider py-3"
    >
      {ordinal ? (
        <span className="w-6 text-center text-base font-bold text-text-secondary">{ordinal}</span>
      ) : (
        <div className="size-12 shrink-0 rounded-lg bg-gradient-to-br from-amber-100 via-rose-100 to-sky-100" />
      )}
      <div className="min-w-0 flex-1">
        <p className="font-serif text-base font-bold leading-tight">{place.name}</p>
        <p className="mt-1 truncate text-[13px] text-text-secondary">
          {place.category.replace("_", " ")} · {place.city}
        </p>
      </div>
      {trailing}
    </Link>
  );
}

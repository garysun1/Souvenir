import Link from "next/link";
import type { CollectionSet } from "@/lib/schemas";

export function SetCard({ set }: { set: CollectionSet }) {
  return (
    <Link
      href={`/sets/${set.slug}`}
      className="relative block min-h-40 overflow-hidden rounded-xl bg-gradient-to-br from-brand via-slate-600 to-rose-300 p-5 text-white"
    >
      <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" />
      <div className="relative flex min-h-32 flex-col justify-end">
        <p className="font-serif text-xl font-bold">{set.name}</p>
        <p className="mt-1 text-sm text-white/85">You&apos;ve been to 0 of {set.places.length}</p>
      </div>
    </Link>
  );
}

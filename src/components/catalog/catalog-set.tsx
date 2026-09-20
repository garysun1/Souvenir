import Link from "next/link";
import type { SetDto } from "../../../shared/api-contract";

export function CatalogSet({ set, visited }: { set: SetDto; visited: number | null }) {
  return (
    <Link
      href={`/sets/${set.slug}`}
      className="relative flex min-h-40 flex-col justify-end overflow-hidden rounded-xl bg-gradient-to-br from-brand via-slate-600 to-rose-300 p-5 text-white"
    >
      <p className="font-serif text-xl font-bold">{set.name}</p>
      <p className="mt-1 text-sm text-white/85">
        {visited === null
          ? `${set.places.length} places · Sign in to track progress`
          : `You've been to ${visited} of ${set.places.length}`}
      </p>
    </Link>
  );
}

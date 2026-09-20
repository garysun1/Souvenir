import Link from "next/link";
import Image from "next/image";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Place } from "@/lib/schemas";

export function PlaceCard({ place }: { place: Place }) {
  return (
    <Link href={`/places/${place.slug}`} className="block flex-1">
      <Card className="h-full overflow-hidden rounded-xl border-0 bg-white shadow-none ring-1 ring-border transition hover:-translate-y-0.5 hover:shadow-md">
        {place.heroImageUrl ? (
          <Image
            src={place.heroImageUrl}
            alt=""
            width={500}
            height={350}
            unoptimized
            className="h-36 w-full object-cover md:h-44"
          />
        ) : (
          <div className="h-36 bg-gradient-to-br from-amber-100 via-rose-100 to-sky-100 md:h-44" />
        )}
        <CardHeader className="gap-2 pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="font-serif text-base font-bold">{place.name}</CardTitle>
          </div>
          <p className="text-xs capitalize text-text-secondary">
            {place.category.replace("_", " ")}
          </p>
        </CardHeader>
        <CardContent className="line-clamp-2 text-sm text-text-secondary">
          {place.description}
        </CardContent>
      </Card>
    </Link>
  );
}

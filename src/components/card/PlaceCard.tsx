import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Place } from "@/lib/schemas";
import { RarityBadge } from "./RarityBadge";

export function PlaceCard({ place }: { place: Place }) {
  return (
    <Link href={`/places/${place.slug}`}>
      <Card className="h-full overflow-hidden transition hover:-translate-y-0.5 hover:shadow-md">
        <div className="h-28 bg-gradient-to-br from-amber-100 via-rose-100 to-sky-100" />
        <CardHeader className="gap-2 pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">{place.name}</CardTitle>
            <RarityBadge tier={place.rarityTier} />
          </div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{place.category.replace("_", " ")}</p>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">{place.description}</CardContent>
      </Card>
    </Link>
  );
}

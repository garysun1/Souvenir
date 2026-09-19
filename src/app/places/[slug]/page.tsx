import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { places } from "@/lib/db/schema";
import { RarityBadge } from "@/components/card/RarityBadge";

export default async function PlacePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [place] = await db.select().from(places).where(eq(places.slug, slug)).limit(1);
  if (!place) notFound();
  return (
    <div className="space-y-5 p-5">
      <div className="h-48 rounded-2xl bg-gradient-to-br from-amber-100 via-rose-100 to-sky-100" />
      <RarityBadge tier={place.rarityTier} />
      <h1 className="text-3xl font-semibold">{place.name}</h1>
      <p className="text-muted-foreground">{place.description}</p>
      <p className="text-sm text-muted-foreground">
        {place.city} · {place.lat.toFixed(3)}, {place.lng.toFixed(3)}
      </p>
    </div>
  );
}

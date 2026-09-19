import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Edition, Place } from "@/lib/schemas";
import { RarityBadge } from "./RarityBadge";

export function EditionCard({ edition, place }: { edition: Edition; place: Place }) {
  return (
    <Card className="rounded-xl border-0 ring-1 ring-border">
      <CardHeader>
        <CardTitle className="font-serif font-bold">{place.name}</CardTitle>
        <RarityBadge tier={place.rarityTier} />
      </CardHeader>
      <CardContent className="text-text-secondary">
        {edition.note ?? "A captured memory."}
      </CardContent>
    </Card>
  );
}

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Edition, Place } from "@/lib/schemas";
import { RarityBadge } from "./RarityBadge";

export function EditionCard({ edition, place }: { edition: Edition; place: Place }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{place.name}</CardTitle>
        <RarityBadge tier={place.rarityTier} />
      </CardHeader>
      <CardContent>{edition.note ?? "A captured memory."}</CardContent>
    </Card>
  );
}

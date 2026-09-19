import { Badge } from "@/components/ui/badge";
import type { Place } from "@/lib/schemas";

export function RarityBadge({ tier }: { tier: Place["rarityTier"] }) {
  return (
    <Badge variant={tier === "legendary" || tier === "epic" ? "default" : "outline"}>{tier}</Badge>
  );
}

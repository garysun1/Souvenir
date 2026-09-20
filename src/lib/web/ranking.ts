import type {
  Category,
  RankingGroupDto,
  RankingPut,
  Sentiment,
} from "../../../shared/api-contract";

export function rankingInput(
  placeId: string,
  category: Category,
  sentiment: Sentiment,
  groups: RankingGroupDto[],
  reference: string,
  position: "before" | "after" | "tie",
): RankingPut {
  const previous = groups.find(
    (group) => group.category === category && group.sentiment === sentiment,
  );
  const placeIds = (previous?.placeIds ?? []).filter((id) => id !== placeId);
  if (reference && !placeIds.includes(reference))
    throw new Error("That comparison changed. Refresh and choose another place.");
  const referenceIndex = reference ? placeIds.indexOf(reference) : placeIds.length;
  placeIds.splice(referenceIndex + (reference && position !== "before" ? 1 : 0), 0, placeId);
  const ties = (previous?.ties ?? []).filter(([a, b]) => a !== placeId && b !== placeId);
  if (reference && position === "tie") ties.push([placeId, reference]);
  return {
    sentiment,
    ranking: "settled",
    comparedTo: reference || null,
    tiedWith: position === "tie" ? reference || null : null,
    group: {
      category,
      sentiment,
      placeIds,
      provisionalIds: (previous?.provisionalIds ?? []).filter((id) => id !== placeId),
      ties,
    },
  };
}

interface JourneyList {
  memberIds: string[];
  entries: { placeId: string; saverIds: string[]; completedBy: string[] }[];
}

export function mutualDestinations(list: JourneyList, viewerId: string) {
  return list.entries.filter(
    (entry) =>
      entry.saverIds.includes(viewerId) &&
      !entry.completedBy.includes(viewerId) &&
      entry.saverIds.some((id) => id !== viewerId && list.memberIds.includes(id)),
  );
}

export function suggestedStops(list: JourneyList, viewerId: string, limit = 6) {
  const mutual = new Set(mutualDestinations(list, viewerId).map((entry) => entry.placeId));
  return [...list.entries]
    .filter((entry) => entry.saverIds.length > 0 && !entry.completedBy.includes(viewerId))
    .sort((a, b) => Number(mutual.has(b.placeId)) - Number(mutual.has(a.placeId)))
    .slice(0, limit)
    .map((entry) => entry.placeId);
}

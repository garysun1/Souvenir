import type {
  BootstrapDto,
  CollectionEntryDto,
  PlaceDto,
  SetDto,
} from "../../../shared/api-contract";
import type { Place } from "@/lib/schemas";

export function legacyPlace(place: PlaceDto): Place & Pick<PlaceDto, "images"> {
  return {
    ...place,
    sourceUpdatedAt: place.sourceUpdatedAt ? new Date(place.sourceUpdatedAt) : null,
    fetchedAt: place.fetchedAt ? new Date(place.fetchedAt) : null,
    createdAt: new Date(place.createdAt),
  };
}

export function groupEditions(collection: CollectionEntryDto[]) {
  const groups = new Map<string, { place: PlaceDto; editions: CollectionEntryDto[] }>();
  for (const edition of collection) {
    const group = groups.get(edition.placeId) ?? { place: edition.place, editions: [] };
    group.editions.push(edition);
    groups.set(edition.placeId, group);
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      editions: group.editions.sort(
        (a, b) =>
          Date.parse(b.capturedAt) - Date.parse(a.capturedAt) || b.visitSequence - a.visitSequence,
      ),
    }))
    .sort((a, b) => Date.parse(b.editions[0].capturedAt) - Date.parse(a.editions[0].capturedAt));
}

export function savedPlaceIds(data: BootstrapDto): Set<string> {
  return new Set(
    data.wishlists.flatMap((list) =>
      list.entries
        .filter((entry) => entry.saverIds.includes(data.user.id))
        .map((entry) => entry.placeId),
    ),
  );
}

export function setProgress(set: SetDto, collection: CollectionEntryDto[]) {
  const collected = new Set(collection.map((entry) => entry.placeId));
  return set.places.filter((place) => collected.has(place.id)).length;
}

export function localDateTime(instant: string) {
  const date = new Date(instant);
  const adjusted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return adjusted.toISOString().slice(0, 16);
}

export function companionNames(value: string) {
  const names = value
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);
  if (names.length > 30 || names.some((name) => name.length > 100)) {
    throw new Error("Use up to 30 companion names, each no longer than 100 characters.");
  }
  return names;
}

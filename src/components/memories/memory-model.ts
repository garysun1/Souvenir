import { z } from "zod";
import type { BootstrapDto } from "../../../shared/api-contract";
import type {
  ConfirmedMemoryStop,
  ImportItemDto,
  MemoryMomentDto,
  TasteSourceRef,
} from "../../../shared/memories-contract";

export const sourceKey = (source: TasteSourceRef) => `${source.kind}:${source.id}`;
export const interestLabel = (interest: string) => interest.replaceAll("_", " ");

export function availableTasteSources(data: BootstrapDto) {
  const choices: { source: TasteSourceRef; label: string }[] = data.collection.map((edition) => ({
    source: { kind: "edition", id: edition.id },
    label: `${edition.place.name} · ${new Date(edition.capturedAt).toLocaleDateString(undefined, { timeZone: edition.timezone })}`,
  }));
  const name = (id: string) => data.places.find((place) => place.id === id)?.name ?? "Saved place";
  const saves = new Set(
    data.wishlists.flatMap((list) =>
      list.entries
        .filter((item) => item.saverIds.includes(data.user.id))
        .map((item) => item.placeId),
    ),
  );
  for (const id of saves) choices.push({ source: { kind: "saved_place", id }, label: name(id) });
  for (const item of data.placePreferences.filter((item) => item.favorite))
    choices.push({ source: { kind: "favorite", id: item.placeId }, label: name(item.placeId) });
  for (const item of data.rankings.filter((item) => item.sentiment === "recommend"))
    choices.push({
      source: { kind: "recommendation", id: item.placeId },
      label: name(item.placeId),
    });
  return choices;
}

export function confirmedStop(
  placeId: string,
  instant: string,
  timezone: string,
): ConfirmedMemoryStop {
  if (!placeId) throw new Error("Choose the historical place before confirming.");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(instant))
    throw new Error(
      "Enter a date and time with its UTC offset, for example 2026-09-20T14:30:00+02:00.",
    );
  const timestamp = Date.parse(instant);
  const withSeconds = instant.replace(/T(\d{2}:\d{2})(Z|[+-]\d{2}:\d{2})$/, "T$1:00$2");
  if (
    !Number.isFinite(timestamp) ||
    !z.string().datetime({ offset: true }).safeParse(withSeconds).success
  )
    throw new Error("Enter a valid capture date.");
  if (!timezone.trim()) throw new Error("Enter an IANA timezone, for example Europe/Paris.");
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format(timestamp);
  } catch {
    throw new Error("Enter an IANA timezone, for example Europe/Paris.");
  }
  return { placeId, capturedAt: new Date(timestamp).toISOString(), timezone };
}

export function momentGroups<T extends Pick<MemoryMomentDto, "id" | "confirmedStop" | "groupKey">>(
  moments: T[],
) {
  const groups = new Map<
    string,
    { day: string; placeId: string | null; groupKey: string | null; items: T[] }
  >();
  for (const moment of moments) {
    const stop = moment.confirmedStop;
    const day = stop
      ? new Intl.DateTimeFormat("en-CA", {
          timeZone: stop.timezone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date(stop.capturedAt))
      : "Unresolved date / place";
    const key = stop
      ? `${day}:${stop.placeId}:${moment.groupKey ?? ""}`
      : `unresolved:${moment.id}`;
    const group = groups.get(key) ?? {
      day,
      placeId: stop?.placeId ?? null,
      groupKey: moment.groupKey,
      items: [],
    };
    group.items.push(moment);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => a.day.localeCompare(b.day));
}

export function canCommit(item: ImportItemDto) {
  return item.state === "uploaded" || item.state === "ready";
}

export function commitSelection(items: ImportItemDto[], selected: string[], visits: string[]) {
  const chosen = items.filter((item) => selected.includes(item.id));
  if (!chosen.length) throw new Error("Select at least one uploaded memory.");
  if (chosen.length !== selected.length || chosen.some((item) => !canCommit(item)))
    throw new Error("Only uploaded or ready items can be saved. Refresh this batch.");
  if (chosen.some((item) => visits.includes(item.id) && !item.confirmedStop))
    throw new Error("Confirm the place, date and timezone before recording a visit.");
  return chosen.map((item) => ({
    itemId: item.id,
    createVisit: visits.includes(item.id),
    note: null,
  }));
}

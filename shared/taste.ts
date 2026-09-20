import type {
  ConfirmedMemoryStop,
  TasteComparisonDto,
  TasteDraft,
  TasteDraftFacet,
  TasteEvidenceDto,
  TasteFacet,
  TasteOverride,
  TasteSourceRef,
} from "./memories-contract";

export const tasteSourceKey = (source: TasteSourceRef) => `${source.kind}:${source.id}`;
export const tasteFacetKey = (facet: Pick<TasteFacet, "interest" | "intent">) =>
  `${facet.interest}:${facet.intent}`;

export function memoryGroupKey(item: {
  id: string;
  confirmedStop: ConfirmedMemoryStop | null;
  groupKey: string | null;
}): string {
  const stop = item.confirmedStop;
  if (!stop) return `unresolved:${item.id}`;
  const day = new Intl.DateTimeFormat("en-CA", {
    timeZone: stop.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(stop.capturedAt));
  return JSON.stringify([day, stop.placeId, item.groupKey]);
}

export interface TasteSignal {
  source: TasteSourceRef;
  visitKey: string;
  hash: string | null;
  weight: number;
}

export function aggregateTaste(
  evidence: TasteEvidenceDto[],
  signals: TasteSignal[],
  overrides: TasteOverride[],
  title: string | null,
): TasteDraft {
  const sourceMap = new Map(signals.map((signal) => [tasteSourceKey(signal.source), signal]));
  const facets = new Map<
    string,
    { facet: TasteDraftFacet; visits: Map<string, number>; hashes: Set<string> }
  >();
  for (const entry of [...evidence].sort(
    (a, b) => b.confidence - a.confidence || a.id.localeCompare(b.id),
  )) {
    const signal = sourceMap.get(tasteSourceKey(entry.source));
    if (entry.excluded || !signal || entry.confidence < 0.35) continue;
    const key = tasteFacetKey(entry);
    const group = facets.get(key) ?? {
      facet: {
        interest: entry.interest,
        intent: entry.intent,
        strength: 1,
        evidenceIds: [],
      },
      visits: new Map<string, number>(),
      hashes: new Set<string>(),
    };
    facets.set(key, group);
    if (signal.hash && group.hashes.has(signal.hash)) continue;
    if (signal.hash) group.hashes.add(signal.hash);
    group.visits.set(
      signal.visitKey,
      Math.max(group.visits.get(signal.visitKey) ?? 0, entry.confidence * signal.weight),
    );
    group.facet.evidenceIds.push(entry.id);
  }
  const result = new Map<string, TasteDraftFacet>();
  for (const [key, { facet, visits }] of facets) {
    const total = [...visits.values()].reduce((sum, weight) => sum + weight, 0);
    result.set(key, {
      ...facet,
      evidenceIds: facet.evidenceIds.sort(),
      strength: total >= 3 ? 3 : total >= 1.5 ? 2 : 1,
    });
  }
  for (const override of overrides) {
    const key = tasteFacetKey(override);
    if (override.action === "dismiss") result.delete(key);
    else
      result.set(key, {
        interest: override.interest,
        intent: override.intent,
        strength: override.strength,
        evidenceIds: result.get(key)?.evidenceIds ?? [],
      });
  }
  const ordered = [...result.values()]
    .sort((a, b) => b.strength - a.strength || tasteFacetKey(a).localeCompare(tasteFacetKey(b)))
    .slice(0, 20);
  const contributingVisits = new Set(
    ordered.flatMap((facet) => [...(facets.get(tasteFacetKey(facet))?.visits.keys() ?? [])]),
  );
  return {
    title,
    facets: ordered,
    coverage:
      ordered.length >= 2 &&
      (contributingVisits.size >= 2 || overrides.filter((v) => v.action === "prefer").length >= 2)
        ? "ready"
        : "insufficient",
  };
}

export function compareTaste(
  a: TasteFacet[],
  b: TasteFacet[],
): Omit<TasteComparisonDto, "suggestions"> {
  const left = new Set(a.map(tasteFacetKey));
  const right = new Set(b.map(tasteFacetKey));
  const common = [...left].filter((key) => right.has(key));
  const commonInterests = [
    ...new Set(a.filter((f) => common.includes(tasteFacetKey(f))).map((f) => f.interest)),
  ].sort();
  const ready = left.size >= 2 && right.size >= 2;
  const ratio = common.length / (new Set([...left, ...right]).size || 1);
  return {
    definitionVersion: 1,
    commonInterests,
    coverage: ready ? "ready" : "insufficient",
    overlap: !ready ? "insufficient" : ratio >= 0.5 ? "strong" : ratio > 0 ? "some" : "different",
    explanation: !ready
      ? "Share at least two interests each to compare your common ground."
      : common.length
        ? `You share ${commonInterests.map((v) => v.replaceAll("_", " ")).join(", ")} with matching intentions.`
        : "Your approved interests suggest different kinds of places to explore.",
  };
}

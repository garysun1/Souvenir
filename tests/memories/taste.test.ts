import { describe, expect, it } from "vitest";
import { aggregateTaste, compareTaste, memoryGroupKey, type TasteSignal } from "../../shared/taste";
import type { TasteEvidenceDto, TasteFacet, TasteOverride } from "../../shared/memories-contract";
import { tasteProfilePatchSchema } from "@/lib/contracts/memories";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const source = (n: number) => ({ kind: "import_item" as const, id: id(n) });
const signal = (n: number, visitKey = "one-visit", hash: string | null = null): TasteSignal => ({
  source: source(n),
  visitKey,
  hash,
  weight: 0.25,
});
const evidence = (
  n: number,
  interest: TasteEvidenceDto["interest"] = "gardens",
): TasteEvidenceDto => ({
  id: id(100 + n),
  source: source(n),
  interest,
  intent: "enjoyed",
  confidence: 0.9,
  explanation: "Visible garden.",
  analysisVersion: 1,
  excluded: false,
});
const facet = (
  interest: TasteFacet["interest"],
  intent: TasteFacet["intent"] = "enjoyed",
): TasteFacet => ({ interest, intent, strength: 1 });

describe("taste aggregation", () => {
  it("selects the same evidence regardless of database row ordering", () => {
    const entries = [evidence(1), { ...evidence(2), confidence: 0.5 }, evidence(3, "art")];
    const signals = [signal(1, "one", "same"), signal(2, "two", "same"), signal(3, "three")];
    expect(aggregateTaste(entries, signals, [], null)).toEqual(
      aggregateTaste([...entries].reverse(), [...signals].reverse(), [], null),
    );
  });
  it("keeps a single visit sparse even with twenty photos and multiple interests", () => {
    const entries = Array.from({ length: 20 }, (_, i) => evidence(i, i % 2 ? "gardens" : "art"));
    const result = aggregateTaste(
      entries,
      entries.map((_, i) => signal(i)),
      [],
      null,
    );
    expect(result.coverage).toBe("insufficient");
    expect(result.facets.map((f) => f.strength)).toEqual([1, 1]);
  });

  it("deduplicates exact content hashes across different sources and visits", () => {
    const result = aggregateTaste(
      [evidence(1), evidence(2)],
      [signal(1, "visit-one", "same-hash"), signal(2, "visit-two", "same-hash")],
      [],
      null,
    );
    expect(result.facets[0].evidenceIds).toEqual([id(101)]);
    expect(result.facets[0].strength).toBe(1);
  });

  it("excludes deleted, unselected, low-confidence and explicitly excluded evidence", () => {
    const result = aggregateTaste(
      [
        evidence(1),
        { ...evidence(2), excluded: true },
        { ...evidence(3), confidence: 0.34 },
        evidence(4),
      ],
      [signal(2), signal(3)],
      [],
      null,
    );
    expect(result.facets).toEqual([]);
    expect(result.coverage).toBe("insufficient");
  });

  it("preserves manual overrides across refresh and prevents dismissed evidence influencing coverage", () => {
    const overrides: TasteOverride[] = [
      { ...facet("gardens"), action: "dismiss" },
      { ...facet("cafes"), action: "prefer", strength: 3 },
    ];
    const before = structuredClone(overrides);
    const result = aggregateTaste(
      [evidence(1, "gardens"), evidence(2, "art"), evidence(3, "parks")],
      [signal(1, "another-visit"), signal(2), signal(3)],
      overrides,
      "An edited title",
    );
    expect(result.facets.map((f) => f.interest)).toEqual(["cafes", "art", "parks"]);
    expect(result.coverage).toBe("insufficient");
    expect(result.title).toBe("An edited title");
    expect(aggregateTaste([], [], overrides, null).facets[0]).toMatchObject({
      interest: "cafes",
      strength: 3,
    });
    expect(overrides).toEqual(before);
  });

  it("lets two explicit preferences provide coverage, but rejects contradictory duplicate overrides", () => {
    const overrides: TasteOverride[] = [
      { ...facet("gardens"), action: "prefer" },
      { ...facet("art"), action: "prefer" },
    ];
    expect(aggregateTaste([], [], overrides, null).coverage).toBe("ready");
    expect(
      tasteProfilePatchSchema.safeParse({
        expectedVersion: 1,
        overrides: [overrides[0], { ...overrides[0], action: "dismiss" }],
      }).success,
    ).toBe(false);
  });
});

describe("confirmed memory grouping", () => {
  const stop = {
    placeId: id(1),
    capturedAt: "2026-09-20T03:00:00Z",
    timezone: "America/Los_Angeles",
  };
  it("uses local calendar dates across UTC boundaries", () => {
    expect(JSON.parse(memoryGroupKey({ id: id(2), confirmedStop: stop, groupKey: null }))).toEqual([
      "2026-09-19",
      id(1),
      null,
    ]);
  });
  it("keeps unresolved items separate and supports explicit merge/split keys", () => {
    expect(memoryGroupKey({ id: id(2), confirmedStop: null, groupKey: "merged" })).not.toBe(
      memoryGroupKey({ id: id(3), confirmedStop: null, groupKey: "merged" }),
    );
    const a = { id: id(2), confirmedStop: stop, groupKey: "merged" };
    expect(memoryGroupKey(a)).toBe(memoryGroupKey({ ...a, id: id(3) }));
    expect(memoryGroupKey(a)).not.toBe(memoryGroupKey({ ...a, groupKey: "split" }));
  });
});

describe("published facet comparison", () => {
  it("is symmetric, deterministic and ignores strength in v1", () => {
    const a = [facet("gardens"), facet("art"), facet("cafes", "want_to_try")];
    const b = [facet("art"), { ...facet("gardens"), strength: 3 as const }];
    expect(compareTaste(a, b)).toEqual(compareTaste(b, a));
    expect(compareTaste(a, b)).toMatchObject({
      definitionVersion: 1,
      overlap: "strong",
      commonInterests: ["art", "gardens"],
    });
  });
  it("requires matching intent and enough coverage", () => {
    expect(compareTaste([facet("art")], [facet("art")]).overlap).toBe("insufficient");
    expect(
      compareTaste(
        [facet("art"), facet("gardens")],
        [facet("art", "want_to_try"), facet("gardens", "want_to_try")],
      ).overlap,
    ).toBe("different");
    expect(
      compareTaste(
        [facet("art"), facet("gardens"), facet("cafes")],
        [facet("art"), facet("parks"), facet("hiking")],
      ).overlap,
    ).toBe("some");
  });
});

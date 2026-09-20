import { describe, expect, it } from "vitest";
import type { RankingGroupDto } from "../../shared/api-contract";
import { planCreateSchema, rankingPutSchema } from "@/lib/contracts/api";
import { rankingInput } from "@/lib/web/ranking";
import { samplePlan } from "@/lib/web/plans";
import { otherPlaceId, place, placeId, requestId, thirdPlaceId, userId } from "./fixtures";

describe("ranking group writes", () => {
  const group: RankingGroupDto = {
    category: "culture",
    sentiment: "depends",
    placeIds: [otherPlaceId, thirdPlaceId, placeId],
    provisionalIds: [otherPlaceId, placeId],
    ties: [
      [otherPlaceId, thirdPlaceId],
      [placeId, otherPlaceId],
    ],
  };
  it("preserves the category, sentiment and others' state when settling a tie", () => {
    const result = rankingInput(placeId, "culture", "depends", [group], thirdPlaceId, "tie");
    expect(result).toMatchObject({
      sentiment: "depends",
      ranking: "settled",
      comparedTo: thirdPlaceId,
      tiedWith: thirdPlaceId,
      group: {
        category: "culture",
        sentiment: "depends",
        placeIds: [otherPlaceId, thirdPlaceId, placeId],
        provisionalIds: [otherPlaceId],
        ties: [
          [otherPlaceId, thirdPlaceId],
          [placeId, thirdPlaceId],
        ],
      },
    });
    expect(group.provisionalIds).toContain(placeId);
    expect(rankingPutSchema.safeParse(result).success).toBe(true);
    expect(result).not.toHaveProperty("rankScore");
  });

  it("keeps all sentiments separate and creates a new empty group safely", () => {
    const result = rankingInput(placeId, "culture", "skip", [group], "", "before");
    expect(result.group).toEqual({
      category: "culture",
      sentiment: "skip",
      placeIds: [placeId],
      provisionalIds: [],
      ties: [],
    });
  });

  it("rejects a stale comparison without submitting another category's group", () => {
    expect(() =>
      rankingInput(placeId, "nature", "depends", [group], otherPlaceId, "before"),
    ).toThrow("comparison changed");
  });

  it("places an existing item once at the selected position", () => {
    expect(
      rankingInput(placeId, "culture", "depends", [group], otherPlaceId, "before").group?.placeIds,
    ).toEqual([placeId, otherPlaceId, thirdPlaceId]);
  });
});

describe("accepted simulation plans", () => {
  it("produces a strict contract document using canonical IDs and only the current participant", () => {
    const result = samplePlan(
      userId,
      requestId,
      "  Afternoon  ",
      "2026-09-20",
      [otherPlaceId, placeId],
      [place, { ...place, id: otherPlaceId }],
    );
    expect(planCreateSchema.safeParse(result).success).toBe(true);
    expect(result.plan.provenance).toBe("simulation");
    expect(result.plan.title).toBe("Afternoon");
    expect(result.plan.constraints.participantIds).toEqual([userId]);
    expect(result.plan.stops.map((stop) => stop.placeId)).toEqual([otherPlaceId, placeId]);
    expect(result.plan.checks[0]).toContain("not been checked");
    expect(result.plan.totalMinutes).toBe(105);
    expect(result).not.toHaveProperty("createdBy");
  });

  it.each([
    { selected: [] },
    { selected: [placeId, placeId] },
    { selected: ["mobile-fixture-id"] },
  ])("rejects empty, duplicate or non-catalog stops: %j", ({ selected }) => {
    expect(() => samplePlan(userId, requestId, "Plan", "2026-09-20", selected, [place])).toThrow(
      "shared catalog",
    );
  });
});

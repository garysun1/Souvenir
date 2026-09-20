import { describe, expect, it } from "vitest";
import type { WishlistDto } from "../../shared/api-contract";
import { destinationCities } from "../../shared/destinations";
import { mutualDestinations, suggestedStops } from "../../shared/journey";
import { planCreateSchema } from "@/lib/contracts/api";
import { samplePlan } from "@/lib/web/plans";
import { similarVisit, type CaptureDraft } from "@/lib/web/capture";
import { edition, otherPlaceId, place, placeId, requestId, thirdPlaceId, userId } from "./fixtures";

const friendId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const list: WishlistDto = {
  id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  ownerId: userId,
  name: "Saturday together",
  isDefault: false,
  isShared: true,
  memberIds: [userId, friendId],
  entries: [
    { placeId: otherPlaceId, saverIds: [friendId], completedBy: [] },
    { placeId, saverIds: [userId, friendId], completedBy: [] },
    { placeId: thirdPlaceId, saverIds: [userId, friendId], completedBy: [userId] },
  ],
};

describe("saved destinations into a shared outing", () => {
  it("prioritizes mutual unvisited saves and retains other members' suggestions", () => {
    expect(mutualDestinations(list, userId).map((entry) => entry.placeId)).toEqual([placeId]);
    expect(suggestedStops(list, userId)).toEqual([placeId, otherPlaceId]);
    expect(suggestedStops(list, userId, 1)).toEqual([placeId]);
    expect(list.entries[0].placeId).toBe(otherPlaceId);
  });

  it("ignores former members for overlap and skips entries with no saves", () => {
    expect(mutualDestinations({ ...list, memberIds: [userId] }, userId)).toEqual([]);
    expect(
      suggestedStops({ ...list, entries: [{ placeId, saverIds: [], completedBy: [] }] }, userId),
    ).toEqual([]);
  });

  it("carries the list and every participant into a valid estimated plan", () => {
    const result = samplePlan(
      userId,
      requestId,
      list.name,
      "2026-09-21",
      suggestedStops(list, userId),
      [place, { ...place, id: otherPlaceId }],
      list,
    );
    expect(planCreateSchema.safeParse(result).success).toBe(true);
    expect(result.wishlistId).toBe(list.id);
    expect(result.plan.constraints.participantIds).toEqual([userId, friendId]);
    expect(result.plan.stops.map((stop) => stop.placeId)).toEqual([placeId, otherPlaceId]);
    expect(result.plan.provenance).toBe("simulation");
    expect(result.plan.checks.join()).toContain("not been checked");
  });
});

describe("destination picker", () => {
  it("keeps same-named cities in different countries distinct and skips incomplete locations", () => {
    const cities = destinationCities([
      { city: "Paris", country: "FR" },
      { city: "Paris", country: "US" },
      { city: "Paris", country: "fr" },
      { city: null, country: "FR" },
      { city: "Unknown", country: null },
    ]);
    expect(cities.map((item) => item.label)).toEqual(["Paris, France", "Paris, United States"]);
  });
});

describe("capture duplicate warning", () => {
  const draft: CaptureDraft = {
    requestId: friendId,
    placeId,
    capturedAt: edition.capturedAt,
    timezone: edition.timezone,
    note: "",
    companions: "",
    outingId: null,
    photo: null,
    photoName: null,
    submission: null,
    completedEditionId: null,
  };
  it("warns about a second nearby visit without treating an idempotent retry as a duplicate", () => {
    expect(similarVisit(draft, [edition])?.id).toBe(edition.id);
    expect(similarVisit({ ...draft, requestId: edition.requestId }, [edition])).toBeUndefined();
  });
  it("allows visits at another destination or time", () => {
    expect(similarVisit({ ...draft, placeId: otherPlaceId }, [edition])).toBeUndefined();
    expect(
      similarVisit({ ...draft, capturedAt: "2026-09-19T12:05:00.000Z" }, [edition]),
    ).toBeUndefined();
  });
});

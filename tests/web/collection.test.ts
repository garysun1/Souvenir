import { describe, expect, it } from "vitest";
import type { SetDto } from "../../shared/api-contract";
import { companionNames, groupEditions, savedPlaceIds, setProgress } from "@/lib/web/collection";
import { edition, otherPlaceId, place, snapshot, userId } from "./fixtures";

describe("shared account collection views", () => {
  it("groups revisits under one canonical place and orders actual instants", () => {
    const first = { ...edition, id: "earlier", capturedAt: "2026-09-19T12:00:00+02:00" };
    const revisit = {
      ...edition,
      id: "later",
      visitSequence: 2,
      capturedAt: "2026-09-19T11:00:00Z",
    };
    const other = {
      ...edition,
      id: "other",
      placeId: otherPlaceId,
      place: { ...place, id: otherPlaceId },
      capturedAt: "2026-09-18T12:00:00Z",
    };
    const source = [first, other, revisit];
    const groups = groupEditions(source);
    expect(groups).toHaveLength(2);
    expect(groups[0].editions.map((entry) => entry.id)).toEqual(["later", "earlier"]);
    expect(source.map((entry) => entry.id)).toEqual(["earlier", "other", "later"]);
  });

  it("counts set membership once regardless of revisits", () => {
    const set: SetDto = {
      id: "set",
      slug: "set",
      name: "Set",
      description: "",
      coverImageUrl: null,
      city: "LA",
      places: [place, { ...place, id: otherPlaceId }],
    };
    expect(setProgress(set, [edition, { ...edition, id: "revisit", visitSequence: 2 }])).toBe(1);
    expect(setProgress(set, [])).toBe(0);
  });

  it("only includes this account's own saves across accessible lists", () => {
    const data = {
      ...snapshot,
      wishlists: [
        {
          id: "one",
          ownerId: userId,
          name: "Personal",
          isShared: false,
          isDefault: true,
          memberIds: [userId],
          entries: [{ placeId: place.id, saverIds: [userId], completedBy: [] }],
        },
        {
          id: "two",
          ownerId: "other",
          name: "Shared",
          isShared: true,
          isDefault: false,
          memberIds: [userId, "other"],
          entries: [
            { placeId: place.id, saverIds: [userId], completedBy: [] },
            { placeId: otherPlaceId, saverIds: ["other"], completedBy: [] },
          ],
        },
      ],
    };
    expect([...savedPlaceIds(data)]).toEqual([place.id]);
  });

  it("normalizes private companion names without treating them as identities", () => {
    expect(companionNames(" Taylor, , Quinn ,")).toEqual(["Taylor", "Quinn"]);
    expect(companionNames("")).toEqual([]);
    expect(() => companionNames(Array.from({ length: 31 }, () => "Name").join(","))).toThrow("30");
    expect(() => companionNames("n".repeat(101))).toThrow("100");
  });
});

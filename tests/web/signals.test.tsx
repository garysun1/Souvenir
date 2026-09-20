import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UserStats } from "@/components/social/user-stats";
import { PlaceSignals } from "@/components/catalog/place-signals";
import type { PlaceDetailDto, UserStatsDto } from "../../shared/api-contract";
import { place } from "./fixtures";

afterEach(() => vi.unstubAllGlobals());

describe("activity signal rendering", () => {
  it("renders zero visits and unknown rank honestly instead of injecting account fixtures", () => {
    vi.stubGlobal("React", React);
    const stats: UserStatsDto = {
      placesVisited: 0,
      editions: 0,
      citiesVisited: 0,
      currentStreakWeeks: 0,
      longestStreakWeeks: 0,
      globalRank: null,
      cityRanks: [],
      computedAt: "2026-09-20T00:00:00Z",
      provenance: "souvenir-activity",
      definitionVersion: 1,
      sampleStatus: "insufficient",
    };
    const html = renderToStaticMarkup(<UserStats stats={stats} />);
    expect(html).toContain("0 weeks");
    expect(html).toContain("Unknown");
    expect(html).toContain("No eligible city rank");
    expect(html).not.toContain("#1");
  });
  it("does not treat unavailable profile statistics as a zero-valued public profile", () => {
    vi.stubGlobal("React", React);
    const html = renderToStaticMarkup(<UserStats stats={null} />);
    expect(html).toContain("unavailable or not shared");
    expect(html).not.toContain("Places visited");
  });
  it("keeps appeal, frequency, availability, recommendations and friend counts separate", () => {
    vi.stubGlobal("React", React);
    const detail: PlaceDetailDto = {
      ...place,
      tags: [],
      myTags: [],
      notes: [],
      myNotes: [],
      images: [],
      sources: [],
      metrics: null,
      social: { friendsBeen: 2, friendsSaved: 3 },
      availability: {
        status: "unknown",
        openingHours: null,
        timezone: null,
        sourceId: null,
        fetchedAt: null,
      },
    };
    const html = renderToStaticMarkup(<PlaceSignals place={detail} />);
    for (const label of [
      "Personal appeal",
      "Discovery frequency",
      "Documented availability",
      "Recommendations",
      "2 accepted friends have been",
      "3 accepted friends saved it",
    ])
      expect(html).toContain(label);
    expect(html).toContain("no current documented hours");
    expect(html).not.toContain("0%");
    expect(html).not.toContain("common");
  });
});

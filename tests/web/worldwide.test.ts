import { describe, expect, it } from "vitest";
import type { PlaceMetricsDto } from "../../shared/api-contract";
import {
  atlasPoints,
  canonicalPlaceId,
  cityOptions,
  frequencyText,
  placeLocation,
  placePath,
  privatePlaceCreate,
  safeExternalUrl,
  type CustomPlaceFields,
} from "@/lib/web/worldwide";
import { place, placeId, requestId } from "./fixtures";

const metrics: PlaceMetricsDto = {
  provenance: "souvenir-activity",
  definitionVersion: 1,
  computedAt: "2026-09-20T00:00:00Z",
  sampleStatus: "ready",
  collectors: 2,
  editions: 3,
  saves: 1,
  discoveryFreq: 0.4,
  frequency: {
    status: "ready",
    visitors90d: 2,
    cityVisitors90d: 5,
    city: "Lisbon",
    country: "PT",
    windowStart: "2026-06-22T00:00:00Z",
    windowEnd: "2026-09-20T00:00:00Z",
    minimumCohort: 5,
  },
  recommendRate: null,
  sentiment: { status: "insufficient", recommend: 1, depends: 0, skip: 0, minimumSample: 5 },
  trendingScore: null,
  trend: {
    status: "insufficient",
    collectors7d: 2,
    weeklyCollectors8w: [],
    collectors8wAvg: null,
    baselineStart: "2026-07-19T00:00:00Z",
    baselineEnd: "2026-09-13T00:00:00Z",
  },
};

describe("truthful worldwide presentation", () => {
  it("shows the cohort, numerator, denominator and time window for a supported frequency", () => {
    expect(frequencyText(metrics)).toContain("40%");
    expect(frequencyText(metrics)).toContain("Lisbon, PT over 90 days (2 of 5)");
  });
  it("never converts an unknown or small cohort to a rarity tier or zero percent", () => {
    const small = frequencyText({
      ...metrics,
      discoveryFreq: null,
      frequency: { ...metrics.frequency, status: "insufficient", cityVisitors90d: 2 },
    });
    expect(small).toContain("Unknown");
    expect(small).toContain("at least 5");
    expect(small).not.toMatch(/%|common|rare/i);
    expect(
      frequencyText({ ...metrics, frequency: { ...metrics.frequency, city: null } }),
    ).toContain("no documented city cohort");
    expect(frequencyText(null)).toContain("Unknown");
  });
  it("distinguishes stale from unavailable activity", () => {
    expect(
      frequencyText({ ...metrics, frequency: { ...metrics.frequency, status: "stale" } }),
    ).toMatch(/^Stale/);
    expect(
      frequencyText({ ...metrics, frequency: { ...metrics.frequency, status: "unavailable" } }),
    ).toContain("unavailable");
  });
  it("separates equal city names across countries and leaves missing locality unknown", () => {
    expect(
      cityOptions([
        { ...place, city: "Paris", country: "FR" },
        { ...place, city: "Paris", country: "US" },
        { ...place, city: "Paris", country: "FR" },
        { ...place, city: null, country: "US" },
      ]).map(([, city]) => city),
    ).toEqual([
      { city: "Paris", country: "FR" },
      { city: "Paris", country: "US" },
    ]);
    expect(placeLocation({ city: null, region: null, country: null })).toBe("Locality unknown");
  });
  it("maps multiple hemispheres and the date line without admitting invalid coordinates", () => {
    const points = atlasPoints([
      { ...place, name: "Lisbon", lat: 38.72, lng: -9.14 },
      { ...place, name: "Sydney", lat: -33.86, lng: 151.21 },
      { ...place, name: "Date line", lat: 0, lng: 180 },
      { ...place, lat: NaN },
      { ...place, lng: 181 },
    ]);
    expect(points).toHaveLength(3);
    expect(points[0].y).toBeLessThan(240);
    expect(points[1].y).toBeGreaterThan(240);
    expect(points[1].x).toBeGreaterThan(points[0].x);
    expect(points[2]).toMatchObject({ x: 960, y: 240 });
  });
  it("keeps canonical UUID writes distinct from slug routes and mobile demo IDs", () => {
    expect(canonicalPlaceId(placeId)).toBe(true);
    expect(canonicalPlaceId("griffith-observatory")).toBe(false);
    expect(canonicalPlaceId("place-1")).toBe(false);
    expect(placePath("lisbon-viewpoint")).toBe("/places/lisbon-viewpoint");
    expect(placePath("../api/me")).toBe("/places/..%2Fapi%2Fme");
  });
  it.each([
    "javascript:alert(1)",
    "data:image/svg+xml,x",
    "https://user:password@example.com",
    "/api/private",
  ])("rejects unsafe provenance links: %s", (url) => {
    expect(safeExternalUrl(url)).toBeNull();
  });
  it("preserves a documented source URL", () => {
    expect(safeExternalUrl("https://commons.wikimedia.org/wiki/File:Example.jpg")).toBe(
      "https://commons.wikimedia.org/wiki/File:Example.jpg",
    );
  });
});

describe("explicit custom destination creation", () => {
  const fields: CustomPlaceFields = {
    name: "My quiet viewpoint",
    category: "nature",
    lat: "0",
    lng: "0",
    city: "",
    country: "",
  };
  it("accepts explicitly entered zero coordinates without inventing locality or owner identity", () => {
    const body = privatePlaceCreate(fields, requestId);
    expect(body).toMatchObject({
      requestId,
      lat: 0,
      lng: 0,
      city: null,
      country: null,
      visibility: "private",
    });
    expect(body).not.toHaveProperty("ownerId");
    expect(body).not.toHaveProperty("userId");
  });
  it.each([
    { lat: "" },
    { lng: " " },
    { lat: "91" },
    { lng: "-181" },
    { lat: "NaN" },
    { country: "USA" },
    { name: " " },
  ])("rejects incomplete or invalid user input: %j", (invalid) => {
    expect(() => privatePlaceCreate({ ...fields, ...invalid }, requestId)).toThrow();
  });
  it("normalizes optional country and name without choosing coordinates for the user", () => {
    expect(
      privatePlaceCreate(
        {
          ...fields,
          name: " Viewpoint ",
          city: " Lisbon ",
          country: "pt",
          lat: "38.7",
          lng: "-9.1",
        },
        requestId,
      ),
    ).toMatchObject({ name: "Viewpoint", city: "Lisbon", country: "PT", lat: 38.7, lng: -9.1 });
  });
});

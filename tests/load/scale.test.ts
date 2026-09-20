import { describe, expect, it } from "vitest";
import { cities, fixtures, friendPairs, persona } from "../../scripts/load/fixtures";
import { latencyReport, timings } from "../../scripts/load/api";

describe("scale evidence", () => {
  it("provides 2000 places, 7000 photo visits, and 30 accepted neighbors plus an isolated user", () => {
    expect(fixtures).toHaveLength(2000);
    for (const city of cities)
      expect(fixtures.filter((place) => place.city === city.city)).toHaveLength(250);
    const photos = Array.from(
      { length: 1000 },
      (_, index) =>
        persona("souvenir-v1", index, null).visits.filter((_, visit) => visit % 5 === 0).length,
    );
    expect(photos.reduce((sum, count) => sum + count, 0)).toBe(7000);
    const pairs = friendPairs(1000);
    const keys = pairs.map(([a, b]) => [a, b].sort((x, y) => x - y).join(":"));
    expect(new Set(keys).size).toBe(pairs.length);
    const degrees = Array.from({ length: 1000 }, () => 0);
    for (const [a, b] of pairs) {
      expect(a).not.toBe(b);
      degrees[a]++;
      degrees[b]++;
    }
    expect(degrees.slice(0, -1).every((degree) => degree === 30)).toBe(true);
    expect(degrees.at(-1)).toBe(0);
  });

  it("reports nearest-rank p99 without sorting the live measurement stream", () => {
    const samples = Array.from({ length: 100 }, (_, index) => 100 - index);
    timings.set("synthetic", samples);
    try {
      const report = latencyReport().find((entry) => entry.route === "synthetic");
      expect(report).toMatchObject({ count: 100, p50Ms: 50, p95Ms: 95, p99Ms: 99, maxMs: 100 });
      expect(samples[0]).toBe(100);
    } finally {
      timings.delete("synthetic");
    }
  });
});

import { describe, expect, it } from "vitest";
import { haversineKm } from "@/lib/search/pgFallback";
describe("haversineKm", () => {
  it("returns zero for the same point", () => expect(haversineKm(34, -118, 34, -118)).toBe(0));
  it("calculates a plausible LA to San Francisco distance", () => {
    const distance = haversineKm(34.0522, -118.2437, 37.7749, -122.4194);
    expect(distance).toBeGreaterThan(540);
    expect(distance).toBeLessThan(570);
  });
});

import { describe, expect, it } from "vitest";
import { destinationCities } from "../../shared/destinations";
import { placeListQuerySchema } from "@/lib/contracts/worldwide";

describe("catalog cities with missing country metadata", () => {
  it("offers an explicit unknown-country option without guessing its country", () => {
    expect(
      destinationCities(
        [
          { city: "Los Angeles", country: null },
          { city: "Paris", country: "FR" },
          { city: "Paris", country: null },
          { city: "Los Angeles", country: null },
          { city: null, country: "US" },
        ],
        true,
      ).map((item) => item.label),
    ).toEqual([
      "Los Angeles, country not recorded",
      "Paris, country not recorded",
      "Paris, France",
    ]);
  });

  it("accepts explicitly unknown countries while retaining unambiguous ordinary filters", () => {
    expect(
      placeListQuerySchema.parse({ city: "Los Angeles", countryUnknown: "true" }),
    ).toMatchObject({
      city: "Los Angeles",
      countryUnknown: "true",
    });
    expect(placeListQuerySchema.safeParse({ city: "Paris" }).success).toBe(false);
    expect(placeListQuerySchema.safeParse({ countryUnknown: "true" }).success).toBe(false);
    expect(
      placeListQuerySchema.safeParse({ city: "Paris", country: "FR", countryUnknown: "true" })
        .success,
    ).toBe(false);
    expect(placeListQuerySchema.safeParse({ city: "Paris", country: "FR" }).success).toBe(true);
  });
});

import { boundingBoxSchema, nearbyQuerySchema } from "@/lib/contracts/api";
import type { BoundingBox, NearbyQuery } from "../../../shared/api-contract";
import { buildFixtureCity, fixtureCities } from "./fixtures";
import { distanceM, inBounds } from "./geo";
import { providerPlaceSchema, type PlacesProvider, type ProviderPlace } from "./types";

export class MockPlacesProvider implements PlacesProvider {
  readonly name = "curated";
  private readonly records: ProviderPlace[];
  constructor(records = fixtureCities.flatMap(buildFixtureCity)) {
    this.records = records.map((record) => providerPlaceSchema.parse(record));
  }
  async bbox(box: BoundingBox, limit: number): Promise<ProviderPlace[]> {
    boundingBoxSchema.parse(box);
    if (!Number.isInteger(limit) || limit < 1 || limit > 500)
      throw new RangeError("Invalid limit.");
    return this.records.filter((record) => inBounds(record, box)).slice(0, limit);
  }
  async nearby(input: NearbyQuery): Promise<ProviderPlace[]> {
    const query = nearbyQuerySchema.parse(input);
    return this.records
      .filter(
        (record) =>
          distanceM(query, record) <= query.radiusM &&
          (!query.category || record.category === query.category) &&
          (!query.country || record.country === query.country),
      )
      .sort(
        (a, b) =>
          distanceM(query, a) - distanceM(query, b) || a.providerId.localeCompare(b.providerId),
      )
      .slice(0, query.limit);
  }
}

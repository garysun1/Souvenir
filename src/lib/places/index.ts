import { env } from "@/lib/env";
import { createProviderHttp } from "./http";
import { MockPlacesProvider } from "./mock";
import { OsmPlacesProvider } from "./osm";
import { ProviderError, type PlacesProvider } from "./types";

export { findDuplicateCandidates } from "./dedupe";
export { ingestProviderPlaces, getPlaceSources, getDocumentedAvailability } from "./store";
export { normalizePlace } from "./normalize";
export type { ProviderPlace, PlacesProvider } from "./types";

let provider: PlacesProvider | undefined;
export function assertLocalDatabase(url: string): void {
  const target = new URL(url);
  if (
    !["postgres:", "postgresql:"].includes(target.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname)
  ) {
    throw new Error(
      "Destination fixture and maintenance tools require a disposable loopback database.",
    );
  }
}
export function assertDisposableDatabase(): void {
  assertLocalDatabase(env.DATABASE_URL);
  if (env.NODE_ENV === "production" || env.PLACES_DISPOSABLE_DATABASE_URL !== env.DATABASE_URL) {
    throw new Error(
      "Set PLACES_DISPOSABLE_DATABASE_URL to the explicit local DATABASE_URL to acknowledge disposable data.",
    );
  }
}
export function getPlacesProvider(): PlacesProvider {
  if (provider) return provider;
  if (env.PLACES_PROVIDER === "mock") {
    assertDisposableDatabase();
    return (provider = new MockPlacesProvider());
  }
  if (!env.OVERPASS_URL) throw new ProviderError("not_configured");
  if (env.NODE_ENV === "production" && !env.OVERPASS_MANAGED_ENDPOINT)
    throw new ProviderError("not_configured");
  const endpoint = new URL(env.OVERPASS_URL);
  if (
    !["https:", "http:"].includes(endpoint.protocol) ||
    endpoint.username ||
    endpoint.password ||
    (env.NODE_ENV === "production" &&
      ["overpass-api.de", "overpass.kumi.systems", "overpass.private.coffee"].some(
        (host) => endpoint.hostname === host || endpoint.hostname.endsWith(`.${host}`),
      ))
  ) {
    throw new ProviderError("not_configured");
  }
  return (provider = new OsmPlacesProvider(
    endpoint.toString(),
    createProviderHttp(env.PLACES_USER_AGENT),
  ));
}

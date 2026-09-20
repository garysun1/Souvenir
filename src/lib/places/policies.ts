import type { ProviderPlace } from "./types";

export const POLICY_CHECKED_AT = new Date("2026-09-20T00:00:00.000Z");
export const sourcePolicies = {
  osm: {
    license: "ODbL-1.0",
    licenseUrl: "https://opendatacommons.org/licenses/odbl/1-0/",
    attribution: "© OpenStreetMap contributors",
    policyUrl: "https://osmfoundation.org/wiki/Licence/Attribution_Guidelines",
  },
  wikidata: {
    license: "CC0-1.0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    attribution: "Wikidata",
    policyUrl: "https://www.wikidata.org/wiki/Wikidata:Data_access",
  },
  curated: {
    license: "Authored synthetic test fixture",
    licenseUrl: null,
    attribution: "Souvenir test fixtures; not real destinations or provider evidence",
    policyUrl: "https://github.com/garysun1/Souvenir",
  },
};
export function providerSourceUrl(record: ProviderPlace): string | null {
  if (record.provider === "osm") return `https://www.openstreetmap.org/${record.providerId}`;
  if (record.provider === "wikidata") return `https://www.wikidata.org/wiki/${record.providerId}`;
  return null;
}

import { readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { closeDb } from "../src/lib/db";
import {
  assertDisposableDatabase,
  getPlacesProvider,
  ingestProviderPlaces,
} from "../src/lib/places";
import { fixtureCities } from "../src/lib/places/fixtures";
import { providerPlaceSchema } from "../src/lib/places/types";
import { radiusBounds } from "../src/lib/places/geo";

async function main() {
  const { values } = parseArgs({
    options: {
      offline: { type: "boolean", default: false },
      city: { type: "string" },
      all: { type: "boolean", default: false },
      apply: { type: "boolean", default: false },
    },
  });
  assertDisposableDatabase();
  if (!values.apply)
    throw new Error("Use --apply to ingest into the acknowledged disposable database.");
  if (values.all === !!values.city)
    throw new Error("Select exactly one of --city <slug> or --all.");
  if (values.all && !values.offline)
    throw new Error("Provider ingest is restricted to one city per invocation.");
  const cities = values.all
    ? fixtureCities
    : fixtureCities.filter((city) => city.slug === values.city);
  if (!cities.length)
    throw new Error(`Unknown city. Choose ${fixtureCities.map((city) => city.slug).join(", ")}.`);
  for (const city of cities) {
    const records = values.offline
      ? (
          await readFile(
            new URL(`../tests/places/fixtures/${city.slug}.jsonl`, import.meta.url),
            "utf8",
          )
        )
          .trim()
          .split("\n")
          .map((line) => providerPlaceSchema.parse(JSON.parse(line)))
      : await getPlacesProvider().bbox(radiusBounds(city.lat, city.lng, 2000), 500);
    if (
      values.offline &&
      records.some(
        (record) =>
          record.provider !== "curated" ||
          record.evidence !== "synthetic-fixture" ||
          !record.providerId.startsWith(`synthetic-v1/${city.slug}/`),
      )
    ) {
      throw new Error("Offline fixtures must use the city's synthetic namespace.");
    }
    const result = await ingestProviderPlaces(records);
    console.log(
      JSON.stringify({
        city: city.slug,
        evidence: values.offline ? "synthetic-fixture" : "provider",
        inserted: result.inserted,
        refreshed: result.refreshed,
        needsReview: result.needsReview,
      }),
    );
  }
}
main()
  .catch(() => {
    console.error(
      "Ingest failed. Check explicit disposable DB acknowledgement, --apply, --offline and --city/--all; provider errors require retry or operator review.",
    );
    process.exitCode = 1;
  })
  .finally(closeDb);

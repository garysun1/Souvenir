import "dotenv/config";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import extension from "../db/seed/mobile-extension.json";
import { mobileFixtureToSlug } from "../shared/catalog-map";
import { closeDb, db } from "../src/lib/db";
import { places, setPlaces, sets } from "../src/lib/db/schema";

const rows = z
  .array(
    z
      .object({
        slug: z.string().min(1),
        name: z.string().min(1),
        category: z.enum(["nature", "culture", "landmark"]),
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        description: z.string().min(1),
      })
      .strict(),
  )
  .parse(extension);
const canonicalSlugs = Object.values(mobileFixtureToSlug);

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--apply"))
    throw new Error("Usage: tsx scripts/extend-catalog.ts [--apply]");
  const apply = args.includes("--apply");
  const existing = await db.select({ id: places.id, slug: places.slug }).from(places);
  const existingSlugs = new Set(existing.map((place) => place.slug));
  const additions = rows.filter((place) => !existingSlugs.has(place.slug));
  const unmapped = canonicalSlugs.filter(
    (slug) => !existingSlugs.has(slug) && !rows.some((row) => row.slug === slug),
  );
  if (unmapped.length) throw new Error(`Missing canonical base places: ${unmapped.join(", ")}`);
  if (!apply) {
    console.log(
      JSON.stringify({
        mode: "dry-run",
        additions: additions.map((place) => place.slug),
        existingPlaces: existing.length,
      }),
    );
    return;
  }
  await db.transaction(async (tx) => {
    await tx
      .insert(places)
      .values(
        rows.map((row) => ({
          ...row,
          city: "Los Angeles",
          rarityTier: "common" as const,
          rarityAppeal: 0,
          rarityDiscoveryFreq: 0,
          rarityAvailability: 0,
          stats: { provenance: "prototype-catalog", verified: false, rarityStatus: "unavailable" },
          externalIds: {},
        })),
      )
      .onConflictDoNothing({ target: places.slug });
    await tx
      .insert(sets)
      .values({
        slug: "downtown-firsts",
        name: "Downtown Firsts",
        description: "Three places. A whole new side of your city.",
        city: "Los Angeles",
      })
      .onConflictDoNothing({ target: sets.slug });
    const [set] = await tx.select().from(sets).where(eq(sets.slug, "downtown-firsts"));
    const slugs = ["los-angeles-central-library", "the-broad", "grand-park"];
    const members = await tx.select().from(places).where(inArray(places.slug, slugs));
    await tx
      .insert(setPlaces)
      .values(
        members.map((place) => ({
          setId: set.id,
          placeId: place.id,
          position: slugs.indexOf(place.slug),
        })),
      )
      .onConflictDoNothing();
  });
  const catalog = await db.select({ id: places.id, slug: places.slug }).from(places);
  const bySlug = new Map(catalog.map((place) => [place.slug, place.id]));
  console.log(
    JSON.stringify({
      mode: "applied",
      totalPlaces: catalog.length,
      mapping: Object.fromEntries(
        Object.entries(mobileFixtureToSlug).map(([fixture, slug]) => [fixture, bySlug.get(slug)]),
      ),
    }),
  );
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Catalog extension failed");
    process.exitCode = 1;
  })
  .finally(closeDb);

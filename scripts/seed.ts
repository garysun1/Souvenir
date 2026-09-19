import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { eq, notInArray } from "drizzle-orm";
import { closeDb, db } from "../src/lib/db";
import { places, setPlaces, sets, users } from "../src/lib/db/schema";
import { env } from "../src/lib/env";

type SeedPlace = {
  slug: string;
  name: string;
  category: "nature" | "culture" | "food" | "landmark" | "hidden_gem";
  lat: number;
  lng: number;
  city: string;
  description: string;
  hero_image_url: string;
  rarity_tier: "common" | "uncommon" | "rare" | "epic" | "legendary";
  rarity_appeal: number;
  rarity_discovery_freq: number;
  rarity_availability: number;
};

const setsToSeed = [
  {
    slug: "griffith-and-the-hills",
    name: "Griffith & the Hills",
    description: "Trails, overlooks, and hidden corners above the city.",
    slugs: [
      "griffith-observatory",
      "griffith-park-old-zoo",
      "hollywood-sign-hike",
      "bronson-canyon",
      "runyon-canyon",
      "lake-hollywood-park",
      "wisdom-tree",
    ],
  },
  {
    slug: "museum-row",
    name: "Museum Row",
    description: "Art, science, cinema, and design along Wilshire Boulevard.",
    slugs: [
      "los-angeles-county-museum-of-art",
      "petersen-automotive-museum",
      "academy-museum-of-motion-pictures",
      "la-brea-tar-pits",
      "the-getty-center",
    ],
  },
  {
    slug: "coastal-sunsets",
    name: "Coastal Sunsets",
    description: "Ocean air, dramatic bluffs, and golden-hour shorelines.",
    slugs: [
      "santa-monica-pier",
      "venice-canals",
      "el-matador-state-beach",
      "point-dume",
      "malibu-seafood",
      "topanga-state-park",
    ],
  },
];

async function main() {
  const raw = await fs.readFile(path.join(process.cwd(), "db/seed/la-places.json"), "utf8");
  const seedPlaces = JSON.parse(raw) as SeedPlace[];
  const inserted = new Map<string, string>();
  await db.delete(setPlaces);
  await db.delete(places).where(
    notInArray(
      places.slug,
      seedPlaces.map((place) => place.slug),
    ),
  );

  for (const place of seedPlaces) {
    const [row] = await db
      .insert(places)
      .values({
        slug: place.slug,
        name: place.name,
        category: place.category,
        lat: place.lat,
        lng: place.lng,
        city: place.city,
        description: place.description,
        heroImageUrl: place.hero_image_url,
        rarityTier: place.rarity_tier,
        rarityAppeal: place.rarity_appeal,
        rarityDiscoveryFreq: place.rarity_discovery_freq,
        rarityAvailability: place.rarity_availability,
        externalIds: {},
        stats: {},
      })
      .onConflictDoUpdate({
        target: places.slug,
        set: {
          name: place.name,
          category: place.category,
          lat: place.lat,
          lng: place.lng,
          city: place.city,
          description: place.description,
          heroImageUrl: place.hero_image_url,
          rarityTier: place.rarity_tier,
          rarityAppeal: place.rarity_appeal,
          rarityDiscoveryFreq: place.rarity_discovery_freq,
          rarityAvailability: place.rarity_availability,
        },
      })
      .returning({ id: places.id });
    inserted.set(place.slug, row.id);
  }

  const userId = env.DEV_USER_ID ?? "00000000-0000-0000-0000-000000000001";
  await db
    .insert(users)
    .values({
      id: userId,
      handle: "dev",
      displayName: "Dev User",
      homeCity: "Los Angeles",
    })
    .onConflictDoUpdate({
      target: users.id,
      set: { displayName: "Dev User", homeCity: "Los Angeles" },
    });

  for (const collection of setsToSeed) {
    const [set] = await db
      .insert(sets)
      .values({
        slug: collection.slug,
        name: collection.name,
        description: collection.description,
        city: "Los Angeles",
      })
      .onConflictDoUpdate({
        target: sets.slug,
        set: { name: collection.name, description: collection.description, city: "Los Angeles" },
      })
      .returning({ id: sets.id });
    await db.delete(setPlaces).where(eq(setPlaces.setId, set.id));
    await db.insert(setPlaces).values(
      collection.slugs.map((slug, position) => ({
        setId: set.id,
        placeId: inserted.get(slug)!,
        position,
      })),
    );
  }
  console.log(`Seeded ${seedPlaces.length} places and ${setsToSeed.length} sets.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => closeDb());

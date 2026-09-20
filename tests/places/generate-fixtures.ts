import { writeFile } from "node:fs/promises";
import { buildFixtureCity, fixtureCities } from "../../src/lib/places/fixtures";

async function main() {
  for (const city of fixtureCities) {
    await writeFile(
      new URL(`./fixtures/${city.slug}.jsonl`, import.meta.url),
      buildFixtureCity(city)
        .map((record) => JSON.stringify(record))
        .join("\n") + "\n",
    );
  }
}
void main();

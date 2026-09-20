import { closeDb } from "../src/lib/db";
import { env } from "../src/lib/env";
import { assertDisposableDatabase } from "../src/lib/places";
import { cleanupPlaceImageObjects } from "../src/lib/server/place-images";

async function main() {
  assertDisposableDatabase();
  const args = process.argv.slice(2);
  if (args.length !== 1 || args[0] !== "--apply")
    throw new Error("Use --apply to remove orphaned public derivatives.");
  const url = new URL(env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
    throw new Error("Cleanup requires local Storage.");
  console.log(JSON.stringify({ cleaned: await cleanupPlaceImageObjects() }));
}

main()
  .catch(() => {
    console.error(
      "Image cleanup failed; verify explicit disposable database and local Storage configuration.",
    );
    process.exitCode = 1;
  })
  .finally(closeDb);

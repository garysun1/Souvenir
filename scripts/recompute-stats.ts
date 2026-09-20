import { closeDb } from "../src/lib/db";
import { env } from "../src/lib/env";
import { recomputeStats } from "../src/lib/server/stats";

async function main() {
  const url = new URL(env.DATABASE_URL);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    throw new Error("Social recomputation is restricted to an explicit local DATABASE_URL.");
  }
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && !/^\d{4}-\d{2}-\d{2}T/.test(args[0]))) {
    throw new Error("Usage: tsx scripts/recompute-stats.ts [asOf ISO timestamp]");
  }
  const now = args[0] ? new Date(args[0]) : new Date();
  if (!Number.isFinite(now.getTime())) throw new Error("Invalid asOf timestamp.");
  await recomputeStats({ now });
  console.log(`Social aggregates recomputed as of ${now.toISOString()}.`);
}

main()
  .catch(() => {
    console.error("Social recomputation failed; verify the local database and timestamp.");
    process.exitCode = 1;
  })
  .finally(closeDb);

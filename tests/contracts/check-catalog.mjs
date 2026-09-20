import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const root = fileURLToPath(new URL("../../", import.meta.url));
const container = `souvenir-catalog-${randomUUID()}`;
const docker = (...args) =>
  execFileSync("docker", args, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
const json = (path) => JSON.parse(readFileSync(new URL(`../../${path}`, import.meta.url), "utf8"));
let client;

try {
  docker(
    "run",
    "--detach",
    "--name",
    container,
    "-p",
    "127.0.0.1::5432",
    "-e",
    "POSTGRES_HOST_AUTH_METHOD=trust",
    "postgres:16",
  );
  execFileSync(
    "docker",
    [
      "exec",
      container,
      "sh",
      "-c",
      "until pg_isready -h 127.0.0.1 -U postgres; do sleep 0.2; done",
    ],
    { timeout: 30000, stdio: "pipe" },
  );
  const address = docker("port", container, "5432/tcp").trim();
  const url = `postgres://postgres@${address}/postgres`;
  client = postgres(url, { max: 1 });
  for (const entry of json("drizzle/meta/_journal.json").entries) {
    const migration = readFileSync(
      new URL(`../../drizzle/${entry.tag}.sql`, import.meta.url),
      "utf8",
    );
    await client.unsafe(migration);
  }
  const baseline = json("db/seed/la-places.json");
  await client`INSERT INTO places ${client(
    baseline.map((place) => ({
      ...place,
      id: randomUUID(),
    })),
  )}`;
  await client`INSERT INTO places ${client({
    ...baseline[0],
    id: randomUUID(),
    slug: "unrelated-place",
    name: "Preserve unrelated",
  })}`;
  const before = await client`SELECT * FROM places ORDER BY slug`;
  const extend = (...args) =>
    execFileSync("corepack", ["pnpm", "exec", "tsx", "scripts/extend-catalog.ts", ...args], {
      cwd: root,
      env: { ...process.env, DATABASE_URL: url },
      encoding: "utf8",
    });

  assert.equal(JSON.parse(extend()).additions.length, 22);
  assert.deepEqual(await client`SELECT * FROM places ORDER BY slug`, before);
  const first = JSON.parse(extend("--apply"));
  assert.equal(first.totalPlaces, 53);
  assert.equal(Object.keys(first.mapping).length, 30);
  assert.equal(new Set(Object.values(first.mapping)).size, 30);
  assert.deepEqual(
    await client`SELECT * FROM places WHERE slug = ANY(${before.map((place) => place.slug)}) ORDER BY slug`,
    before,
  );
  await client`UPDATE places SET description='User edited description' WHERE slug='grand-park'`;
  await client`INSERT INTO set_places(set_id,place_id,position)
    SELECT sets.id, places.id, 9 FROM sets CROSS JOIN places
    WHERE sets.slug='downtown-firsts' AND places.slug='unrelated-place'`;
  const stablePlaces = await client`SELECT * FROM places ORDER BY slug`;
  const stableSets = await client`SELECT * FROM set_places ORDER BY place_id`;
  const second = JSON.parse(extend("--apply"));
  assert.deepEqual(second, first);
  assert.deepEqual(await client`SELECT * FROM places ORDER BY slug`, stablePlaces);
  assert.deepEqual(await client`SELECT * FROM set_places ORDER BY place_id`, stableSets);
  assert.equal(JSON.parse(extend()).additions.length, 0);
  console.log(
    "Local catalog extension: dry-run, 30 mappings, 22 inserts, repeated execution and existing data preservation passed.",
  );

  if (process.argv.includes("--build")) {
    execFileSync("corepack", ["pnpm", "build"], {
      cwd: root,
      env: { ...process.env, DATABASE_URL: url },
      stdio: "inherit",
    });
  }
} finally {
  if (client) await client.end();
  docker("rm", "--force", container);
}

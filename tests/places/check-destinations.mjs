import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const root = fileURLToPath(new URL("../../", import.meta.url));
const container = `souvenir-destinations-${randomUUID()}`;
const docker = (...args) =>
  execFileSync("docker", args, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
let client;
let started = false;
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
  started = true;
  docker(
    "exec",
    container,
    "sh",
    "-c",
    "until pg_isready -h 127.0.0.1 -U postgres; do sleep 0.2; done",
  );
  const url = `postgres://postgres@${docker("port", container, "5432/tcp").trim()}/postgres`;
  client = postgres(url, { max: 1 });
  await client`ALTER DATABASE postgres SET client_min_messages = 'warning'`;
  const journal = JSON.parse(
    readFileSync(new URL("../../drizzle/meta/_journal.json", import.meta.url), "utf8"),
  );
  for (const { tag } of journal.entries)
    await client.unsafe(readFileSync(new URL(`../../drizzle/${tag}.sql`, import.meta.url), "utf8"));
  const env = {
    HOME: process.env.HOME,
    PATH: process.env.PATH,
    DATABASE_URL: url,
    PLACES_DISPOSABLE_DATABASE_URL: url,
    PLACES_PROVIDER: "mock",
    SEARCH_PROVIDER: "pg",
    AI_PROVIDER: "mock",
    NODE_ENV: "test",
    NODE_OPTIONS: "--conditions=react-server",
  };
  for (let run = 0; run < 2; run++) {
    execFileSync(
      "corepack",
      ["pnpm", "exec", "tsx", "scripts/ingest-city.ts", "--offline", "--all", "--apply"],
      { cwd: root, env, stdio: "inherit" },
    );
    const [result] = await client`select count(*)::int as places from places`;
    const [sources] = await client`select count(*)::int as sources from place_sources`;
    if (result.places !== 2000 || sources.sources !== 2000)
      throw new Error("Fixture ingest is not complete and idempotent.");
  }
  execFileSync(
    "corepack",
    ["pnpm", "exec", "vitest", "run", "--config", "tests/places/vitest.integration.config.ts"],
    {
      cwd: root,
      env: { ...env, NODE_OPTIONS: "" },
      stdio: "inherit",
    },
  );
  if (process.argv.includes("--build"))
    execFileSync("corepack", ["pnpm", "build"], {
      cwd: root,
      env: {
        ...env,
        NODE_ENV: "production",
        NODE_OPTIONS: "",
        PLACES_PROVIDER: "osm",
        PLACES_DISPOSABLE_DATABASE_URL: "",
      },
      stdio: "inherit",
    });
} finally {
  if (client) await client.end();
  if (started) docker("rm", "--force", container);
}

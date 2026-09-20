import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const root = fileURLToPath(new URL("../../", import.meta.url));
const container = `souvenir-memories-${randomUUID()}`;
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
  for (const { tag } of journal.entries) {
    await client.unsafe(readFileSync(new URL(`../../drizzle/${tag}.sql`, import.meta.url), "utf8"));
  }
  execFileSync(
    "corepack",
    ["pnpm", "exec", "vitest", "run", "--config", "tests/memory-sharing/vitest.config.ts"],
    {
      cwd: root,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        DATABASE_URL: url,
        SOUVENIR_DISPOSABLE_TEST_DB: url,
        SEARCH_PROVIDER: "pg",
        AI_PROVIDER: "mock",
        NEXT_PUBLIC_SUPABASE_URL: "https://storage.example.test",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_synthetic",
        SUPABASE_SERVICE_ROLE_KEY: "synthetic-service",
        APP_ORIGIN: "https://souvenir.test",
      },
      stdio: "inherit",
    },
  );
} finally {
  if (client) await client.end();
  if (started) docker("rm", "--force", container);
}

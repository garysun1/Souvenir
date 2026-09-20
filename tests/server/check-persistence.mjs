import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const root = fileURLToPath(new URL("../../", import.meta.url));
const container = `souvenir-persistence-${randomUUID()}`;
const docker = (...args) =>
  execFileSync("docker", args, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
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
  const env = {
    ...process.env,
    DATABASE_URL: url,
    SOUVENIR_DISPOSABLE_TEST_DB: url,
    NEXT_PUBLIC_SUPABASE_URL: "",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "",
    SUPABASE_SECRET_KEY: "",
    DEV_USER_ID: "",
    SEARCH_PROVIDER: "pg",
    AI_PROVIDER: "mock",
  };
  execFileSync(
    "corepack",
    ["pnpm", "exec", "vitest", "run", "--config", "tests/server/vitest.persistence.config.ts"],
    {
      cwd: root,
      env,
      stdio: "inherit",
    },
  );
  if (process.argv.includes("--build")) {
    execFileSync("corepack", ["pnpm", "build"], { cwd: root, env, stdio: "inherit" });
  }
} finally {
  if (client) await client.end();
  docker("rm", "--force", container);
}

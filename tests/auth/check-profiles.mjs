import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const root = fileURLToPath(new URL("../../", import.meta.url));
const container = `souvenir-auth-${randomUUID()}`;
const docker = (...args) => execFileSync("docker", args, { encoding: "utf8", stdio: "pipe" });
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
  const url = `postgres://postgres@${docker("port", container, "5432/tcp").trim()}/postgres`;
  client = postgres(url, { max: 1 });
  const journal = JSON.parse(
    readFileSync(new URL("../../drizzle/meta/_journal.json", import.meta.url), "utf8"),
  );
  for (const { tag } of journal.entries) {
    await client.unsafe(readFileSync(new URL(`../../drizzle/${tag}.sql`, import.meta.url), "utf8"));
  }
  execFileSync("corepack", ["pnpm", "exec", "tsx", "tests/auth/profile.integration.ts"], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: url, NODE_OPTIONS: "--conditions=react-server" },
    stdio: "inherit",
  });
  assert.equal((await client`select count(*)::int as n from users`)[0].n, 4);
  console.log(
    "Disposable Postgres profile provisioning passed; no hosted credentials or state used.",
  );
} finally {
  if (client) await client.end();
  docker("rm", "--force", container);
}

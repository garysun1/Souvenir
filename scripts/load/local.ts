import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { z } from "zod";
import {
  API_ORIGIN,
  PROJECT,
  ROOT,
  SUPABASE_ORIGIN,
  cleanEnvironment,
  guardedFetch,
  localUrl,
  rejectDotenv,
} from "./safety";

const statusSchema = z.object({
  API_URL: z.string(),
  DB_URL: z.string(),
  ANON_KEY: z.string(),
  SERVICE_ROLE_KEY: z.string(),
});
export type LocalStatus = z.infer<typeof statusSchema>;
export const clientOptions = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: guardedFetch(SUPABASE_ORIGIN) },
};

function cli(args: string[]) {
  assert.equal(
    JSON.parse(readFileSync(resolve(ROOT, "node_modules/supabase/package.json"), "utf8")).version,
    "2.39.2",
  );
  const config = readFileSync(resolve(ROOT, "supabase/config.toml"), "utf8");
  assert(
    new RegExp(`^project_id\\s*=\\s*"${PROJECT}"\\s*$`, "m").test(config),
    "Unexpected local project",
  );
  assert(!existsSync(resolve(ROOT, "supabase/.temp/project-ref")), "Linked projects are forbidden");
  localUrl(SUPABASE_ORIGIN, "supabase");
  try {
    return execFileSync(resolve(ROOT, "node_modules/.bin/supabase"), args, {
      cwd: ROOT,
      env: { ...cleanEnvironment(), SUPABASE_INTERNAL_IMAGE_REGISTRY: "docker.io" },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch {
    throw new Error(
      `Local Supabase ${args[0]} failed; inspect local Docker health (CLI output suppressed to protect keys)`,
    );
  }
}

export function startStack() {
  const network = `supabase_network_${PROJECT}`;
  const existing = execFileSync(
    "docker",
    ["network", "ls", "--filter", `name=^${network}$`, "--format", "{{.Name}}"],
    { env: cleanEnvironment(), encoding: "utf8" },
  ).trim();
  if (!existing)
    execFileSync(
      "docker",
      [
        "network",
        "create",
        "--driver",
        "bridge",
        "--opt",
        "com.docker.network.bridge.host_binding_ipv4=127.0.0.1",
        "--label",
        `com.supabase.cli.project=${PROJECT}`,
        network,
      ],
      { env: cleanEnvironment(), stdio: "pipe" },
    );
  const binding = execFileSync(
    "docker",
    [
      "network",
      "inspect",
      network,
      "--format",
      '{{index .Options "com.docker.network.bridge.host_binding_ipv4"}}',
    ],
    { env: cleanEnvironment(), encoding: "utf8" },
  ).trim();
  assert.equal(
    binding,
    "127.0.0.1",
    "Existing local network is not loopback-bound; stop this disposable stack before starting",
  );
  cli(["start", "--exclude", "studio,realtime,edge-runtime,logflare,vector,supavisor"]);
  status();
  console.log("Local Supabase Auth, Storage and Postgres are ready (keys withheld).");
}

export function stopStack() {
  status(false);
  cli(["stop", "--project-id", PROJECT, "--no-backup"]);
}

export function status(checkBindings = true): LocalStatus {
  const result = statusSchema.parse(JSON.parse(cli(["status", "--output", "json"])));
  localUrl(result.API_URL, "supabase");
  localUrl(result.DB_URL, "database");
  if (checkBindings) {
    const ports = execFileSync(
      "docker",
      [
        "inspect",
        "--format",
        "{{json .NetworkSettings.Ports}}",
        `supabase_kong_${PROJECT}`,
        `supabase_db_${PROJECT}`,
        `supabase_inbucket_${PROJECT}`,
      ],
      { env: cleanEnvironment(), encoding: "utf8" },
    );
    const portSchema = z.record(
      z.array(z.object({ HostIp: z.literal("127.0.0.1"), HostPort: z.string() })).nullable(),
    );
    for (const line of ports.trim().split("\n")) portSchema.parse(JSON.parse(line));
  }
  return result;
}

export function database(config: LocalStatus) {
  localUrl(config.DB_URL, "database");
  return postgres(config.DB_URL, { max: 4, onnotice: () => undefined });
}
export type Database = ReturnType<typeof database>;

export function adminClient(config: LocalStatus) {
  localUrl(config.API_URL, "supabase");
  return createClient(config.API_URL, config.SERVICE_ROLE_KEY, clientOptions);
}

export function appEnvironment(config: LocalStatus) {
  localUrl(config.DB_URL, "database");
  localUrl(config.API_URL, "supabase");
  rejectDotenv();
  return {
    ...cleanEnvironment(),
    NODE_ENV: "production" as const,
    DATABASE_URL: config.DB_URL,
    NEXT_PUBLIC_SUPABASE_URL: config.API_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: config.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: config.SERVICE_ROLE_KEY,
    APP_ORIGIN: API_ORIGIN,
    CORS_ORIGINS: API_ORIGIN,
    SEARCH_PROVIDER: "pg",
    AI_PROVIDER: "mock",
  };
}

export async function prepare() {
  const config = status();
  const db = database(config);
  try {
    localUrl(config.DB_URL, "database");
    await migrate(drizzle(db), { migrationsFolder: resolve(ROOT, "drizzle") });
    const admin = adminClient(config);
    const bucket = await admin.storage.getBucket("captures");
    const settings = {
      public: false,
      fileSizeLimit: 10 * 1024 * 1024,
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
    };
    if (!bucket.data) {
      assert(
        bucket.error &&
          "status" in bucket.error &&
          [400, 404].includes(Number(bucket.error.status)),
        "Bucket lookup failed",
      );
      localUrl(config.API_URL, "supabase");
      const created = await admin.storage.createBucket("captures", settings);
      assert(!created.error, "Private capture bucket creation failed");
    } else {
      assert.equal(bucket.data.public, false, "Existing captures bucket must be private");
    }
    const images = await admin.storage.getBucket("place-images");
    if (!images.data) {
      assert(
        images.error &&
          "status" in images.error &&
          [400, 404].includes(Number(images.error.status)),
        "Place image bucket lookup failed",
      );
      const created = await admin.storage.createBucket("place-images", {
        public: true,
        fileSizeLimit: 10 * 1024 * 1024,
        allowedMimeTypes: ["image/webp"],
      });
      assert(!created.error, "Public derivative bucket creation failed");
    } else {
      assert.equal(
        images.data.public,
        true,
        "Place image derivatives require a separate public bucket",
      );
    }
    console.log("Local migrations, private captures and public derivative buckets ready.");
  } finally {
    await db.end();
  }
}

export function app(mode: "build" | "serve") {
  const env = appEnvironment(status());
  if (mode === "build") {
    execFileSync(resolve(ROOT, "node_modules/.bin/next"), ["build"], {
      cwd: ROOT,
      env,
      stdio: "inherit",
    });
    return;
  }
  const child = spawn(
    resolve(ROOT, "node_modules/.bin/next"),
    ["start", "--hostname", "127.0.0.1", "--port", "3300"],
    { cwd: ROOT, env, stdio: "inherit" },
  );
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => child.kill(signal));
  child.on("exit", (code) => {
    process.exitCode = code ?? 1;
  });
}

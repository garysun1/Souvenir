import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export const ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const RUNS = resolve(ROOT, "out/load/runs");
export const CACHE = resolve(ROOT, "out/load/cache");
export const API_ORIGIN = "http://127.0.0.1:3300";
export const SUPABASE_ORIGIN = "http://127.0.0.1:56321";
export const PROJECT = "souvenir-load";

export function runId(value: string): string {
  assert(
    /^[a-z0-9][a-z0-9-]{2,39}$/.test(value),
    "run-id must be 3–40 lowercase letters/digits/hyphens",
  );
  return value;
}

export function localUrl(value: string, kind: "api" | "supabase" | "database"): URL {
  const url = new URL(value);
  assert(
    value.includes("://127.0.0.1:") || value.includes("@127.0.0.1:"),
    "Literal loopback spelling required",
  );
  assert.equal(url.hostname, "127.0.0.1", "Only literal IPv4 loopback is accepted");
  assert(!url.search && !url.hash, "Connection options are forbidden");
  if (kind === "database") {
    assert(["postgres:", "postgresql:"].includes(url.protocol), "Postgres URL required");
    assert.equal(url.port, "56322");
    assert.equal(url.pathname, "/postgres");
    assert.equal(url.username, "postgres");
  } else {
    assert.equal(url.origin, kind === "api" ? API_ORIGIN : SUPABASE_ORIGIN);
    assert(!url.username && !url.password, "HTTP credentials are forbidden");
    assert.equal(url.pathname, "/");
  }
  return url;
}

export function cleanEnvironment(
  source: Record<string, string | undefined> = process.env,
): NodeJS.ProcessEnv {
  const result: NodeJS.ProcessEnv = { NODE_ENV: "test" };
  for (const key of ["PATH", "HOME", "LANG", "LC_ALL", "TERM", "NVM_DIR"]) {
    if (source[key]) result[key] = source[key];
  }
  result.NEXT_TELEMETRY_DISABLED = "1";
  result.DOCKER_HOST = "unix:///var/run/docker.sock";
  result.DOCKER_CONTEXT = "default";
  return result;
}

export function rejectDotenv() {
  for (const file of [
    ".env",
    ".env.local",
    ".env.production",
    ".env.production.local",
    ".env.development",
    ".env.development.local",
  ]) {
    assert(
      !existsSync(resolve(ROOT, file)),
      `Refusing Next dotenv auto-loading: ${file}; use an isolated checkout`,
    );
  }
}

export function requireApply(apply: boolean) {
  assert(apply, "Mutating commands require --apply");
}

export function guardedFetch(origin: string): typeof fetch {
  const allowed = new URL(origin).origin;
  localUrl(origin, allowed === API_ORIGIN ? "api" : "supabase");
  return async (input, init) => {
    const url = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    );
    assert.equal(url.origin, allowed, "Cross-origin request refused");
    assert(!url.username && !url.password, "HTTP URL credentials refused");
    localUrl(allowed, allowed === API_ORIGIN ? "api" : "supabase");
    return fetch(input, {
      ...init,
      redirect: "error",
      signal: init?.signal ?? AbortSignal.timeout(30_000),
    });
  };
}

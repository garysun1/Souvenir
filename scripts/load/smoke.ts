import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { writeFileSync } from "node:fs";
import { setTimeout } from "node:timers/promises";
import { API_ORIGIN, ROOT, RUNS, cleanEnvironment, guardedFetch } from "./safety";
import { loadPool } from "./photos";
import { startStack, prepare, app } from "./local";

export async function smoke() {
  assert.equal(process.platform, "linux", "Disposable smoke currently requires Linux Docker");
  loadPool();
  const request = guardedFetch(API_ORIGIN);
  const existing = await request(`${API_ORIGIN}/api/me`, {
    signal: AbortSignal.timeout(1000),
  }).catch(() => null);
  assert(!existing, "Port 3300 is occupied; stop the existing app before smoke");
  startStack();
  await prepare();
  app("build");
  const server = spawn(process.execPath, [resolve(ROOT, "scripts/load/exec.mjs"), "serve"], {
    cwd: ROOT,
    env: cleanEnvironment(),
    stdio: "inherit",
    detached: true,
  });
  const id = `smoke-${randomUUID().slice(0, 8)}`;
  const sentinel = `${id}-sentinel`;
  const attempted: string[] = [];
  const cli = (...args: string[]) =>
    execFileSync(process.execPath, [resolve(ROOT, "scripts/load/exec.mjs"), ...args], {
      cwd: ROOT,
      env: cleanEnvironment(),
      stdio: "inherit",
    });
  const onSignal = () => {
    if (server.pid) process.kill(-server.pid, "SIGTERM");
  };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
  let passed = false;
  try {
    let ready = false;
    for (let i = 0; i < 120; i++) {
      assert.equal(server.exitCode, null, "Local Next server exited");
      const response = await request(`${API_ORIGIN}/api/me`, {
        signal: AbortSignal.timeout(1000),
      }).catch(() => null);
      if (response?.status === 401) {
        ready = true;
        break;
      }
      await setTimeout(250);
    }
    assert(ready, "Authenticated Next API did not become ready");
    for (const [runId, accounts, editions] of [
      [sentinel, "2", "1"],
      [id, "4", "3"],
    ]) {
      attempted.push(runId);
      cli(
        "run",
        "--apply",
        "--run-id",
        runId,
        "--mode",
        "core",
        "--accounts",
        accounts,
        "--editions",
        editions,
        "--concurrency",
        "2",
        "--photos",
        "pool",
      );
    }
    cli("resume", "--apply", "--run-id", id);
    cli("cleanup", "--apply", "--run-id", id);
    cli("cleanup", "--apply", "--run-id", id);
    cli("verify", "--apply", "--run-id", sentinel);
    passed = true;
  } finally {
    let cleanupFailed = false;
    for (const runId of attempted.reverse()) {
      try {
        cli("cleanup", "--apply", "--run-id", runId);
      } catch {
        cleanupFailed = true;
        console.error(`Cleanup incomplete: rerun cleanup --apply --run-id ${runId}`);
      }
    }
    onSignal();
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
    writeFileSync(
      resolve(RUNS, "smoke-result.json"),
      JSON.stringify(
        {
          runId: id,
          sentinel,
          passed: passed && !cleanupFailed,
          at: new Date().toISOString(),
          scope:
            "Real local Auth, Storage, Next API, SQL parity, resume, idempotency, scoped cleanup. Worldwide services excluded.",
        },
        null,
        2,
      ),
      { mode: 0o600 },
    );
    assert(!cleanupFailed, "Smoke cleanup failed");
  }
  console.log(
    `Disposable smoke passed; evidence in out/load/runs/${id} and out/load/runs/smoke-result.json`,
  );
}

import { parseArgs } from "node:util";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { readFileSync, writeFileSync } from "node:fs";
import { startStack, stopStack, prepare, app, appEnvironment, status } from "./local";
import { requireApply, runId, cleanEnvironment, ROOT, RUNS } from "./safety";
import { Manifest, optionsSchema } from "./manifest";
import { buildPool, hash, loadPool } from "./photos";
import { fixtureHash } from "./fixtures";
import { run } from "./run";
import { report } from "./report";
import { cleanup } from "./cleanup";
import { smoke } from "./smoke";

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      apply: { type: "boolean" },
      recover: { type: "boolean" },
      "run-id": { type: "string" },
      seed: { type: "string" },
      accounts: { type: "string" },
      editions: { type: "string" },
      concurrency: { type: "string" },
      mode: { type: "string" },
      photos: { type: "string" },
    },
  });
  const command = positionals[0];
  if (
    [
      "start",
      "stop",
      "prepare",
      "run",
      "resume",
      "verify",
      "cleanup",
      "cleanup-images",
      "smoke",
    ].includes(command)
  )
    requireApply(values.apply === true);
  switch (command) {
    case "start":
      startStack();
      break;
    case "stop":
      stopStack();
      break;
    case "prepare":
      await prepare();
      break;
    case "cleanup-images": {
      const config = status();
      execFileSync(
        process.execPath,
        [
          "--conditions=react-server",
          "--import",
          "tsx",
          resolve(ROOT, "scripts/cleanup-place-images.ts"),
          "--apply",
        ],
        {
          cwd: ROOT,
          env: {
            ...appEnvironment(config),
            NODE_ENV: "test",
            PLACES_DISPOSABLE_DATABASE_URL: config.DB_URL,
          },
          stdio: "inherit",
        },
      );
      break;
    }
    case "build":
      app("build");
      break;
    case "serve":
      app("serve");
      break;
    case "photos":
      await buildPool();
      break;
    case "smoke":
      await smoke();
      break;
    case "check": {
      const env = cleanEnvironment();
      for (const args of [["lint"], ["format:check"], ["typecheck"], ["test"]]) {
        execFileSync("pnpm", args, { cwd: ROOT, env, stdio: "inherit" });
      }
      break;
    }
    case "service":
      execFileSync("node", ["tests/server/check-persistence.mjs"], {
        cwd: ROOT,
        env: cleanEnvironment(),
        stdio: "inherit",
      });
      break;
    case "report": {
      const id = runId(values["run-id"] ?? "");
      const data: unknown = JSON.parse(readFileSync(resolve(RUNS, id, "report.json"), "utf8"));
      console.log(JSON.stringify(data, null, 2));
      break;
    }
    case "run":
    case "resume":
    case "verify":
    case "cleanup": {
      const id = runId(values["run-id"] ?? "");
      const options =
        command === "run"
          ? optionsSchema.parse({
              runId: id,
              seed: values.seed ?? "souvenir-v1",
              accounts: Number(values.accounts ?? 1000),
              editions: values.editions ? Number(values.editions) : null,
              concurrency: Number(values.concurrency ?? 4),
              mode: values.mode ?? "worldwide",
              photoMode: values.photos ?? "sparse",
              anchor: new Date().toISOString(),
              fixtureHash,
              poolHash: values.photos === "none" ? null : hash(JSON.stringify(loadPool())),
            })
          : undefined;
      if (options?.mode === "worldwide" && options.accounts < 3)
        throw new Error("Worldwide verification requires at least three accounts");
      if (
        options?.accounts === 1000 &&
        (options.mode !== "worldwide" || options.photoMode === "none")
      )
        throw new Error(
          "The 1000-account target requires worldwide mode and real signed uploads (pool or sparse)",
        );
      const manifest = new Manifest(id, options, values.recover);
      try {
        if (command === "cleanup") await cleanup(manifest);
        else {
          if (command !== "verify") await run(manifest);
          await report(manifest);
        }
      } catch (error) {
        writeFileSync(
          resolve(manifest.dir, "failure.json"),
          JSON.stringify(
            {
              command,
              at: new Date().toISOString(),
              message: error instanceof Error ? error.message : "Command failed",
            },
            null,
            2,
          ),
          { mode: 0o600 },
        );
        throw error;
      } finally {
        manifest.close();
      }
      break;
    }
    default:
      throw new Error(
        "Expected start|stop|prepare|build|serve|photos|smoke|run|resume|verify|report|cleanup|cleanup-images|check|service",
      );
  }
}
main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Load command failed");
  process.exitCode = 1;
});

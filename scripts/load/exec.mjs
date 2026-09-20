import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL("../../", import.meta.url));
const env = Object.fromEntries(
  ["PATH", "HOME", "LANG", "LC_ALL", "TERM", "NVM_DIR"]
    .filter((name) => process.env[name])
    .map((name) => [name, process.env[name]]),
);
env.NEXT_TELEMETRY_DISABLED = "1";
const child = spawn(
  resolve(root, "node_modules/.bin/tsx"),
  [resolve(root, "scripts/load/cli.ts"), ...process.argv.slice(2)],
  { cwd: root, env, stdio: "inherit" },
);
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});

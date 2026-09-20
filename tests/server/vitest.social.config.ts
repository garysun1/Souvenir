import { defineConfig } from "vitest/config";
import path from "node:path";

const url = process.env.SOUVENIR_DISPOSABLE_TEST_DB;
if (!url || process.env.DATABASE_URL !== url || new URL(url).hostname !== "127.0.0.1") {
  throw new Error("Run node tests/server/check-social.mjs to create an isolated database.");
}

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/server/social.integration.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "../../src"),
      "server-only": path.resolve(__dirname, "../../node_modules/server-only/empty.js"),
    },
  },
});

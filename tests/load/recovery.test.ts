import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { account, emailFor, reconcileAccounts } from "../../scripts/load/accounts";
import { Manifest } from "../../scripts/load/manifest";
import { fixtureHash, stableId } from "../../scripts/load/fixtures";
import { SUPABASE_ORIGIN } from "../../scripts/load/safety";

const mocks = vi.hoisted(() => ({
  createUser: vi.fn(),
  listUsers: vi.fn(),
  getUserById: vi.fn(),
  updateUserById: vi.fn(),
  login: vi.fn(),
}));
vi.mock("../../scripts/load/local", () => ({
  adminClient: () => ({ auth: { admin: mocks } }),
}));
vi.mock("../../scripts/load/api", () => ({
  ApiClient: class {
    login = mocks.login;
  },
}));

const config = {
  API_URL: SUPABASE_ORIGIN,
  DB_URL: "postgres://postgres:local@127.0.0.1:56322/postgres",
  ANON_KEY: "offline-test-only",
  SERVICE_ROLE_KEY: "offline-test-only",
};
let manifest: Manifest;
beforeEach(() => {
  vi.resetAllMocks();
  const id = `recovery-${randomUUID().slice(0, 8)}`;
  manifest = new Manifest(id, {
    runId: id,
    seed: "fixed",
    accounts: 2,
    editions: 1,
    concurrency: 1,
    mode: "core",
    photoMode: "none",
    anchor: "2026-09-20T00:00:00.000Z",
    fixtureHash,
    poolHash: null,
  });
});
afterEach(() => {
  manifest.close();
  rmSync(manifest.dir, { recursive: true, force: true });
});

it("recovers an Auth commit whose response was lost without creating a second account", async () => {
  const user = {
    id: stableId("recovered-user"),
    email: emailFor(manifest.options.runId, 0),
    app_metadata: { load_run_id: manifest.options.runId },
  };
  mocks.createUser.mockImplementation(async () => {
    expect(manifest.has("account:0", "intent")).toBeDefined();
    throw new Error("connection lost after server committed");
  });
  await expect(account(manifest, config, 0)).rejects.toThrow("connection lost");
  expect(manifest.has("account:0", "account")).toBeUndefined();
  mocks.listUsers.mockResolvedValue({ data: { users: [user] }, error: null });
  await reconcileAccounts(manifest, config);
  expect(manifest.has("account:0", "account")?.id).toBe(user.id);
  mocks.getUserById.mockResolvedValue({ data: { user }, error: null });
  mocks.updateUserById.mockResolvedValue({ data: { user }, error: null });
  mocks.login.mockResolvedValue(undefined);
  await account(manifest, config, 0);
  expect(mocks.createUser).toHaveBeenCalledTimes(1);
  expect(mocks.updateUserById).toHaveBeenCalledTimes(1);
  expect(mocks.login).toHaveBeenCalledTimes(1);
  const password = mocks.login.mock.calls[0][1] as string;
  expect(readFileSync(resolve(manifest.dir, "journal.jsonl"), "utf8")).not.toContain(password);
});

it("records the returned UUID before a failed profile/login step", async () => {
  const user = { id: stableId("created-user") };
  mocks.createUser.mockResolvedValue({ data: { user }, error: null });
  mocks.login.mockRejectedValue(new Error("profile service unavailable"));
  await expect(account(manifest, config, 0)).rejects.toThrow("profile service unavailable");
  expect(manifest.has("account:0", "account")?.id).toBe(user.id);
  expect(mocks.createUser.mock.calls[0][0].email_confirm).toBe(true);
});

it("refuses matching email recovery without the run ownership marker", async () => {
  manifest.append({
    kind: "intent",
    key: "account:0",
    index: 0,
    email: emailFor(manifest.options.runId, 0),
  });
  mocks.listUsers.mockResolvedValue({
    data: {
      users: [
        {
          id: stableId("foreign-user"),
          email: emailFor(manifest.options.runId, 0),
          app_metadata: { load_run_id: "another-run" },
        },
      ],
    },
    error: null,
  });
  await expect(reconcileAccounts(manifest, config)).rejects.toThrow("different run");
  expect(manifest.has("account:0", "account")).toBeUndefined();
});

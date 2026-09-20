import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { ApiClient } from "./api";
import { adminClient, type LocalStatus } from "./local";
import { type Manifest } from "./manifest";
import { avatar } from "./fixtures";
import { localUrl } from "./safety";

export function emailFor(runId: string, index: number) {
  return `souvenir-load-${runId}-${index}@example.invalid`;
}

export async function reconcileAccounts(manifest: Manifest, config: LocalStatus) {
  const missing = new Map(
    manifest.records
      .filter(
        (record) =>
          record.kind === "intent" && record.email && !manifest.has(record.key, "account"),
      )
      .map((record) => [record.email, record]),
  );
  if (!missing.size) return;
  const admin = adminClient(config);
  for (let page = 1; ; page++) {
    localUrl(config.API_URL, "supabase");
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    assert(!error, "Account recovery lookup failed");
    for (const user of data.users) {
      const intent = missing.get(user.email);
      if (!intent) continue;
      assert.equal(
        user.app_metadata.load_run_id,
        manifest.options.runId,
        "Email belongs to a different run",
      );
      manifest.append({ ...intent, kind: "account", id: user.id });
      missing.delete(user.email);
    }
    if (!missing.size || data.users.length < 1000) return;
  }
}

export async function account(manifest: Manifest, config: LocalStatus, index: number) {
  const key = `account:${index}`;
  const email = emailFor(manifest.options.runId, index);
  const admin = adminClient(config);
  let record = manifest.has(key, "account");
  const password = randomBytes(32).toString("base64url");
  if (!record) {
    if (!manifest.has(key, "intent")) manifest.append({ kind: "intent", key, email, index });
    localUrl(config.API_URL, "supabase");
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { load_run_id: manifest.options.runId },
      user_metadata: { display_name: `Synthetic Explorer ${index}` },
    });
    assert(!error && data.user, "Auth createUser failed; resume reconciles recorded email intent");
    record = { kind: "account", key, email, id: data.user.id, index };
    manifest.append(record);
  } else {
    assert(record.id && record.email === email, "Invalid account manifest");
    localUrl(config.API_URL, "supabase");
    const found = await admin.auth.admin.getUserById(record.id);
    assert(
      !found.error &&
        found.data.user?.email === email &&
        found.data.user.app_metadata.load_run_id === manifest.options.runId,
      "Run ownership mismatch",
    );
    localUrl(config.API_URL, "supabase");
    const reset = await admin.auth.admin.updateUserById(record.id, { password });
    assert(!reset.error, "Local password rotation failed");
  }
  assert(record.id);
  const client = new ApiClient(config, record.id);
  await client.login(email, password);
  writeFileSync(
    resolve(manifest.dir, `avatar-${index}.svg`),
    avatar(`${manifest.options.seed}:${index}`),
    { mode: 0o600 },
  );
  return client;
}

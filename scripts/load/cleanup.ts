import assert from "node:assert/strict";
import { adminClient, database, status } from "./local";
import { type Manifest } from "./manifest";
import { reconcileAccounts, emailFor } from "./accounts";
import { localUrl } from "./safety";
import { fixtureId, fixtureSlug } from "./run";

export async function cleanup(manifest: Manifest) {
  const config = status();
  const admin = adminClient(config);
  await reconcileAccounts(manifest, config);
  const accounts = manifest.records.filter((record) => record.kind === "account");
  const ids = accounts.map((record) => {
    assert(
      record.id &&
        record.index !== undefined &&
        record.email === emailFor(manifest.options.runId, record.index),
    );
    return record.id;
  });
  for (const account of accounts) {
    assert(account.id);
    localUrl(config.API_URL, "supabase");
    const found = await admin.auth.admin.getUserById(account.id);
    if (found.data.user) {
      assert(
        found.data.user.email === account.email &&
          found.data.user.app_metadata.load_run_id === manifest.options.runId,
        "Account ownership mismatch; no objects were removed",
      );
    } else assert(found.error?.status === 404, "Auth lookup failed");
  }
  for (const record of manifest.records.filter((record) => record.kind === "object")) {
    assert(record.path && /^[a-f0-9-]{36}\/[a-f0-9-]{36}\.jpg$/.test(record.path));
    assert(ids.includes(record.path.split("/")[0]), "Unrecorded object owner");
    localUrl(config.API_URL, "supabase");
    const removed = await admin.storage.from("captures").remove([record.path]);
    assert(!removed.error, "Storage cleanup failed; account kept for retry");
  }
  const db = database(config);
  try {
    for (const account of accounts) {
      assert(account.id);
      localUrl(config.API_URL, "supabase");
      const found = await admin.auth.admin.getUserById(account.id);
      if (found.data.user) {
        assert(
          found.data.user.email === account.email &&
            found.data.user.app_metadata.load_run_id === manifest.options.runId,
          "Account ownership mismatch",
        );
      } else assert(found.error?.status === 404, "Auth lookup failed");
      localUrl(config.DB_URL, "database");
      const id = account.id;
      await db.begin(async (tx) => {
        await tx`DELETE FROM activity_events WHERE user_id=${id} OR friend_id=${id}`;
        await tx`DELETE FROM friendships WHERE user_id=${id} OR friend_id=${id}`;
        await tx`DELETE FROM place_notes WHERE user_id=${id}`;
        await tx`DELETE FROM place_tags WHERE user_id=${id}`;
        await tx`DELETE FROM place_suggestions WHERE user_id=${id}`;
        await tx`DELETE FROM place_images WHERE uploaded_by=${id}`;
        await tx`DELETE FROM wishlist_saves WHERE user_id=${id}`;
        await tx`DELETE FROM wishlist_items WHERE added_by=${id} OR wishlist_id IN (SELECT id FROM wishlists WHERE owner_id=${id})`;
        await tx`DELETE FROM wishlist_members WHERE user_id=${id}`;
        await tx`DELETE FROM outing_members WHERE user_id=${id} OR outing_id IN (SELECT id FROM outings WHERE created_by=${id})`;
        await tx`DELETE FROM editions WHERE user_id=${id}`;
        await tx`DELETE FROM outings WHERE created_by=${id}`;
        await tx`DELETE FROM wishlists WHERE owner_id=${id}`;
        await tx`DELETE FROM rankings WHERE user_id=${id}`;
        await tx`DELETE FROM ranking_groups WHERE user_id=${id}`;
        await tx`DELETE FROM place_preferences WHERE user_id=${id}`;
        await tx`DELETE FROM edition_counters WHERE user_id=${id}`;
        await tx`DELETE FROM api_requests WHERE user_id=${id}`;
        await tx`DELETE FROM user_stats WHERE user_id=${id}`;
        await tx`DELETE FROM users WHERE id=${id}`;
      });
      if (found.data.user) {
        localUrl(config.API_URL, "supabase");
        const deleted = await admin.auth.admin.deleteUser(id);
        assert(!deleted.error, "Auth deletion failed; retry cleanup");
      }
      if (!manifest.has(account.key, "cleaned"))
        manifest.append({ kind: "cleaned", key: account.key, id });
    }
    for (const record of manifest.records.filter((record) => record.kind === "place")) {
      assert(
        record.index !== undefined && record.id === fixtureId(manifest.options.runId, record.index),
      );
      localUrl(config.DB_URL, "database");
      await db`DELETE FROM places WHERE id=${record.id} AND slug=${fixtureSlug(manifest.options.runId, record.index)} AND source='placeholder'`;
    }
    const [remaining] =
      await db`SELECT count(*)::int AS count FROM users WHERE id=ANY(${ids}::uuid[])`;
    assert.equal(remaining.count, 0);
    manifest.append({ kind: "cleaned", key: "run" });
    console.log(`Cleaned ${ids.length} recorded local accounts and their owned data.`);
  } finally {
    await db.end();
  }
}

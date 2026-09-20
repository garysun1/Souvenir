import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { ensureUserProfile, initialProfileName } from "../../src/lib/auth/profile";
import { closeDb, db } from "../../src/lib/db";
import { users } from "../../src/lib/db/schema";
import type { AuthContext } from "../../shared/api-contract";

async function main() {
  const id = "11111111-1111-4111-8111-111111111111";
  const auth: AuthContext = { userId: id, email: "shared@example.com", mode: "cookie" };
  const handle = `user_${id.replaceAll("-", "")}`;
  const devId = "00000000-0000-0000-0000-000000000001";
  await db.insert(users).values([
    { id: devId, handle, displayName: "Preserve development profile" },
    {
      id: "22222222-2222-4222-8222-222222222222",
      handle: `${handle}_1`,
      displayName: "Occupied handle",
    },
  ]);
  const profiles = await Promise.all(
    Array.from({ length: 10 }, () => ensureUserProfile(auth, " \u0000Alice<> ")),
  );
  for (const profile of profiles) {
    assert.equal(profile.id, id);
    assert.equal(profile.handle, `${handle}_2`);
    assert.equal(profile.displayName, "Alice");
  }
  await db
    .update(users)
    .set({ displayName: "My name", homeCity: "LA", avatarUrl: "https://example.com/avatar.png" })
    .where(eq(users.id, id));
  const preserved = await ensureUserProfile(auth, "Metadata must not overwrite");
  assert.equal(preserved.displayName, "My name");
  assert.equal(preserved.homeCity, "LA");
  assert.equal(preserved.avatarUrl, "https://example.com/avatar.png");
  assert.equal(preserved.handle, `${handle}_2`);
  const other = await ensureUserProfile({
    ...auth,
    userId: "33333333-3333-4333-8333-333333333333",
  });
  assert.notEqual(other.id, preserved.id);
  assert.equal(other.displayName, "Explorer");
  const [dev] = await db.select().from(users).where(eq(users.id, devId));
  assert.equal(dev.displayName, "Preserve development profile");
  assert.equal(dev.handle, handle);
  assert.equal(initialProfileName({ name: "unsafe" }), "Explorer");
  assert.equal(initialProfileName("\u0000\u200b<>"), "Explorer");
  assert.equal(initialProfileName("a".repeat(101)).length, 100);
  await assert.rejects(() => ensureUserProfile({ ...auth, userId: "../../invalid" }));
  console.log(
    "Profiles: concurrent provisioning, handle collisions, metadata sanitation, preserved personal fields, UUID isolation and dev-profile preservation passed.",
  );
}

main()
  .finally(closeDb)
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });

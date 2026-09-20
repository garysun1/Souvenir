import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import postgres from "postgres";
import envModule from "../src/lib/env.ts";

const { env } = envModule;

if (process.argv[2] !== "--apply") {
  console.log("Usage: tsx scripts/check-hosted.mjs --apply");
  console.log("Creates temporary Auth accounts and application data, then removes only those IDs.");
  process.exit(0);
}

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const secret = env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
assert(url && key && secret);
const base = env.APP_ORIGIN;
const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(url, secret, options);
const db = postgres(env.DATABASE_URL, { max: 1 });
const accounts = [];
const objectPaths = [];
let stage = "initialization";
const passed = [];
const check = (name) => {
  passed.push(name);
  console.log(`PASS: ${name}`);
};

async function account(confirmed = true) {
  const email = `souvenir-integration-${randomUUID()}@example.com`;
  const password = randomBytes(32).toString("base64url");
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: confirmed,
  });
  assert(!error && data.user, "Temporary Auth account creation failed.");
  const result = { id: data.user.id, email, password };
  accounts.push(result);
  return result;
}

async function login(client, credentials) {
  const { data, error } = await client.auth.signInWithPassword({
    email: credentials.email,
    password: credentials.password,
  });
  assert(!error && data.session, "Password sign-in failed.");
  assert.equal(data.user.id, credentials.id);
  return data.session;
}

async function request(auth, path, method = "GET", body, expected = 200, extra = {}) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...auth,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...extra,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json();
  assert.equal(
    response.status,
    expected,
    `${method} ${path}: expected ${expected}, received ${response.status} (${result.error ?? "data"})`,
  );
  assert.match(response.headers.get("cache-control") ?? "", /no-store/);
  assert(expected >= 400 ? "error" in result && !("data" in result) : "data" in result);
  return expected >= 400 ? result : result.data;
}

try {
  const existingProfiles = await db`select * from users order by id`;
  stage = "signed-out rejection and Auth confirmation";
  await request({}, "/api/bootstrap", "GET", undefined, 401);
  await request({}, "/api/editions", "POST", {}, 401, { Origin: base });
  const pending = await account(false);
  const pendingClient = createClient(url, key, options);
  const pendingResult = await pendingClient.auth.signInWithPassword(pending);
  assert.equal(pendingResult.error?.code, "email_not_confirmed");
  assert.equal(pendingResult.data.session, null);
  check(stage);

  stage = "cookie/bearer same-account identity and canonical catalog";
  const first = await account();
  const second = await account();
  const jar = new Map();
  const web = createServerClient(url, key, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (cookies) => cookies.forEach(({ name, value }) => jar.set(name, value)),
    },
  });
  await login(web, first);
  const cookie = {
    Cookie: [...jar].map(([name, value]) => `${name}=${value}`).join(";"),
    Origin: base,
  };
  const mobile = createClient(url, key, options);
  const mobileSession = await login(mobile, first);
  const bearer = { Authorization: `Bearer ${mobileSession.access_token}` };
  const outsider = createClient(url, key, options);
  const secondSession = await login(outsider, second);
  const other = { Authorization: `Bearer ${secondSession.access_token}` };
  const webData = await request(cookie, "/api/bootstrap");
  const mobileData = await request(bearer, "/api/bootstrap");
  assert.equal(webData.user.id, first.id);
  assert.equal(mobileData.user.id, first.id);
  assert.deepEqual(webData.places, mobileData.places);
  assert(webData.places.length >= 30);
  assert.equal(webData.collection.length, 0);
  const otherData = await request(other, "/api/bootstrap");
  assert.equal(otherData.collection.length, 0);
  const place = webData.places[0];
  check(`${stage} (${webData.places.length} places)`);

  stage = "invalid bearer precedence, tampered JWT rejection, CSRF and CORS";
  await request(
    { ...cookie, Authorization: "Bearer invalid" },
    "/api/bootstrap",
    "GET",
    undefined,
    401,
  );
  const parts = mobileSession.access_token.split(".");
  const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
  parts[1] = Buffer.from(JSON.stringify({ ...payload, exp: 1 })).toString("base64url");
  await request(
    { Authorization: `Bearer ${parts.join(".")}` },
    "/api/bootstrap",
    "GET",
    undefined,
    401,
  );
  await request(cookie, "/api/me", "PATCH", { displayName: "Denied" }, 403, {
    Origin: "https://untrusted.example",
  });
  await request(bearer, "/api/bootstrap", "GET", undefined, 403, {
    Origin: "https://untrusted.example",
  });
  const allowedOrigin = env.CORS_ORIGINS[0];
  assert(allowedOrigin, "Set an explicit Expo web CORS origin for this check.");
  const preflight = await fetch(`${base}/api/editions`, {
    method: "OPTIONS",
    headers: {
      Origin: allowedOrigin,
      "Access-Control-Request-Headers": "authorization,content-type",
    },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), allowedOrigin);
  await request(bearer, "/api/bootstrap", "GET", undefined, 200, { Origin: allowedOrigin });
  check(stage);

  stage = "capture retry, conflict, revisit, edits and account isolation";
  const draft = {
    requestId: randomUUID(),
    placeId: place.id,
    capturedAt: "2026-09-19T12:00:00.000Z",
    timezone: "America/Los_Angeles",
    note: "HTTP integration",
    companions: ["Integration companion"],
  };
  await request(cookie, "/api/editions", "POST", { ...draft, userId: second.id }, 400);
  const visit = await request(cookie, "/api/editions", "POST", draft, 201);
  assert.equal(visit.userId, first.id);
  assert.equal((await request(bearer, "/api/editions", "POST", draft)).id, visit.id);
  await request(bearer, "/api/editions", "POST", { ...draft, note: "Conflict" }, 409);
  const revisit = await request(
    bearer,
    "/api/editions",
    "POST",
    { ...draft, requestId: randomUUID(), variant: "revisit" },
    201,
  );
  assert.equal(revisit.visitSequence, visit.visitSequence + 1);
  const edit = {
    note: "Updated from mobile",
    capturedAt: "2026-09-18T15:00:00.000Z",
    companions: ["Updated companion"],
  };
  await request(bearer, `/api/editions/${visit.id}`, "PATCH", edit);
  const reread = await request(cookie, `/api/editions/${visit.id}`);
  for (const field of Object.keys(edit)) assert.deepEqual(reread[field], edit[field]);
  await request(other, `/api/editions/${visit.id}`, "GET", undefined, 404);
  await request(other, `/api/editions/${visit.id}`, "PATCH", edit, 404);
  await request(other, `/api/editions/${visit.id}`, "DELETE", undefined, 404);
  assert.equal((await request(other, "/api/bootstrap")).collection.length, 0);
  const missingDraft = { ...draft, requestId: randomUUID(), placeId: randomUUID() };
  await request(bearer, "/api/editions", "POST", missingDraft, 400);
  assert.equal((await request(cookie, "/api/me/collection")).length, 2);
  check(stage);

  stage = "wishlists, favorites, tips, rankings and shared membership";
  const defaultList = webData.wishlists.find((list) => list.isDefault);
  await request(bearer, `/api/wishlists/${defaultList.id}/items`, "PUT", {
    placeId: place.id,
    saved: true,
  });
  const preference = { favorite: true, tip: "HTTP test tip" };
  await request(cookie, `/api/me/places/${place.id}`, "PUT", preference);
  await request(bearer, `/api/rankings/${place.id}`, "PUT", {
    sentiment: "recommend",
    ranking: "unranked",
  });
  const updated = await request(cookie, "/api/bootstrap");
  assert(
    updated.wishlists
      .find((list) => list.id === defaultList.id)
      .entries.some((entry) => entry.placeId === place.id),
  );
  assert(
    updated.placePreferences.some(
      (entry) => entry.placeId === place.id && entry.favorite && entry.tip === preference.tip,
    ),
  );
  assert(
    updated.rankings.some((entry) => entry.placeId === place.id && entry.sentiment === "recommend"),
  );
  await request(
    other,
    `/api/wishlists/${defaultList.id}/items`,
    "PUT",
    { placeId: place.id, saved: true },
    404,
  );
  const sharedDraft = {
    requestId: randomUUID(),
    name: "Temporary shared HTTP list",
    isShared: true,
  };
  const shared = await request(cookie, "/api/wishlists", "POST", sharedDraft, 201);
  assert.equal((await request(bearer, "/api/wishlists", "POST", sharedDraft)).id, shared.id);
  await request(cookie, `/api/wishlists/${shared.id}/members`, "POST", {
    handle: otherData.user.handle,
  });
  await request(other, `/api/wishlists/${shared.id}/items`, "PUT", {
    placeId: place.id,
    saved: true,
  });
  await request(cookie, `/api/wishlists/${shared.id}/items`, "PUT", {
    placeId: place.id,
    saved: true,
  });
  const sharedResult = (await request(bearer, "/api/bootstrap")).wishlists.find(
    (list) => list.id === shared.id,
  );
  assert.equal(sharedResult.entries[0].saverIds.length, 2);
  check(stage);

  stage = "persistent plans, edits, idempotency and owner isolation";
  const plan = {
    title: "Temporary HTTP plan",
    constraints: {
      participantIds: [first.id],
      date: "2026-09-21",
      startMinute: 600,
      endMinute: 720,
      budgetCents: 2500,
      transport: "walk",
      interests: [place.category],
      rain: false,
      excludedPlaceIds: [],
      preferredPlaceIds: [place.id],
    },
    stops: [
      {
        placeId: place.id,
        arrivalMinute: 600,
        departureMinute: 660,
        costCents: 0,
        travelMinutes: 0,
      },
    ],
    totalCostCents: 0,
    totalMinutes: 60,
    checks: ["HTTP verification"],
    version: 1,
    provenance: "manual",
  };
  const planDraft = { requestId: randomUUID(), plan };
  const outing = await request(bearer, "/api/outings", "POST", planDraft, 201);
  assert.equal((await request(cookie, "/api/outings", "POST", planDraft)).id, outing.id);
  await request(cookie, `/api/outings/${outing.id}`, "PATCH", { ...plan, title: "Edited plan" });
  assert(
    (await request(bearer, "/api/bootstrap")).plans.some(
      (entry) => entry.id === outing.id && entry.plan.title === "Edited plan",
    ),
  );
  await request(other, `/api/outings/${outing.id}`, "PATCH", plan, 404);
  await request(other, `/api/outings/${outing.id}`, "DELETE", undefined, 404);
  check(stage);

  stage = "private upload, immutable retry, signed read and photo ownership";
  const bytes = readFileSync(
    new URL("../apps/mobile/assets/places/la-the-broad.jpg", import.meta.url),
  );
  const photoRequestId = randomUUID();
  const uploadInput = { requestId: photoRequestId, contentType: "image/jpeg", size: bytes.length };
  const upload = await request(bearer, "/api/capture/upload", "POST", uploadInput);
  objectPaths.push(upload.path);
  assert.equal(upload.uploaded, false);
  const missingPhoto = { ...draft, requestId: photoRequestId, photoPath: upload.path };
  await request(cookie, "/api/editions", "POST", missingPhoto, 422);
  const uploaded = await mobile.storage
    .from("captures")
    .uploadToSignedUrl(upload.path, upload.token, bytes, { contentType: "image/jpeg" });
  assert(!uploaded.error, "Signed upload failed.");
  assert.equal((await request(cookie, "/api/capture/upload", "POST", uploadInput)).uploaded, true);
  await request(
    bearer,
    "/api/capture/upload",
    "POST",
    { ...uploadInput, size: bytes.length + 1 },
    409,
  );
  const duplicate = await mobile.storage
    .from("captures")
    .uploadToSignedUrl(upload.path, upload.token, bytes, { contentType: "image/jpeg" });
  assert(duplicate.error, "Immutable signed upload unexpectedly overwrote an object.");
  await request(other, "/api/editions", "POST", missingPhoto, 403);
  const photoVisit = await request(bearer, "/api/editions", "POST", missingPhoto, 201);
  assert(photoVisit.photo);
  const signed = await request(cookie, `/api/editions/${photoVisit.id}/photo`);
  assert(Date.parse(signed.expiresAt) - Date.now() <= 300_000);
  assert(Date.parse(signed.expiresAt) > Date.now());
  const image = await fetch(signed.url);
  assert.equal(image.status, 200);
  assert.equal((await image.arrayBuffer()).byteLength, bytes.length);
  const publicRead = await fetch(`${url}/storage/v1/object/public/captures/${upload.path}`);
  assert(publicRead.status >= 400);
  const directRead = await outsider.storage.from("captures").download(upload.path);
  assert(directRead.error);
  await request(other, `/api/editions/${photoVisit.id}/photo`, "GET", undefined, 404);
  const { data: bucket, error: bucketError } = await admin.storage.getBucket("captures");
  assert(!bucketError && bucket.public === false && bucket.file_size_limit === 10 * 1024 * 1024);
  check(stage);

  stage = "deletion, replay tombstones and monotonic revisit sequence";
  await request(cookie, `/api/editions/${photoVisit.id}`, "DELETE");
  const removed = await admin.storage.from("captures").info(upload.path);
  assert(removed.error);
  await request(bearer, `/api/editions/${visit.id}`, "DELETE");
  await request(bearer, `/api/editions/${visit.id}`, "DELETE");
  await request(cookie, "/api/editions", "POST", draft, 410);
  await request(cookie, `/api/editions/${revisit.id}`, "DELETE");
  assert.equal((await request(bearer, "/api/me/collection")).length, 0);
  const later = await request(
    cookie,
    "/api/editions",
    "POST",
    { ...draft, requestId: randomUUID(), variant: "revisit" },
    201,
  );
  assert(later.visitSequence > photoVisit.visitSequence);
  await request(bearer, `/api/editions/${later.id}`, "DELETE");
  await request(cookie, `/api/outings/${outing.id}`, "DELETE");
  assert.equal((await request(bearer, "/api/bootstrap")).plans.length, 0);
  check(stage);

  stage = "direct database denial and preserved development profile";
  const anonClient = createClient(url, key, options);
  assert((await anonClient.from("places").select("id")).error);
  assert((await mobile.from("editions").select("id")).error);
  const rows =
    await db`select tablename from pg_tables where schemaname='public' and not rowsecurity`;
  assert.equal(rows.length, 0);
  const profiles =
    await db`select * from users where id not in ${db(accounts.map((item) => item.id))} order by id`;
  assert.deepEqual(profiles, existingProfiles);
  check(stage);
} catch (error) {
  process.exitCode = 1;
  console.error(
    `FAIL: ${stage}; ${error instanceof Error ? error.message.replace(/Bearer\s+\S+/g, "Bearer [redacted]") : "unknown error"}`,
  );
} finally {
  try {
    if (objectPaths.length) {
      const { error } = await admin.storage.from("captures").remove(objectPaths);
      assert(!error, "Scoped Storage cleanup failed.");
    }
    const ids = accounts.map((item) => item.id);
    if (ids.length) {
      await db.begin(async (tx) => {
        await tx`delete from editions where user_id in ${tx(ids)}`;
        await tx`delete from outing_members where user_id in ${tx(ids)}`;
        await tx`delete from outings where created_by in ${tx(ids)}`;
        await tx`delete from wishlist_saves where user_id in ${tx(ids)}`;
        await tx`delete from wishlist_items where added_by in ${tx(ids)}`;
        await tx`delete from wishlist_members where user_id in ${tx(ids)}`;
        await tx`delete from wishlists where owner_id in ${tx(ids)}`;
        for (const table of [
          "rankings",
          "ranking_groups",
          "place_preferences",
          "edition_counters",
          "api_requests",
        ]) {
          await tx`delete from ${tx(table)} where user_id in ${tx(ids)}`;
        }
        await tx`delete from users where id in ${tx(ids)}`;
      });
      for (const id of ids) {
        const { error } = await admin.auth.admin.deleteUser(id);
        assert(!error, "Scoped Auth cleanup failed.");
      }
      const remaining = await db`select id from users where id in ${db(ids)}`;
      assert.equal(remaining.length, 0);
    }
    check("temporary accounts, rows and Storage objects cleaned up");
  } catch {
    process.exitCode = 1;
    console.error("FAIL: scoped cleanup; inspect temporary integration accounts before rerunning.");
  }
  await db.end();
  console.log(
    JSON.stringify({ passed: passed.length, success: !process.exitCode, coverage: passed }),
  );
}

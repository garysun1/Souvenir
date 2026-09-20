import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const container = `souvenir-worldwide-${randomUUID()}`;
const docker = (...args) => execFileSync("docker", args, { encoding: "utf8", stdio: "pipe" });
const sql = (input) =>
  execFileSync(
    "docker",
    ["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-At"],
    { input, encoding: "utf8", stdio: "pipe" },
  ).trim();
const journal = JSON.parse(
  readFileSync(new URL("../../drizzle/meta/_journal.json", import.meta.url), "utf8"),
);
const migrate = (entry) =>
  sql(readFileSync(new URL(`../../drizzle/${entry.tag}.sql`, import.meta.url), "utf8"));
const user = "10000000-0000-4000-8000-000000000001";
const friend = "10000000-0000-4000-8000-000000000002";
const place = "20000000-0000-4000-8000-000000000001";
const edition = "30000000-0000-4000-8000-000000000001";
const note = "40000000-0000-4000-8000-000000000001";

try {
  docker(
    "run",
    "--detach",
    "--name",
    container,
    "-e",
    "POSTGRES_HOST_AUTH_METHOD=trust",
    "postgres:16",
  );
  execFileSync(
    "docker",
    [
      "exec",
      container,
      "sh",
      "-c",
      "until pg_isready -h 127.0.0.1 -U postgres; do sleep 0.2; done",
    ],
    { timeout: 30000, stdio: "pipe" },
  );
  sql(`CREATE ROLE anon; CREATE ROLE authenticated;
    GRANT USAGE ON SCHEMA public TO anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO PUBLIC, anon, authenticated;`);
  journal.entries.filter((entry) => entry.idx <= 4).forEach(migrate);
  sql(`
    INSERT INTO users(id,handle,display_name) VALUES ('${user}','one','One'),('${friend}','two','Two');
    INSERT INTO places(id,slug,name,category,lat,lng,city,description,rarity_tier,rarity_appeal,rarity_discovery_freq,rarity_availability)
    VALUES ('${place}','original-place','Original place','nature',1,2,'Keep locality','Keep description','common',1,2,3);
    INSERT INTO editions(id,user_id,place_id,request_id,visit_sequence,note,photo_path)
    VALUES ('${edition}','${user}','${place}','${edition}',1,'Private memory','captures/private');
    INSERT INTO place_preferences(user_id,place_id,tip) VALUES ('${user}','${place}','Keep private tip');
  `);
  const before = sql(`SELECT name || ':' || city || ':' || rarity_discovery_freq FROM places`);
  journal.entries.filter((entry) => entry.idx > 4).forEach(migrate);
  assert.equal(
    sql(`SELECT name || ':' || city || ':' || rarity_discovery_freq FROM places`),
    before,
  );
  assert.equal(sql("SELECT tip FROM place_preferences"), "Keep private tip");
  assert.equal(sql("SELECT visibility FROM editions"), "private");
  assert.equal(sql("SELECT stats_visibility FROM users LIMIT 1"), "private");
  assert.equal(
    sql("SELECT count(*) FROM pg_tables WHERE schemaname='public' AND NOT rowsecurity"),
    "0",
  );
  assert.equal(
    sql(`SELECT count(*) FROM information_schema.role_table_grants
    WHERE table_schema='public' AND grantee IN ('PUBLIC','anon','authenticated')`),
    "0",
  );

  sql(`UPDATE places SET city=NULL WHERE id='${place}'`);
  assert.equal(sql("SELECT city IS NULL FROM places"), "t");
  assert.throws(() => sql(`UPDATE places SET source='user' WHERE id='${place}'`));
  assert.throws(() => sql(`UPDATE places SET lat=91 WHERE id='${place}'`));
  sql(`INSERT INTO place_notes(id,place_id,user_id,request_id,kind,body,legacy_tip)
    VALUES ('${note}','${place}','${user}','${note}','tip','Private legacy',true)`);
  assert.equal(sql("SELECT visibility FROM place_notes"), "private");
  assert.throws(() => sql(`UPDATE place_notes SET visibility='public'`));
  assert.throws(() =>
    sql(`INSERT INTO place_notes(place_id,user_id,request_id,kind,body)
    VALUES ('${place}','${user}','${note}','story','Different replay')`),
  );
  sql(`INSERT INTO place_notes(place_id,user_id,request_id,kind,body)
    VALUES ('${place}','${friend}','${note}','story','Other actor may reuse request UUID')`);
  sql(`INSERT INTO place_sources(place_id,provider,provider_id,retention_policy)
    VALUES ('${place}','google','google-id','metadata_only')`);
  assert.throws(() => sql(`UPDATE place_sources SET payload='{"name":"not persistable"}'`));
  assert.throws(() =>
    sql(`INSERT INTO place_sources(place_id,provider,provider_id)
    VALUES ('${place}','google','google-id')`),
  );
  assert.throws(() =>
    sql(`INSERT INTO place_sources(place_id,provider,provider_id,retention_policy)
    VALUES ('${place}','osm','node/1','expiring')`),
  );
  sql(`INSERT INTO place_sources(place_id,provider,provider_id,retention_policy,payload,policy_url,policy_checked_at,license,attribution)
    VALUES ('${place}','osm','node/1','licensed','{"name":"Documented source"}','https://osmfoundation.org',now(),'ODbL-1.0','OpenStreetMap contributors')`);
  const imageInsert = `INSERT INTO place_images(place_id,provider,url,license,attribution,source_page_url,storage_path)
    VALUES ('${place}','wikimedia','https://example.test/image.jpg','CC0-1.0','Photographer','https://example.test/source',`;
  assert.throws(() => sql(`${imageInsert}'captures/private')`));
  sql(`${imageInsert}'place-images/public.jpg')`);

  sql(
    `INSERT INTO activity_events(user_id,kind,place_id,edition_id) VALUES ('${user}','edition','${place}','${edition}')`,
  );
  assert.throws(() => sql(`UPDATE activity_events SET user_id='${friend}'`));
  assert.throws(() => sql(`UPDATE activity_events SET kind='ranking'`));
  sql(
    `INSERT INTO activity_events(user_id,kind,place_id,note_id) VALUES ('${user}','note','${place}','${note}')`,
  );
  sql(`DELETE FROM editions WHERE id='${edition}'; DELETE FROM place_notes WHERE id='${note}'`);
  assert.equal(sql("SELECT count(*) FROM activity_events"), "0");
  sql(`INSERT INTO friendships(user_id,friend_id,status) VALUES ('${user}','${friend}','accepted');
    INSERT INTO activity_events(user_id,kind,friend_id) VALUES ('${user}','friend','${friend}'),('${friend}','friend','${user}');
    DELETE FROM friendships WHERE user_id='${user}'`);
  assert.equal(sql("SELECT count(*) FROM activity_events"), "0");
  sql(`INSERT INTO friendships(user_id,friend_id,status) VALUES ('${user}','${friend}','accepted');
    INSERT INTO activity_events(user_id,kind,friend_id) VALUES ('${user}','friend','${friend}');
    UPDATE friendships SET status='pending'`);
  assert.equal(sql("SELECT count(*) FROM activity_events"), "0");

  sql(`INSERT INTO place_stats(place_id,window_start,window_end,baseline_start,baseline_end)
    VALUES ('${place}','2026-06-22Z','2026-09-20Z','2026-07-13Z','2026-09-07Z')`);
  assert.throws(() => sql("UPDATE place_stats SET city_visitors_90d=4,visitors_90d=5"));
  assert.throws(() =>
    sql(
      "UPDATE place_stats SET discovery_freq=1,city_visitors_90d=4,visitors_90d=4,city='Same name',country='US'",
    ),
  );
  assert.throws(() => sql("UPDATE place_stats SET recommend_rate=1,recommend=4"));
  assert.throws(() => sql("UPDATE place_stats SET trending_score=1,collectors_8w_avg=0"));
  assert.throws(() =>
    sql("UPDATE place_stats SET baseline_end='2026-09-14Z',baseline_start='2026-07-20Z'"),
  );
  sql(`UPDATE place_stats SET discovery_freq=0.5,city_visitors_90d=10,visitors_90d=5,city='Same name',country='US',
    recommend=3,depends=1,skip=1,recommend_rate=0.6`);
  assert.throws(() => sql("UPDATE place_stats SET recommend_rate=0.75"));
  sql(`INSERT INTO place_suggestions(user_id,place_id,request_id,field,value)
    VALUES ('${user}','${place}','${note}','website',NULL)`);
  assert.throws(() => sql("UPDATE place_suggestions SET field='name'"));

  for (const table of [
    "place_sources",
    "place_images",
    "place_notes",
    "place_tags",
    "place_suggestions",
    "coverage_cells",
    "place_stats",
    "user_stats",
    "activity_events",
  ]) {
    for (const role of ["anon", "authenticated"]) {
      assert.throws(() => sql(`SET ROLE ${role}; SELECT * FROM ${table}`));
      sql(`GRANT SELECT, INSERT ON ${table} TO ${role}`);
      assert.equal(sql(`SET ROLE ${role}; SELECT count(*) FROM ${table}`).split("\n").at(-1), "0");
      sql(`REVOKE SELECT, INSERT ON ${table} FROM ${role}`);
    }
  }
  sql("GRANT INSERT ON place_tags TO authenticated");
  assert.throws(() =>
    sql(
      `SET ROLE authenticated; INSERT INTO place_tags(place_id,user_id,tag) VALUES ('${place}','${user}','blocked')`,
    ),
  );
  sql("REVOKE INSERT ON place_tags FROM authenticated");
  console.log(
    "Disposable worldwide migration: data preservation, localities, retention, idempotency, event ownership/deletion, friend revocation, metric guards and 26-table RLS/revokes passed.",
  );
} finally {
  docker("rm", "--force", container);
}

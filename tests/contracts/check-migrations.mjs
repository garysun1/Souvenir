import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const container = `souvenir-migrations-${randomUUID()}`;
const docker = (...args) =>
  execFileSync("docker", args, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
const sql = (input) =>
  execFileSync(
    "docker",
    ["exec", "-i", container, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-At"],
    { input, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
const migration = (name) =>
  sql(readFileSync(fileURLToPath(new URL(`../../drizzle/${name}`, import.meta.url)), "utf8"));

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
    ["exec", container, "sh", "-c", "until pg_isready -U postgres; do sleep 0.2; done"],
    { timeout: 30000, stdio: "pipe" },
  );
  migration("0000_lean_baron_zemo.sql");
  sql(`
    CREATE ROLE anon; CREATE ROLE authenticated;
    GRANT USAGE ON SCHEMA public TO anon, authenticated;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
    INSERT INTO users(id, handle, display_name)
    VALUES ('10000000-0000-4000-8000-000000000001','one','One'),
           ('10000000-0000-4000-8000-000000000002','two','Two');
    INSERT INTO places(id,slug,name,category,lat,lng,city,description,rarity_tier,
                       rarity_appeal,rarity_discovery_freq,rarity_availability)
    VALUES ('20000000-0000-4000-8000-000000000001','stable-place','Stable','culture',
            34,-118,'Los Angeles','Keep me','common',0,0,0);
    INSERT INTO editions(id,user_id,place_id,variant,note,captured_at)
    VALUES ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
            '20000000-0000-4000-8000-000000000001','standard','Original','2026-01-01Z'),
           ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',
            '20000000-0000-4000-8000-000000000001','revisit','Second','2026-02-01Z');
    INSERT INTO wishlists(id,owner_id,name,is_shared)
    VALUES ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Keep list',true);
    INSERT INTO wishlist_items(wishlist_id,place_id,added_by)
    VALUES ('40000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
            '10000000-0000-4000-8000-000000000002');
    INSERT INTO rankings(user_id,place_id,would_recommend) VALUES
      ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',true);
  `);
  for (const name of [
    "0001_supabase_sync.sql",
    "0002_backfill_sync_metadata.sql",
    "0003_require_sync_metadata.sql",
    "0004_private_api_boundary.sql",
  ])
    migration(name);

  assert.equal(
    sql(
      "SELECT string_agg(note || ':' || visit_sequence, ',' ORDER BY visit_sequence) FROM editions",
    ),
    "Original:1,Second:2",
  );
  assert.equal(
    sql("SELECT slug FROM places WHERE id='20000000-0000-4000-8000-000000000001'"),
    "stable-place",
  );
  assert.equal(sql("SELECT count(*) FROM api_requests"), "2");
  assert.equal(sql("SELECT last_sequence FROM edition_counters"), "2");
  assert.equal(sql("SELECT count(*) FROM wishlist_members"), "2");
  assert.equal(sql("SELECT count(*) FROM wishlist_saves"), "1");
  assert.equal(sql("SELECT count(*) FROM wishlist_items"), "1");
  assert.equal(sql("SELECT sentiment FROM rankings"), "recommend");
  assert.equal(
    sql("SELECT count(*) FROM pg_tables WHERE schemaname='public' AND rowsecurity"),
    "17",
  );
  assert.equal(
    sql(`
    SELECT count(*) FROM information_schema.role_table_grants
    WHERE table_schema='public' AND grantee IN ('anon','authenticated','PUBLIC')
  `),
    "0",
  );
  for (const role of ["anon", "authenticated"]) {
    assert.throws(() => sql(`SET ROLE ${role}; SELECT * FROM editions`));
    sql("GRANT SELECT ON editions TO anon, authenticated");
    assert.equal(sql(`SET ROLE ${role}; SELECT count(*) FROM editions`).split("\n").at(-1), "0");
    sql("REVOKE SELECT ON editions FROM anon, authenticated");
  }
  sql(`
    INSERT INTO editions(user_id,place_id,request_id,visit_sequence,variant)
    VALUES ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
            '50000000-0000-4000-8000-000000000001',3,'revisit'),
           ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
            '50000000-0000-4000-8000-000000000002',4,'revisit');
  `);
  assert.equal(sql("SELECT count(*) FROM editions WHERE variant='revisit'"), "3");
  assert.throws(() =>
    sql(`
    INSERT INTO editions(user_id,place_id,request_id,visit_sequence)
    VALUES ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
            '50000000-0000-4000-8000-000000000001',5)
  `),
  );
  sql("DELETE FROM editions WHERE visit_sequence=1");
  assert.equal(
    sql(
      "SELECT count(*) FROM api_requests WHERE resource_id='30000000-0000-4000-8000-000000000001'",
    ),
    "1",
  );
  assert.equal(sql("SELECT last_sequence FROM edition_counters"), "2");
  sql(`
    INSERT INTO api_requests(user_id,request_id,operation,request_hash,import_source_id)
    VALUES ('10000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',
            'edition.create','hash','import:one');
  `);
  assert.throws(() =>
    sql(`
    INSERT INTO api_requests(user_id,request_id,operation,request_hash)
    VALUES ('10000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',
            'edition.create','different')
  `),
  );
  assert.throws(() =>
    sql(`
    INSERT INTO api_requests(user_id,request_id,operation,request_hash,import_source_id)
    VALUES ('10000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000002',
            'edition.create','hash','import:one')
  `),
  );
  sql(`
    INSERT INTO api_requests(user_id,request_id,operation,request_hash,import_source_id)
    VALUES ('10000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000001',
            'edition.create','hash','import:one');
  `);
  console.log(
    "Local Postgres migrations: preservation, revisits, backfill, ledger isolation and RLS passed.",
  );
} finally {
  docker("rm", "--force", container);
}

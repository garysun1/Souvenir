import { afterEach, describe, expect, it, vi } from "vitest";
import { appendFileSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import {
  API_ORIGIN,
  SUPABASE_ORIGIN,
  RUNS,
  CACHE,
  cleanEnvironment,
  guardedFetch,
  localUrl,
  runId,
} from "../../scripts/load/safety";
import {
  Manifest,
  optionsSchema,
  recordSchema,
  type RunOptions,
} from "../../scripts/load/manifest";
import { avatar, fixtureHash, fixtures, persona, stableId } from "../../scripts/load/fixtures";
import { bounded } from "../../scripts/load/run";
import { hash, jpegDimensions, photoBytes } from "../../scripts/load/photos";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("local isolation", () => {
  it("rejects hosted, ambiguous, option-bearing and unexpected local targets", () => {
    expect(localUrl(API_ORIGIN, "api").port).toBe("3300");
    expect(localUrl(SUPABASE_ORIGIN, "supabase").port).toBe("56321");
    for (const url of [
      "https://example.supabase.co",
      "http://localhost:56321",
      "http://127.0.0.1:54321",
      "http://127.1:56321",
      "http://2130706433:56321",
      "http://user@127.0.0.1:56321",
      "http://127.0.0.1:56321?host=remote",
      "http://127.0.0.1:56321/rest",
    ])
      expect(() => localUrl(url, "supabase")).toThrow();
    expect(() =>
      localUrl("postgres://postgres:local@127.0.0.1:56322/postgres?host=example.com", "database"),
    ).toThrow();
    expect(localUrl("postgres://postgres:local@127.0.0.1:56322/postgres", "database").port).toBe(
      "56322",
    );
  });

  it("does not inherit credentials, preload hooks, remote Docker or proxy settings", () => {
    const env = cleanEnvironment({
      PATH: "/bin",
      HOME: "/home/local",
      SUPABASE_SECRET_KEY: "hosted-secret",
      NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
      DATABASE_URL: "hosted",
      NODE_OPTIONS: "--require=malicious",
      HTTPS_PROXY: "https://remote",
      DOCKER_HOST: "tcp://remote:2375",
      AWS_SECRET_ACCESS_KEY: "secret",
    });
    expect(env.PATH).toBe("/bin");
    expect(env.DOCKER_HOST).toBe("unix:///var/run/docker.sock");
    for (const key of [
      "SUPABASE_SECRET_KEY",
      "NEXT_PUBLIC_SUPABASE_URL",
      "DATABASE_URL",
      "NODE_OPTIONS",
      "HTTPS_PROXY",
      "AWS_SECRET_ACCESS_KEY",
    ])
      expect(env[key]).toBeUndefined();
  });

  it("rejects cross-origin fetches before the network and disables redirects", async () => {
    const mocked = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", mocked);
    const localFetch = guardedFetch(SUPABASE_ORIGIN);
    await expect(localFetch("https://example.supabase.co/auth/v1/admin/users")).rejects.toThrow();
    expect(mocked).not.toHaveBeenCalled();
    await localFetch(`${SUPABASE_ORIGIN}/auth/v1/user`);
    expect(mocked.mock.calls[0][1].redirect).toBe("error");
  });
});

describe("determinism and workload", () => {
  it("produces 35,000 visits for 1000 personas, with private and public histories", () => {
    const people = Array.from({ length: 1000 }, (_, i) => persona("fixed", i, null));
    expect(people.reduce((sum, person) => sum + person.visits.length, 0)).toBe(35000);
    expect(new Set(people.map((person) => person.home.city)).size).toBe(8);
    expect(
      new Set(people.flatMap((person) => person.visits.map((visit) => visit.place))).size,
    ).toBe(fixtures.length);
    expect(people.some((person) => person.visits.some((visit) => visit.daysAgo > 90))).toBe(true);
    expect(people[25]).toEqual(persona("fixed", 25, null));
    expect(people[25]).not.toEqual(persona("different", 25, null));
    expect(stableId("request")).toMatch(/^[a-f0-9-]{14}5[a-f0-9-]{3}-[89ab]/);
  });

  it("generates local avatars and fixes downloaded byte identity independently of URLs", () => {
    expect(avatar("one")).toBe(avatar("one"));
    expect(avatar("one")).not.toBe(avatar("two"));
    expect(avatar("one")).not.toMatch(/data:|https?:\/\/(?!www.w3.org)/);
    expect(hash(Buffer.from("version 1"))).not.toBe(hash(Buffer.from("version 2")));
    expect(() => jpegDimensions(Buffer.from("not a jpeg"))).toThrow();
  });

  it("drains active workers before returning an error and bounds concurrency", async () => {
    let active = 0;
    let peak = 0;
    let finished = 0;
    await expect(
      bounded([0, 1, 2, 3, 4], 2, async (item) => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, item === 0 ? 1 : 5));
        active--;
        finished++;
        if (item === 0) throw new Error("interrupted");
      }),
    ).rejects.toThrow("interrupted");
    expect(peak).toBe(2);
    expect(active).toBe(0);
    expect(finished).toBe(2);
  });

  it("refuses cached media that differs from its recorded downloaded-byte hash", () => {
    mkdirSync(CACHE, { recursive: true });
    const sha256 = hash(randomUUID());
    const path = resolve(CACHE, `${sha256}.jpg`);
    writeFileSync(path, "changed bytes");
    try {
      expect(() =>
        photoBytes({
          sourceId: "test",
          photographer: "test",
          sourceUrl: "https://unsplash.com/",
          license: "offline test",
          licenseUrl: "https://unsplash.com/license",
          attribution: "test",
          width: 1,
          height: 1,
          sha256,
          bytes: 13,
          fetchedAt: "2026-09-20T00:00:00.000Z",
        }),
      ).toThrow("Photo changed");
    } finally {
      rmSync(path);
    }
  });
});

describe("manifest recovery", () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });
  function options(): RunOptions {
    const id = `test-${randomUUID().slice(0, 12)}`;
    dirs.push(resolve(RUNS, id));
    return {
      runId: id,
      seed: "fixed",
      accounts: 2,
      editions: 3,
      concurrency: 1,
      mode: "core",
      photoMode: "none",
      anchor: "2026-09-20T00:00:00.000Z",
      fixtureHash,
      poolHash: null,
    };
  }
  it("keeps complete intents, discards a torn final append, and prevents double writers", () => {
    const opts = options();
    const first = new Manifest(opts.runId, opts);
    first.append({
      kind: "intent",
      key: "account:0",
      email: `souvenir-load-${opts.runId}-0@example.invalid`,
      index: 0,
    });
    expect(() => new Manifest(opts.runId, undefined, true)).toThrow("live owner");
    first.close();
    appendFileSync(resolve(first.dir, "journal.jsonl"), '{"kind":"account","id":"');
    const resumed = new Manifest(opts.runId);
    expect(resumed.records).toHaveLength(1);
    expect(resumed.has("account:0", "intent")).toBeDefined();
    expect(readFileSync(resolve(resumed.dir, "journal.jsonl"), "utf8").endsWith("\n")).toBe(true);
    resumed.append({ kind: "account", key: "account:0", id: stableId("user") });
    expect(resumed.has("account:0", "account")?.id).toBe(stableId("user"));
    resumed.close();
  });
  it("fails closed on corrupt completed records, unsafe IDs, secrets and excessive accounts", () => {
    expect(() => runId("../remote")).toThrow();
    expect(optionsSchema.safeParse({ ...options(), accounts: 1001 }).success).toBe(false);
    expect(
      recordSchema.safeParse({ kind: "account", key: "one", access_token: "secret" }).success,
    ).toBe(false);
    const opts = options();
    const first = new Manifest(opts.runId, opts);
    first.close();
    appendFileSync(resolve(first.dir, "journal.jsonl"), "corrupt\n");
    expect(() => new Manifest(opts.runId)).toThrow();
  });
});

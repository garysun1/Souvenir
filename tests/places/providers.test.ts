import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import {
  radiusBounds,
  distanceM,
  geohash,
  cellBounds,
  inBounds,
  splitBounds,
} from "@/lib/places/geo";
import { parseOverpass, overpassQuery, OsmPlacesProvider } from "@/lib/places/osm";
import { parseWikidata, fetchEntity } from "@/lib/places/wikidata";
import { parseCommonsImage } from "@/lib/places/wikimedia";
import { normalizePlace } from "@/lib/places/normalize";
import { buildFixtureCity, fixtureCities } from "@/lib/places/fixtures";
import { createProviderHttp } from "@/lib/places/http";
import { providerPlaceSchema } from "@/lib/places/types";

const fetchedAt = "2026-09-20T00:00:00.000Z";
describe("bounded geography", () => {
  it("covers both sides of the antimeridian and excludes Greenwich", () => {
    const bounds = radiusBounds(0, 179.99, 5000);
    expect(splitBounds(bounds)).toHaveLength(2);
    expect(inBounds({ lat: 0, lng: -179.99 }, bounds)).toBe(true);
    expect(inBounds({ lat: 0, lng: 0 }, bounds)).toBe(false);
    expect(distanceM({ lat: 0, lng: 179.99 }, { lat: 0, lng: -179.99 })).toBeCloseTo(2223.9, 0);
  });
  it("covers all longitudes near the pole and rejects invalid bounds", () => {
    expect(radiusBounds(89.99, 0, 5000)).toMatchObject({ west: -180, east: 180 });
    expect(() => radiusBounds(91, 0, 1000)).toThrow();
    expect(() => radiusBounds(0, 0, 200001)).toThrow();
    expect(() => cellBounds("u4pruy")).toThrow();
  });
  it.each(fixtureCities)("round-trips $city into its geohash cell", (city) => {
    expect(inBounds(city, cellBounds(geohash(city.lat, city.lng, 5)))).toBe(true);
  });
});
describe("provider parsing", () => {
  it("keeps identities and honest missing locality/hours, rejecting malformed records", () => {
    const records = parseOverpass(
      {
        elements: [
          {
            type: "node",
            id: 12,
            lat: 2,
            lon: 3,
            tags: { name: "Museum", tourism: "museum", website: "javascript:alert(1)" },
          },
          {
            type: "way",
            id: 13,
            center: { lat: 4, lon: 5 },
            tags: {
              name: "Park",
              leisure: "park",
              "addr:country": "pt",
              opening_hours: "Mo-Fr 09:00-17:00",
            },
          },
          { type: "node", id: 14, lat: 200, lon: 3, tags: { name: "Bad", tourism: "museum" } },
          { type: "node", id: 15, lat: 2, lon: 3, tags: { name: "Unsupported", shop: "clothes" } },
        ],
      },
      fetchedAt,
    );
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      providerId: "node/12",
      country: null,
      city: null,
      openingHours: null,
      website: null,
    });
    expect(records[1]).toMatchObject({
      providerId: "way/13",
      category: "nature",
      lat: 4,
      country: "PT",
    });
    expect(() => parseOverpass({ elements: [], remark: "timeout" }, fetchedAt)).toThrow();
    expect(() => parseOverpass({ elements: Array(501).fill({}) }, fetchedAt)).toThrow();
  });
  it("bounds Overpass work, splits dateline queries and filters unexpected results", async () => {
    const bounds = radiusBounds(0, 179.99, 2000);
    const query = overpassQuery(bounds, 10);
    expect(query).toContain("-180");
    expect(query).toContain("[timeout:5][maxsize:16777216]");
    expect(query).toContain("out center tags 10;");
    expect(() => overpassQuery({ south: -1, north: 1, west: -1, east: 1 }, 10)).toThrow();
    expect(() => overpassQuery(bounds, 501)).toThrow();
    const provider = new OsmPlacesProvider("https://overpass.test", {
      json: async () => ({
        elements: [
          {
            type: "node",
            id: 1,
            lat: 0,
            lon: -179.999,
            tags: { name: "Inside", tourism: "museum" },
          },
          { type: "node", id: 2, lat: 0, lon: 0, tags: { name: "Outside", tourism: "museum" } },
        ],
      }),
    });
    expect(await provider.bbox(bounds, 10)).toMatchObject([{ name: "Inside" }]);
  });
  it("accepts only unambiguous current Wikidata claims", async () => {
    const claim = (value: string, rank = "normal") => ({
      rank,
      mainsnak: { snaktype: "value", datavalue: { value } },
    });
    const response = {
      entities: {
        Q42: {
          id: "Q42",
          claims: {
            P856: [
              claim("https://old.test", "deprecated"),
              claim("https://one.test"),
              claim("https://two.test"),
            ],
            P18: [claim("Example.jpg")],
          },
        },
      },
    };
    expect(parseWikidata(response, "Q42")).toMatchObject({
      website: null,
      description: null,
      imageRefs: ["Example.jpg"],
    });
    expect(parseWikidata(response, "Q43")).toBeNull();
    const json = vi.fn<(url: string) => Promise<typeof response>>().mockResolvedValue(response);
    await fetchEntity("Q42", { json });
    const requested = new URL(json.mock.calls[0][0]);
    expect(requested.searchParams.get("ids")).toBe("Q42");
    expect(requested.searchParams.get("maxlag")).toBe("5");
  });
  it("requires per-file Commons license, artist and known HTTPS hosts", () => {
    const info = {
      thumburl: "https://upload.wikimedia.org/example.jpg",
      thumbwidth: 1280,
      thumbheight: 720,
      descriptionurl: "https://commons.wikimedia.org/wiki/File:Example.jpg",
      mime: "image/jpeg",
      extmetadata: {
        Artist: { value: "<b>Example artist</b>" },
        LicenseUrl: { value: "https://creativecommons.org/licenses/by-sa/4.0/" },
      },
    };
    const response = (data: typeof info) => ({
      query: { pages: [{ title: "File:Example.jpg", imageinfo: [data] }] },
    });
    expect(parseCommonsImage(response(info), "Example.jpg")).toMatchObject({
      license: "CC-BY-SA-4.0",
      attribution: "Example artist — CC-BY-SA-4.0",
    });
    expect(
      parseCommonsImage(
        response({ ...info, thumburl: "https://evil.test/image.jpg" }),
        "Example.jpg",
      ),
    ).toBeNull();
    expect(
      parseCommonsImage(
        response({ ...info, extmetadata: { ...info.extmetadata, Artist: { value: "" } } }),
        "Example.jpg",
      ),
    ).toBeNull();
    expect(
      parseCommonsImage(
        response({
          ...info,
          extmetadata: {
            ...info.extmetadata,
            LicenseUrl: { value: "https://creativecommons.org/licenses/by-nc/4.0/" },
          },
        }),
        "Example.jpg",
      ),
    ).toBeNull();
    expect(parseCommonsImage(response(info), "Other.jpg")).toBeNull();
  });
});
describe("offline evidence", () => {
  it("stores 2,000 deterministic fixture records across eight cities without fabricated provider evidence", async () => {
    const identities = new Set<string>();
    for (const city of fixtureCities) {
      const records = (
        await readFile(new URL(`./fixtures/${city.slug}.jsonl`, import.meta.url), "utf8")
      )
        .trim()
        .split("\n")
        .map((line) => providerPlaceSchema.parse(JSON.parse(line)));
      expect(records).toEqual(buildFixtureCity(city));
      for (const record of records) {
        identities.add(record.providerId);
        expect(record).toMatchObject({
          provider: "curated",
          evidence: "synthetic-fixture",
          openingHours: null,
          website: null,
        });
        expect(normalizePlace(record).stats).toMatchObject({
          rarityStatus: "unavailable",
          provenance: "synthetic-fixture",
        });
      }
    }
    expect(identities.size).toBe(2000);
  });
  it("rejects fixture/provider namespace confusion and preserves stable identities on rename", () => {
    const record = buildFixtureCity(fixtureCities[0])[0];
    expect(() => normalizePlace({ ...record, evidence: "provider" })).toThrow();
    expect(normalizePlace(record).externalIds).toEqual(
      normalizePlace({ ...record, name: "Renamed" }).externalIds,
    );
    expect(() => normalizePlace({ ...record, lat: NaN })).toThrow();
  });
});
describe("bounded provider HTTP", () => {
  function clock() {
    let now = 0;
    const sleeps: number[] = [];
    return {
      now: () => now,
      sleeps,
      sleep: async (ms: number) => {
        sleeps.push(ms);
        now += ms;
      },
    };
  }
  it("honors Retry-After before one retry and identifies the client", async () => {
    const time = clock();
    const send = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("", { status: 429, headers: { "Retry-After": "2" } }))
      .mockResolvedValueOnce(Response.json({ ok: true }));
    const http = createProviderHttp("Souvenir test agent", { ...time, fetch: send });
    expect(await http.json("https://provider.test")).toEqual({ ok: true });
    expect(time.sleeps).toContain(2000);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0][1]).toMatchObject({
      redirect: "error",
      headers: { "User-Agent": "Souvenir test agent" },
    });
  });
  it("does not sleep unboundedly or retry before a long server cooldown", async () => {
    const time = clock();
    const send = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("", { status: 429, headers: { "Retry-After": "3600" } }));
    const http = createProviderHttp("Souvenir test agent", { ...time, fetch: send });
    await expect(http.json("https://provider.test")).rejects.toMatchObject({
      code: "rate_limited",
      retryAfterMs: 3600000,
    });
    await expect(http.json("https://provider.test")).rejects.toMatchObject({
      code: "rate_limited",
    });
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("bounds streamed response size and never includes provider text in errors", async () => {
    const http = createProviderHttp("Souvenir test agent", {
      ...clock(),
      maxBytes: 10,
      fetch: async () => new Response("private provider payload too large"),
    });
    await expect(http.json("https://provider.test")).rejects.toMatchObject({ code: "too_large" });
    const invalid = createProviderHttp("Souvenir test agent", {
      ...clock(),
      fetch: async () => new Response("private invalid json"),
    });
    await expect(invalid.json("https://provider.test")).rejects.toMatchObject({
      message: "Destination provider invalid response.",
    });
  });
  it("aborts timed-out requests and retries at most once", async () => {
    const send = vi.fn<typeof fetch>(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("request timeout")));
        }),
    );
    const http = createProviderHttp("Souvenir test agent", {
      ...clock(),
      timeoutMs: 5,
      fetch: send,
    });
    await expect(http.json("https://provider.test")).rejects.toMatchObject({ code: "unavailable" });
    expect(send).toHaveBeenCalledTimes(2);
  });
});

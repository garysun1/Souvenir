import { z } from "zod";
import type { ProviderHttp } from "./http";
import { ProviderError, safeUrlSchema } from "./types";

const claimSchema = z.object({
  rank: z.enum(["normal", "preferred", "deprecated"]).optional(),
  qualifiers: z.record(z.unknown()).optional(),
  mainsnak: z.object({
    snaktype: z.string(),
    datavalue: z.object({ value: z.unknown() }).optional(),
  }),
});
const entitySchema = z.object({
  id: z.string().regex(/^Q[1-9]\d*$/),
  descriptions: z.record(z.object({ value: z.string() })).optional(),
  claims: z.record(z.array(claimSchema)).default({}),
});
export interface WikidataMetadata {
  id: string;
  description: string | null;
  website: string | null;
  imageRefs: string[];
}
export function parseWikidata(data: unknown, id: string): WikidataMetadata | null {
  const response = z.object({ entities: z.record(z.unknown()) }).safeParse(data);
  if (!response.success) throw new ProviderError("invalid_response");
  const result = entitySchema.safeParse(response.data.entities[id]);
  if (!result.success || result.data.id !== id) return null;
  const values = (property: string) => {
    const claims = (result.data.claims[property] ?? []).filter(
      (claim) =>
        claim.rank !== "deprecated" && !claim.qualifiers && claim.mainsnak.snaktype === "value",
    );
    const preferred = claims.filter((claim) => claim.rank === "preferred");
    return (preferred.length ? preferred : claims).map((claim) => claim.mainsnak.datavalue?.value);
  };
  const websites = values("P856").filter(
    (value): value is string => safeUrlSchema.safeParse(value).success,
  );
  const imageRefs = values("P18")
    .filter(
      (value): value is string =>
        typeof value === "string" && value.length > 0 && value.length <= 240,
    )
    .slice(0, 5);
  return {
    id,
    description: result.data.descriptions?.en?.value.slice(0, 2000) ?? null,
    website: websites.length === 1 ? websites[0] : null,
    imageRefs,
  };
}
export async function fetchEntity(
  id: string,
  http: ProviderHttp,
): Promise<WikidataMetadata | null> {
  z.string()
    .regex(/^Q[1-9]\d*$/)
    .parse(id);
  const url = new URL("https://www.wikidata.org/w/api.php");
  url.search = new URLSearchParams({
    action: "wbgetentities",
    ids: id,
    props: "descriptions|claims",
    languages: "en",
    format: "json",
    maxlag: "5",
  }).toString();
  return parseWikidata(await http.json(url.toString()), id);
}

import { z } from "zod";
import type { ProviderHttp } from "./http";
import { ProviderError } from "./types";

export interface CommonsImageCandidate {
  providerId: string;
  url: string;
  width: number;
  height: number;
  license: string;
  licenseUrl: string;
  attribution: string;
  sourcePageUrl: string;
}
const licenses: Record<string, string> = {
  "https://creativecommons.org/publicdomain/zero/1.0/": "CC0-1.0",
  "https://creativecommons.org/publicdomain/mark/1.0/": "Public-domain-mark-1.0",
  ...Object.fromEntries(
    ["1.0", "2.0", "2.5", "3.0", "4.0"].flatMap((version) => [
      [`https://creativecommons.org/licenses/by/${version}/`, `CC-BY-${version}`],
      [`https://creativecommons.org/licenses/by-sa/${version}/`, `CC-BY-SA-${version}`],
    ]),
  ),
};
function plainText(value: string): string {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(
      /&(?:nbsp|amp|lt|gt|quot|#39);/g,
      (entity) =>
        ({ "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" })[
          entity
        ] ?? "",
    )
    .trim()
    .slice(0, 1000);
}
export function parseCommonsImage(data: unknown, fileName: string): CommonsImageCandidate | null {
  const infoSchema = z.object({
    thumburl: z.string().url(),
    thumbwidth: z.number().int().positive(),
    thumbheight: z.number().int().positive(),
    descriptionurl: z.string().url(),
    mime: z.enum(["image/jpeg", "image/png", "image/webp"]),
    extmetadata: z.record(z.object({ value: z.string() })),
  });
  const parsed = z
    .object({
      query: z.object({
        pages: z
          .array(
            z.object({
              title: z.string(),
              imageinfo: z.array(z.unknown()).optional(),
            }),
          )
          .max(1),
      }),
    })
    .safeParse(data);
  if (!parsed.success) throw new ProviderError("invalid_response");
  const page = parsed.data.query.pages[0];
  if (!page || page.title !== `File:${fileName.replaceAll("_", " ")}`) return null;
  const info = infoSchema.safeParse(page.imageinfo?.[0]);
  if (!info.success) return null;
  const meta = info.data.extmetadata;
  const rawLicense = meta.LicenseUrl?.value ?? "";
  const licenseUrl = `${rawLicense.replace(/^http:/, "https:").replace(/\/$/, "")}/`;
  const license = licenses[licenseUrl];
  const restrictions = plainText(meta.Restrictions?.value ?? "");
  const artist = plainText(meta.Artist?.value ?? "");
  if (
    !license ||
    restrictions ||
    !artist ||
    /non.?commercial|no.?derivatives/i.test(meta.LicenseShortName?.value ?? "")
  )
    return null;
  const imageUrl = new URL(info.data.thumburl),
    pageUrl = new URL(info.data.descriptionurl);
  if (
    imageUrl.username ||
    imageUrl.password ||
    pageUrl.username ||
    pageUrl.password ||
    imageUrl.protocol !== "https:" ||
    imageUrl.hostname !== "upload.wikimedia.org" ||
    pageUrl.protocol !== "https:" ||
    pageUrl.hostname !== "commons.wikimedia.org"
  )
    return null;
  return {
    providerId: page.title,
    url: imageUrl.toString(),
    width: info.data.thumbwidth,
    height: info.data.thumbheight,
    license,
    licenseUrl,
    attribution: [artist, plainText(meta.Credit?.value ?? ""), license]
      .filter(Boolean)
      .join(" — ")
      .slice(0, 2000),
    sourcePageUrl: pageUrl.toString(),
  };
}
export async function resolveImage(
  fileName: string,
  http: ProviderHttp,
): Promise<CommonsImageCandidate | null> {
  z.string()
    .min(1)
    .max(240)
    .refine((name) => !/[|#\n\r]/.test(name))
    .parse(fileName);
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.search = new URLSearchParams({
    action: "query",
    prop: "imageinfo",
    titles: `File:${fileName}`,
    iiprop: "url|size|mime|extmetadata",
    iiurlwidth: "1280",
    format: "json",
    formatversion: "2",
    maxlag: "5",
  }).toString();
  return parseCommonsImage(await http.json(url.toString()), fileName);
}

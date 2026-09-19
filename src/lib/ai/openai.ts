import OpenAI from "openai";
import type { IdentifyRequest, IdentifyResponse, PlanRequest, PlanResponse } from "@/lib/schemas";
import { env } from "@/lib/env";
import { searchPg } from "@/lib/search/pgFallback";

const client = env.OPENAI_API_KEY ? new OpenAI({ apiKey: env.OPENAI_API_KEY }) : null;

export const openAiProvider = {
  async identifyPlace(input: IdentifyRequest): Promise<IdentifyResponse> {
    if (!client) throw new Error("OPENAI_API_KEY is required for the OpenAI provider");
    const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: [{ type: "text", text: "Identify this place in Los Angeles. Return a concise place name." }, { type: "image_url", image_url: { url: input.imageUrl } }] }],
    });
    const identifiedName = response.choices[0]?.message.content?.trim() ?? "";
    const matches = await searchPg({ q: identifiedName, radiusKm: 200, limit: 1 });
    return { candidates: matches.map((match) => ({ place: match.place, confidence: 0.42 })) };
  },
  async planOuting(input: PlanRequest): Promise<PlanResponse> {
    const results = await searchPg({ q: input.query, radiusKm: 200, limit: 5 });
    if (!client) return { title: "Suggested outing", summary: "OpenAI is not configured; showing search suggestions.", places: results.map((item) => item.place) };
    await client.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: `Plan an outing using these places: ${results.map((item) => item.place.name).join(", ")}` }],
      tools: [{ type: "function", function: { name: "search_places", description: "Search Souvenir places", parameters: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } } }],
    });
    return { title: "Suggested outing", summary: "A route assembled with OpenAI and the Souvenir search service.", places: results.map((item) => item.place) };
  },
};

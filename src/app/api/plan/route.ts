import { z } from "zod";
import { dataResponse, parseJsonBody, withApiUser } from "@/lib/api";
import { mockProvider } from "@/lib/ai/mock";
import { planRequestSchema } from "@/lib/schemas";
import { uuidSchema } from "@/lib/contracts/api";
import { requirePlaces } from "@/lib/server/catalog";
import { db } from "@/lib/db";

export async function POST(request: Request) {
  return withApiUser(request, async () => {
    const parsed = await parseJsonBody(
      request,
      planRequestSchema
        .extend({
          placeIds: z.array(uuidSchema).max(100).default([]),
          query: z.string().min(1).max(2000),
          date: z.string().date().optional(),
        })
        .strict(),
    );
    if ("response" in parsed) return parsed.response;
    await requirePlaces(db, parsed.data.placeIds);
    return dataResponse({
      ...(await mockProvider.planOuting(parsed.data)),
      provenance: "simulation",
    });
  });
}

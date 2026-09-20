import { dataResponse, parseJsonBody, withApiUser } from "@/lib/api";
import { mockProvider } from "@/lib/ai/mock";
import { identifyRequestSchema } from "@/lib/schemas";

export async function POST(request: Request) {
  return withApiUser(request, async () => {
    const parsed = await parseJsonBody(request, identifyRequestSchema.strict());
    if ("response" in parsed) return parsed.response;
    return dataResponse({
      ...(await mockProvider.identifyPlace()),
      provenance: "simulation",
      message: "Sample suggestions only. Choose your place from the catalog.",
    });
  });
}

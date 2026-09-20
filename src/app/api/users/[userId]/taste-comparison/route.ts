import { tasteComparisonQuerySchema, tasteUserParamsSchema } from "@/lib/contracts/memories";
import { getTasteComparison } from "@/lib/server/taste-comparison";
import { memoryQuery } from "@/lib/server/memory-import-api";

export async function GET(request: Request, context: { params: Promise<{ userId: string }> }) {
  return memoryQuery(request, tasteComparisonQuerySchema, async (auth, query) => {
    const { userId } = tasteUserParamsSchema.parse(await context.params);
    return getTasteComparison(auth, userId, query);
  });
}

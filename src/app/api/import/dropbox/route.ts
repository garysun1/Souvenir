import { withApiUser } from "@/lib/api";
import { ApiError } from "@/lib/server/errors";

export async function POST(request: Request) {
  return withApiUser(request, async () => {
    throw new ApiError(
      503,
      "service_unavailable",
      "Dropbox is a fixture-only preview. Sample imports cannot be saved to real accounts.",
    );
  });
}

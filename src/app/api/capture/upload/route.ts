import { dataResponse, parseJsonBody, withApiUser } from "@/lib/api";
import { createCaptureUpload } from "@/lib/auth/storage";
import { photoUploadSchema } from "@/lib/contracts/api";

export async function POST(request: Request) {
  return withApiUser(request, async (auth) => {
    const input = await parseJsonBody(request, photoUploadSchema);
    if ("response" in input) return input.response;
    return dataResponse(await createCaptureUpload(auth, input.data));
  });
}

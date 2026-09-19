import { env } from "@/lib/env";

export async function getCaptureUploadUrl(path: string): Promise<string> {
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase service credentials are required for capture uploads");
  }
  const { createClient } = await import("@supabase/supabase-js");
  const client = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await client.storage.from("captures").createSignedUploadUrl(path);
  if (error) throw error;
  return data.signedUrl;
}

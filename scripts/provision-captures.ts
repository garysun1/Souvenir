import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { env } from "../src/lib/env";

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== "--apply"))
    throw new Error("Usage: tsx scripts/provision-captures.ts [--apply]");
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase server configuration is required.");
  const { storage } = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const options = {
    public: false,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
    fileSizeLimit: 10 * 1024 * 1024,
  };
  const { data: buckets, error } = await storage.listBuckets();
  if (error) throw new Error("Unable to inspect Storage buckets.");
  const existing = buckets.find((bucket) => bucket.id === "captures");
  const apply = args.includes("--apply");
  if (apply) {
    const result = existing
      ? await storage.updateBucket("captures", options)
      : await storage.createBucket("captures", options);
    if (result.error) throw new Error("Unable to provision the private captures bucket.");
    const { data: bucket, error: readError } = await storage.getBucket("captures");
    if (
      readError ||
      bucket.public ||
      bucket.file_size_limit !== options.fileSizeLimit ||
      JSON.stringify(bucket.allowed_mime_types?.slice().sort()) !==
        JSON.stringify(options.allowedMimeTypes.slice().sort())
    ) {
      throw new Error("Captures bucket settings did not match the private upload policy.");
    }
  }
  console.log(
    JSON.stringify({
      mode: apply ? "applied" : "dry-run",
      action: existing ? "update" : "create",
      bucket: "captures",
      ...options,
    }),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Storage provisioning failed.");
  process.exitCode = 1;
});

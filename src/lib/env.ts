import { z } from "zod";
import { isPublicSupabaseKey } from "../../shared/public-supabase-config";

const optionalString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().optional(),
);
const optionalUrl = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().url().optional(),
);
const publicSchema = z
  .object({
    NEXT_PUBLIC_SUPABASE_URL: optionalUrl,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.preprocess(
      (value) => (value === "" ? undefined : value),
      z.string().optional(),
    ),
  })
  .refine(
    (value) =>
      !value.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      isPublicSupabaseKey(
        value.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
        value.NEXT_PUBLIC_SUPABASE_URL,
      ),
  );

export function getPublicEnv(): z.output<typeof publicSchema> {
  const result = publicSchema.safeParse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  if (!result.success) throw new Error("The public Supabase configuration is invalid.");
  return result.data;
}

export function getSupabaseConfig(): { url: string; publishableKey: string } {
  const config = getPublicEnv();
  if (!config.NEXT_PUBLIC_SUPABASE_URL || !config.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    throw new Error(
      "Sign-in is unavailable. Configure the public Supabase URL and publishable key.",
    );
  }
  return {
    url: config.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: config.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  };
}

function serverValue<S extends z.ZodType>(schema: S, value: unknown, name: string): z.output<S> {
  if (typeof window !== "undefined") {
    throw new Error("Server configuration is unavailable in the browser.");
  }
  const result = schema.safeParse(value);
  if (!result.success) throw new Error(`Server configuration is invalid: ${name}.`);
  return result.data;
}

const originSchema = z
  .string()
  .url()
  .refine((value) => {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && url.origin === value;
  }, "Use an exact HTTP origin without a trailing slash");

export const env = {
  get DATABASE_URL() {
    return serverValue(
      z.string().min(1),
      process.env.DATABASE_URL ?? process.env.SUPABASE_DATABASE_URL,
      "DATABASE_URL",
    );
  },
  get NEXT_PUBLIC_SUPABASE_URL() {
    return getPublicEnv().NEXT_PUBLIC_SUPABASE_URL;
  },
  get NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY() {
    return getPublicEnv().NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  },
  get SUPABASE_SECRET_KEY() {
    return serverValue(optionalString, process.env.SUPABASE_SECRET_KEY, "SUPABASE_SECRET_KEY");
  },
  get SUPABASE_SERVICE_ROLE_KEY() {
    return serverValue(
      optionalString,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      "SUPABASE_SERVICE_ROLE_KEY",
    );
  },
  get APP_ORIGIN() {
    return serverValue(
      originSchema,
      process.env.APP_ORIGIN ??
        (process.env.NODE_ENV === "production" ? undefined : "http://localhost:3000"),
      "APP_ORIGIN",
    );
  },
  get CORS_ORIGINS(): string[] {
    const origins =
      process.env.CORS_ORIGINS?.split(",")
        .map((value) => value.trim())
        .filter(Boolean) ?? [];
    return serverValue(z.array(originSchema), origins, "CORS_ORIGINS");
  },
  get OPENAI_API_KEY() {
    return serverValue(optionalString, process.env.OPENAI_API_KEY, "OPENAI_API_KEY");
  },
  get TASTE_MODEL() {
    return serverValue(
      z.enum(["gpt-4o-mini-2024-07-18", "gpt-4o-2024-08-06"]).default("gpt-4o-mini-2024-07-18"),
      process.env.TASTE_MODEL,
      "TASTE_MODEL",
    );
  },
  get ELASTICSEARCH_URL() {
    return serverValue(optionalUrl, process.env.ELASTICSEARCH_URL, "ELASTICSEARCH_URL");
  },
  get ELASTICSEARCH_API_KEY() {
    return serverValue(optionalString, process.env.ELASTICSEARCH_API_KEY, "ELASTICSEARCH_API_KEY");
  },
  get SEARCH_PROVIDER() {
    return serverValue(
      z.enum(["pg", "es"]).default("pg"),
      process.env.SEARCH_PROVIDER,
      "SEARCH_PROVIDER",
    );
  },
  get PLACES_PROVIDER() {
    return serverValue(
      z.enum(["osm", "mock"]).default("osm"),
      process.env.PLACES_PROVIDER,
      "PLACES_PROVIDER",
    );
  },
  get PLACES_DISPOSABLE_DATABASE_URL() {
    return serverValue(
      optionalString,
      process.env.PLACES_DISPOSABLE_DATABASE_URL,
      "PLACES_DISPOSABLE_DATABASE_URL",
    );
  },
  get PLACES_LAZY_FILL() {
    return (
      serverValue(
        z.enum(["true", "false"]).default("false"),
        process.env.PLACES_LAZY_FILL,
        "PLACES_LAZY_FILL",
      ) === "true"
    );
  },
  get OVERPASS_URL() {
    return serverValue(optionalUrl, process.env.OVERPASS_URL, "OVERPASS_URL");
  },
  get OVERPASS_MANAGED_ENDPOINT() {
    return (
      serverValue(
        z.enum(["true", "false"]).default("false"),
        process.env.OVERPASS_MANAGED_ENDPOINT,
        "OVERPASS_MANAGED_ENDPOINT",
      ) === "true"
    );
  },
  get PLACES_USER_AGENT() {
    return serverValue(
      z.string().min(12).max(250).default("Souvenir/0.1 (+https://github.com/garysun1/Souvenir)"),
      process.env.PLACES_USER_AGENT,
      "PLACES_USER_AGENT",
    );
  },
  get AI_PROVIDER() {
    return serverValue(
      z.enum(["openai", "mock"]).default("mock"),
      process.env.AI_PROVIDER,
      "AI_PROVIDER",
    );
  },
  get NODE_ENV() {
    return serverValue(
      z.enum(["development", "test", "production"]).default("development"),
      process.env.NODE_ENV,
      "NODE_ENV",
    );
  },
  get DEV_USER_ID() {
    return serverValue(optionalString, process.env.DEV_USER_ID, "DEV_USER_ID");
  },
};

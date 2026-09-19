import { z } from "zod";

const optionalString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().optional(),
);
const optionalUrl = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().url().optional(),
);
const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  NEXT_PUBLIC_SUPABASE_URL: optionalUrl,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalString,
  SUPABASE_SERVICE_ROLE_KEY: optionalString,
  OPENAI_API_KEY: optionalString,
  ELASTICSEARCH_URL: optionalUrl,
  ELASTICSEARCH_API_KEY: optionalString,
  SEARCH_PROVIDER: z.enum(["pg", "es"]).default("pg"),
  AI_PROVIDER: z.enum(["openai", "mock"]).default("mock"),
  DEV_USER_ID: optionalString,
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
});

export const env = envSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  ELASTICSEARCH_URL: process.env.ELASTICSEARCH_URL,
  ELASTICSEARCH_API_KEY: process.env.ELASTICSEARCH_API_KEY,
  SEARCH_PROVIDER: process.env.SEARCH_PROVIDER,
  AI_PROVIDER: process.env.AI_PROVIDER,
  DEV_USER_ID: process.env.DEV_USER_ID,
  NODE_ENV: process.env.NODE_ENV,
});

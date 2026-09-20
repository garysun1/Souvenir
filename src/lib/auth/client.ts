import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

const credentialsSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128),
});

export function authMessage(error: { code?: string; status?: number }): string {
  if (error.code === "email_not_confirmed")
    return "Confirm your email before signing in. Check your inbox and spam folder.";
  if (error.code === "invalid_credentials") return "The email or password is incorrect.";
  if (error.code === "weak_password")
    return "Choose a stronger password with at least 8 characters.";
  if (error.status === 429) return "Too many attempts. Please wait a moment before retrying.";
  return "We could not connect to your account. Please try again.";
}

export async function authenticateWithPassword(
  client: SupabaseClient,
  input: { email: string; password: string; signup: boolean; callbackUrl: string },
): Promise<"signed_in" | "confirmation_required"> {
  const parsed = credentialsSchema.safeParse(input);
  if (!parsed.success) throw new Error("Enter a valid email address and password.");
  if (input.signup && parsed.data.password.length < 8)
    throw new Error("Use at least 8 characters for your password.");
  const { data, error } = input.signup
    ? await client.auth.signUp({
        ...parsed.data,
        options: { emailRedirectTo: input.callbackUrl },
      })
    : await client.auth.signInWithPassword(parsed.data);
  if (error) throw new Error(authMessage(error));
  if (!data.session) {
    if (input.signup) return "confirmation_required";
    throw new Error("Sign-in did not complete. Please try again.");
  }
  return "signed_in";
}

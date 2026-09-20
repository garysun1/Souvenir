import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient, type User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { getSupabaseConfig } from "@/lib/env";
import { ensureUserProfile } from "@/lib/auth/profile";
import { authError, validateRequestOrigin } from "@/lib/auth/http";
import { uuidSchema } from "@/lib/contracts/api";
import type { AuthContext, AuthResult } from "../../../shared/api-contract";

export type { AuthContext, AuthResult } from "../../../shared/api-contract";

export async function createSupabaseServerClient() {
  const { url, publishableKey } = getSupabaseConfig();
  const cookieStore = await cookies();
  return createServerClient(url, publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {}
      },
    },
  });
}

export async function getCurrentUserId(): Promise<string | null> {
  const client = await createSupabaseServerClient();
  const { data, error } = await client.auth.getUser();
  if (error && (!error.status || error.status >= 500)) {
    throw new Error("Sign-in is temporarily unavailable. Please try again.");
  }
  if (error || !validUser(data.user)) return null;
  const auth = contextFor(data.user, "cookie");
  await ensureUserProfile(auth, data.user.user_metadata.display_name);
  return auth.userId;
}

function validUser(user: User | null): user is User {
  return Boolean(user && uuidSchema.safeParse(user.id).success && !user.is_anonymous);
}

function contextFor(user: User, mode: AuthContext["mode"]): AuthContext {
  return { userId: user.id.toLowerCase(), email: user.email ?? null, mode };
}

export async function requireApiUser(request: Request): Promise<AuthResult> {
  try {
    const originError = validateRequestOrigin(request);
    if (originError) return { response: originError };
    const authorization = request.headers.get("authorization");
    let user: User | null;
    let mode: AuthContext["mode"];
    if (authorization !== null) {
      const match = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(
        authorization,
      );
      if (!match) {
        return { response: authError(401, "unauthorized", "Sign in again to continue.") };
      }
      const { url, publishableKey } = getSupabaseConfig();
      const client = createClient(url, publishableKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      const result = await client.auth.getUser(match[1]);
      if (result.error) {
        const unavailable = !result.error.status || result.error.status >= 500;
        return {
          response: authError(
            unavailable ? 503 : 401,
            unavailable ? "service_unavailable" : "unauthorized",
            unavailable
              ? "Sign-in is temporarily unavailable. Please retry."
              : "Your session expired. Sign in again.",
          ),
        };
      }
      user = result.data.user;
      mode = "bearer";
    } else {
      const client = await createSupabaseServerClient();
      const result = await client.auth.getUser();
      if (result.error) {
        const unavailable = !result.error.status || result.error.status >= 500;
        return {
          response: authError(
            unavailable ? 503 : 401,
            unavailable ? "service_unavailable" : "unauthorized",
            unavailable
              ? "Sign-in is temporarily unavailable. Please retry."
              : "Sign in again to continue.",
          ),
        };
      }
      user = result.data.user;
      mode = "cookie";
    }
    if (!validUser(user)) {
      return { response: authError(401, "unauthorized", "Sign in again to continue.") };
    }
    const auth = contextFor(user, mode);
    await ensureUserProfile(auth, user.user_metadata.display_name);
    return { auth };
  } catch {
    return {
      response: authError(
        503,
        "service_unavailable",
        "Your account is temporarily unavailable. Please retry.",
      ),
    };
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/auth/server";
import { safeRedirect } from "@/lib/auth/redirect";
import { env } from "@/lib/env";

const callbackSchema = z.object({ code: z.string().min(1).max(2048) });

export async function GET(request: Request) {
  const url = new URL(request.url);
  const destination = new URL("/login?error=confirmation", env.APP_ORIGIN);
  try {
    const input = callbackSchema.safeParse({ code: url.searchParams.get("code") });
    if (input.success && !url.searchParams.has("error")) {
      const client = await createSupabaseServerClient();
      const { error } = await client.auth.exchangeCodeForSession(input.data.code);
      if (!error) {
        return NextResponse.redirect(
          new URL(safeRedirect(url.searchParams.get("next")), env.APP_ORIGIN),
          {
            headers: { "Cache-Control": "private, no-store" },
          },
        );
      }
    }
  } catch {}
  return NextResponse.redirect(destination, { headers: { "Cache-Control": "private, no-store" } });
}

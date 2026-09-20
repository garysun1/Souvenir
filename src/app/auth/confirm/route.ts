import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/auth/server";
import { safeRedirect } from "@/lib/auth/redirect";
import { env } from "@/lib/env";

const confirmationSchema = z.object({
  token_hash: z.string().min(1).max(2048),
  type: z.enum(["email", "signup"]),
});

export async function GET(request: Request) {
  const url = new URL(request.url);
  try {
    const input = confirmationSchema.safeParse({
      token_hash: url.searchParams.get("token_hash"),
      type: url.searchParams.get("type"),
    });
    if (input.success) {
      const client = await createSupabaseServerClient();
      const { error } = await client.auth.verifyOtp(input.data);
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
  return NextResponse.redirect(new URL("/login?error=confirmation", env.APP_ORIGIN), {
    headers: { "Cache-Control": "private, no-store" },
  });
}

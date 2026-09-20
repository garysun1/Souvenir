import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireApiUser } from "@/lib/auth/server";
import { ensureUserProfile, serializeProfile } from "@/lib/auth/profile";
import { authError } from "@/lib/auth/http";
import { parseJsonBody } from "@/lib/api";
import { profilePatchSchema } from "@/lib/contracts/api";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getUserStats } from "@/lib/server/stats";

export async function GET(request: Request) {
  const result = await requireApiUser(request);
  if ("response" in result) return result.response;
  try {
    const profile = await ensureUserProfile(result.auth);
    return NextResponse.json(
      { data: { ...profile, stats: await getUserStats(result.auth.userId, result.auth.userId) } },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return authError(503, "service_unavailable", "Your profile could not be loaded. Please retry.");
  }
}

export async function PATCH(request: Request) {
  const result = await requireApiUser(request);
  if ("response" in result) return result.response;
  const body = await parseJsonBody(request, profilePatchSchema);
  if ("response" in body) {
    body.response.headers.set("Cache-Control", "private, no-store");
    return body.response;
  }
  try {
    const [profile] = await db
      .update(users)
      .set(body.data)
      .where(eq(users.id, result.auth.userId))
      .returning();
    if (!profile) return authError(404, "not_found", "Your profile is unavailable.");
    return NextResponse.json(
      { data: serializeProfile(profile) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch {
    return authError(503, "service_unavailable", "Your changes were not saved. Please retry.");
  }
}

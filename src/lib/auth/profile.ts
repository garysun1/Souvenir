import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { uuidSchema } from "@/lib/contracts/api";
import type { AuthContext, ProfileDto } from "../../../shared/api-contract";

export function serializeProfile(user: typeof users.$inferSelect): ProfileDto {
  return { ...user, createdAt: user.createdAt.toISOString() };
}

export function initialProfileName(value: unknown): string {
  if (typeof value !== "string") return "Explorer";
  return (
    value
      .replace(/[\p{Cc}\p{Cf}<>]/gu, "")
      .trim()
      .slice(0, 100) || "Explorer"
  );
}

export async function ensureUserProfile(
  auth: AuthContext,
  initialDisplayName?: unknown,
): Promise<ProfileDto> {
  const userId = uuidSchema.parse(auth.userId).toLowerCase();
  const handle = `user_${userId.replaceAll("-", "")}`;
  for (let attempt = 0; attempt < 5; attempt++) {
    await db
      .insert(users)
      .values({
        id: userId,
        handle: attempt ? `${handle}_${attempt}` : handle,
        displayName: initialProfileName(initialDisplayName),
      })
      .onConflictDoNothing();
    const [profile] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (profile) return serializeProfile(profile);
  }
  throw new Error("Your profile could not be created. Please try again.");
}

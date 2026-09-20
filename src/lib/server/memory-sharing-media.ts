import "server-only";
import { createClient } from "@supabase/supabase-js";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { editions, importItems } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { uuidSchema } from "@/lib/contracts/api";
import type { MemoryPhotoDto } from "../../../shared/memories-contract";
import { ApiError, notFound } from "./errors";
import { requireMoment } from "./memory-sharing-access";

const lifetime = 300;

export async function getMemoryPhoto(userId: string, momentId: string): Promise<MemoryPhotoDto> {
  const moment = await requireMoment(userId, momentId);
  const [source] = moment.sourceEditionId
    ? await db
        .select({ path: editions.photoPath, requestId: editions.requestId })
        .from(editions)
        .where(and(eq(editions.id, moment.sourceEditionId), eq(editions.userId, moment.authorId)))
    : await db
        .select({ path: importItems.photoPath, requestId: importItems.requestId })
        .from(importItems)
        .where(
          and(
            eq(importItems.id, moment.sourceImportItemId!),
            eq(importItems.ownerId, moment.authorId),
          ),
        );
  const expected = `${moment.authorId}/${source?.requestId}`;
  if (
    !source?.path ||
    !uuidSchema.safeParse(source.requestId).success ||
    !["jpg", "png", "webp"].some((extension) => source.path === `${expected}.${extension}`)
  ) {
    notFound();
  }
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SECRET_KEY ?? env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new ApiError(503, "service_unavailable", "Photo storage is unavailable. Please retry.");
  }
  await requireMoment(userId, momentId);
  const bucket = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }).storage.from("captures");
  const { data, error } = await bucket.createSignedUrl(source.path, lifetime);
  if (error || !data) {
    throw new ApiError(503, "service_unavailable", "Photo storage is unavailable. Please retry.");
  }
  return { url: data.signedUrl, expiresAt: new Date(Date.now() + lifetime * 1000).toISOString() };
}

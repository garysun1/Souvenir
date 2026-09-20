import "server-only";
import { createClient } from "@supabase/supabase-js";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { apiRequests, editions, importItems } from "@/lib/db/schema";
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
        .select({
          path: editions.photoPath,
          requestId: editions.requestId,
          importSourceId: editions.importSourceId,
        })
        .from(editions)
        .where(and(eq(editions.id, moment.sourceEditionId), eq(editions.userId, moment.authorId)))
    : await db
        .select({
          path: importItems.photoPath,
          requestId: importItems.requestId,
          importSourceId: sql<null>`null`,
        })
        .from(importItems)
        .where(
          and(
            eq(importItems.id, moment.sourceImportItemId!),
            eq(importItems.ownerId, moment.authorId),
          ),
        );
  let requestId = source?.requestId;
  if (source?.importSourceId?.startsWith("memory:")) {
    const itemId = source.importSourceId.slice("memory:".length);
    if (!uuidSchema.safeParse(itemId).success || !source.path) notFound();
    const [receipt] = await db
      .select({ requestId: apiRequests.requestId })
      .from(apiRequests)
      .where(
        and(
          eq(apiRequests.userId, moment.authorId),
          eq(apiRequests.operation, "import.item.create"),
          eq(apiRequests.resourceId, itemId),
          eq(apiRequests.resourcePath, source.path),
        ),
      );
    requestId = receipt?.requestId;
  }
  const expected = `${moment.authorId}/${requestId}`;
  if (
    !source?.path ||
    !uuidSchema.safeParse(requestId).success ||
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

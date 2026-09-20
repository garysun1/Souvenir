import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { editions, importItems } from "@/lib/db/schema";
import { deleteCapturePhoto } from "@/lib/auth/storage";
import type { AuthContext } from "../../../shared/api-contract";
import { lockUser } from "./transactions";

export async function cleanupMemoryPhotos(auth: AuthContext, paths: string[]) {
  if (!paths.length) return;
  await db.transaction(async (tx) => {
    await lockUser(tx, auth.userId);
    for (const path of new Set(paths)) {
      const [edition] = await tx
        .select({ id: editions.id })
        .from(editions)
        .where(eq(editions.photoPath, path))
        .limit(1);
      const [item] = await tx
        .select({ id: importItems.id })
        .from(importItems)
        .where(eq(importItems.photoPath, path))
        .limit(1);
      if (!edition && !item) await deleteCapturePhoto(auth, path);
    }
  });
}

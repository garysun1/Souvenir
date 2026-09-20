import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { apiRequests, users } from "@/lib/db/schema";
import { ApiError, notFound } from "./errors";

export type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type Database = typeof db | Transaction;
export type Created<T> = { data: T; created: boolean };

export async function lockUser(tx: Transaction, userId: string): Promise<void> {
  const [user] = await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .for("no key update");
  if (!user) notFound("Your profile is unavailable. Please sign in again.");
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function requestHash(input: unknown): string {
  return createHash("sha256").update(canonicalJson(input)).digest("hex");
}

export async function reserveRequest(
  tx: Transaction,
  userId: string,
  requestId: string,
  operation: string,
  input: unknown,
  importSourceId: string | null = null,
): Promise<typeof apiRequests.$inferSelect> {
  const hash = requestHash(input);
  await tx
    .insert(apiRequests)
    .values({ userId, requestId, operation, requestHash: hash, importSourceId })
    .onConflictDoNothing();
  const [request] = await tx
    .select()
    .from(apiRequests)
    .where(and(eq(apiRequests.userId, userId), eq(apiRequests.requestId, requestId)))
    .for("update");
  if (!request || request.operation !== operation || request.requestHash !== hash) {
    throw new ApiError(
      409,
      "idempotency_conflict",
      "This request was already used for another save.",
    );
  }
  return request;
}

export async function completeRequest(
  tx: Transaction,
  userId: string,
  requestId: string,
  resourceId: string,
  resourcePath: string | null = null,
): Promise<void> {
  await tx
    .update(apiRequests)
    .set({ resourceId, resourcePath })
    .where(and(eq(apiRequests.userId, userId), eq(apiRequests.requestId, requestId)));
}

export function deletedResource(): never {
  throw new ApiError(
    410,
    "resource_deleted",
    "This saved resource was deleted. Start a new draft.",
  );
}

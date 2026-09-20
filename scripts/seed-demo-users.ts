import { parseArgs } from "node:util";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { z } from "zod";
import { demoExplorers, demoId } from "../db/seed/demo-explorers";
import { editions, friendships, places, tasteProfiles, users } from "../src/lib/db/schema";
import { env } from "../src/lib/env";
import type { TasteFacet, TasteOverride } from "../shared/memories-contract";

const client = postgres(env.DATABASE_URL, { max: 2, prepare: false, idle_timeout: 1 });
const db = drizzle(client);

async function main() {
  const { values } = parseArgs({
    options: { apply: { type: "boolean", default: false }, "invite-user": { type: "string" } },
  });
  const inviteUser = values["invite-user"] ? z.string().uuid().parse(values["invite-user"]) : null;
  const slugs = [...new Set(demoExplorers.flatMap((person) => person.visits))];
  const catalog = await db
    .select()
    .from(places)
    .where(
      and(
        inArray(places.slug, slugs),
        eq(places.visibility, "public"),
        sql`${places.ownerId} IS NULL`,
      ),
    );
  const bySlug = new Map(catalog.map((place) => [place.slug, place]));
  const missing = slugs.filter((slug) => !bySlug.has(slug));
  if (missing.length) throw new Error(`Missing public catalog destinations: ${missing.join(", ")}`);
  if (inviteUser) {
    const [recipient] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, inviteUser));
    if (!recipient || demoExplorers.some((person) => demoId(person.handle) === inviteUser))
      throw new Error("The invitation recipient must be an existing non-demo user.");
  }
  const [schema] = await db.execute<{ available: boolean }>(
    sql`SELECT to_regclass('public.taste_profiles') IS NOT NULL AS available`,
  );
  const existing = await db
    .select({ id: users.id, handle: users.handle })
    .from(users)
    .where(
      or(
        inArray(
          users.id,
          demoExplorers.map((person) => demoId(person.handle)),
        ),
        inArray(
          users.handle,
          demoExplorers.map((person) => person.handle),
        ),
      ),
    );
  for (const row of existing) {
    if (
      !demoExplorers.some(
        (person) => person.handle === row.handle && demoId(person.handle) === row.id,
      )
    )
      throw new Error("A demo identifier collides with an existing profile; nothing was written.");
  }
  console.log(
    JSON.stringify({
      mode: values.apply ? "apply" : "dry-run",
      profiles: demoExplorers.length,
      existing: existing.length,
      editions: demoExplorers.reduce((sum, person) => sum + person.visits.length, 0),
      tasteProfiles: schema.available
        ? "available"
        : "skipped: apply the reviewed contracts migration first",
      invitations: inviteUser ? "pending only; existing relationships preserved" : "none",
    }),
  );
  if (!values.apply) return;

  const concurrency = 2;
  for (let offset = 0; offset < demoExplorers.length; offset += concurrency) {
    const batch = await Promise.allSettled(
      demoExplorers.slice(offset, offset + concurrency).map(async (person) => {
        const userId = demoId(person.handle);
        await db.transaction(async (tx) => {
          await tx.execute(
            sql`SELECT pg_advisory_xact_lock(hashtextextended(${`demo:${userId}`}, 0))`,
          );
          await tx
            .insert(users)
            .values({
              id: userId,
              handle: person.handle,
              displayName: `${person.name} · Demo`,
              homeCity: person.city,
              homeCountry: "US",
              statsVisibility: "friends",
            })
            .onConflictDoNothing();
          await tx
            .insert(editions)
            .values(
              person.visits.map((slug, index) => ({
                id: demoId(`${person.handle}:edition:${slug}`),
                userId,
                placeId: bySlug.get(slug)!.id,
                requestId: demoId(`${person.handle}:request:${slug}`),
                visitSequence: 1,
                timezone: "America/Los_Angeles",
                origin: "demo_seed",
                capturedAt: new Date(Date.UTC(2026, 8, 1 + index * 2, 19)),
                note: `Fictional demo memory: ${person.title}. Stop ${index + 1}: ${bySlug.get(slug)!.name}.`,
                visibility: "friends" as const,
              })),
            )
            .onConflictDoNothing();
          if (schema.available) {
            const facets: TasteFacet[] = person.interests.map((interest, index) => ({
              interest,
              intent: "enjoyed",
              strength: index === 0 ? 3 : 2,
            }));
            const overrides: TasteOverride[] = facets.map((facet) => ({
              ...facet,
              action: "prefer",
            }));
            await tx
              .insert(tasteProfiles)
              .values({
                userId,
                titleOverride: `${person.title} · Demo`,
                overrides,
                sharing: "friends",
                published: {
                  title: `${person.title} · Demo`,
                  facets,
                  collageMomentIds: [],
                  publishedAt: new Date().toISOString(),
                },
              })
              .onConflictDoNothing();
          }
          if (inviteUser) {
            const [a, b] = [userId, inviteUser].sort();
            await tx.execute(
              sql`SELECT pg_advisory_xact_lock(hashtextextended(${`friend:${a}:${b}`}, 0))`,
            );
            const [relationship] = await tx
              .select()
              .from(friendships)
              .where(
                or(
                  and(eq(friendships.userId, userId), eq(friendships.friendId, inviteUser)),
                  and(eq(friendships.userId, inviteUser), eq(friendships.friendId, userId)),
                ),
              );
            if (!relationship)
              await tx
                .insert(friendships)
                .values({ userId, friendId: inviteUser, status: "pending" });
          }
        });
        console.log(`Ready: @${person.handle} /users/${userId}`);
      }),
    );
    const failed = batch.filter((result) => result.status === "rejected");
    if (failed.length)
      throw new Error(
        `${failed.length} demo transactions failed. Completed profiles are safe to rerun. ${failed
          .map((result) =>
            result.reason instanceof Error ? result.reason.message : "Unknown database error",
          )
          .join("; ")}`,
      );
  }
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Demo seed failed.");
    process.exitCode = 1;
  })
  .finally(() => client.end());

import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { env } from "@/lib/env";
import * as schema from "./schema";

const dbGlobal = globalThis as typeof globalThis & {
  souvenirSql?: ReturnType<typeof postgres>;
};
const client = (dbGlobal.souvenirSql ??= postgres(env.DATABASE_URL, {
  max: 5,
  idle_timeout: 20,
}));
export const db = drizzle(client, { schema });
export const closeDb = async () => {
  await client.end();
  if (dbGlobal.souvenirSql === client) delete dbGlobal.souvenirSql;
};

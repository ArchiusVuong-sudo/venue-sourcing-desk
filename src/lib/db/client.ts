import { mkdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import * as schema from "./schema";
import { seedIfEmpty } from "./seed";

export type Db = PgliteDatabase<typeof schema>;

interface DbHandle {
  db: Db;
  client: PGlite;
}

const globalForDb = globalThis as unknown as { __venueDesk?: Promise<DbHandle> };

const migrationsFolder = (): string => path.join(process.cwd(), "drizzle");

/** Opens a database, applies migrations and seeds the synthetic catalog once. */
export async function openDb(dataDir: string): Promise<DbHandle> {
  const inMemory = dataDir === "memory://";
  if (!inMemory) mkdirSync(dataDir, { recursive: true });
  const client = inMemory ? new PGlite() : new PGlite(dataDir);
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: migrationsFolder() });
  await seedIfEmpty(db);
  return { db, client };
}

/** One PGlite instance per process: a second one would lock the data dir. */
export function getDb(): Promise<Db> {
  globalForDb.__venueDesk ??= openDb(process.env.DATA_DIR || path.join(process.cwd(), ".data", "pglite"));
  return globalForDb.__venueDesk.then((h) => h.db);
}

/** Tests only: swap in a fresh in-memory database. */
export async function resetDbForTests(): Promise<Db> {
  const old = globalForDb.__venueDesk;
  globalForDb.__venueDesk = openDb("memory://");
  if (old) await old.then((h) => h.client.close()).catch(() => undefined);
  return globalForDb.__venueDesk.then((h) => h.db);
}

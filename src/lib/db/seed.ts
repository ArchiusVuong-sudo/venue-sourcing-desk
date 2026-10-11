import { count } from "drizzle-orm";
import type { PgliteDatabase } from "drizzle-orm/pglite";
import { DEFAULT_POLICY, VENUES } from "../domain/catalog";
import { SEED_CASES } from "../evals/seed-cases";
import * as schema from "./schema";

/** Seeds the synthetic catalog, the Demo Co. policy and the 6 eval cases. No runs or results are seeded. */
export async function seedIfEmpty(db: PgliteDatabase<typeof schema>): Promise<void> {
  const [row] = await db.select({ n: count() }).from(schema.vendors);
  if ((row?.n ?? 0) > 0) return;
  await db.transaction(async (tx) => {
    await tx.insert(schema.vendors).values(VENUES);
    await tx.insert(schema.policies).values({ id: "default", data: DEFAULT_POLICY });
    await tx.insert(schema.evalCases).values(
      SEED_CASES.map((c) => ({ id: c.id, title: c.title, brief: c.brief, checks: c.checks, origin: "seed" as const })),
    );
  });
}

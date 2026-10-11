import { desc, eq, sql } from "drizzle-orm";
import { Policy, Venue } from "../domain/types";
import type { Db } from "./client";
import * as s from "./schema";

export async function loadPolicy(db: Db): Promise<Policy> {
  const [row] = await db.select().from(s.policies).where(eq(s.policies.id, "default"));
  if (!row) throw new Error("Policy row missing: the database was not seeded");
  return Policy.parse(row.data);
}

export async function savePolicy(db: Db, policy: Policy): Promise<Policy> {
  const valid = Policy.parse(policy);
  await db.update(s.policies).set({ data: valid, updatedAt: new Date() }).where(eq(s.policies.id, "default"));
  return valid;
}

export async function loadCatalog(db: Db): Promise<Venue[]> {
  const rows = await db.select().from(s.vendors).orderBy(s.vendors.id);
  return rows.map((r) => Venue.parse(r));
}

export interface VenueSearch {
  query: string;
  regions?: string[];
  minCapacity: number;
  minBedrooms?: number;
  minBreakoutRooms?: number;
  stepFreeOnly?: boolean;
  coastalOnly?: boolean;
  travelModes?: string[];
  limit?: number;
}

/** Hard filters in SQL, then Postgres full-text ranking over name, place and description. */
export async function searchVenues(db: Db, q: VenueSearch): Promise<Array<Venue & { rank: number }>> {
  const words = q.query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2)
    .slice(0, 12);
  const tsQuery = words.length ? words.join(" | ") : "";
  const doc = sql`to_tsvector('english', ${s.vendors.name} || ' ' || ${s.vendors.region} || ' ' || ${s.vendors.city} || ' ' || ${s.vendors.description})`;
  const rank = tsQuery ? sql<number>`ts_rank(${doc}, to_tsquery('english', ${tsQuery}))` : sql<number>`0::real`;

  const filters = [sql`${s.vendors.capacity} >= ${q.minCapacity}`];
  if (q.minBedrooms) filters.push(sql`${s.vendors.bedrooms} >= ${q.minBedrooms}`);
  if (q.minBreakoutRooms) filters.push(sql`${s.vendors.breakoutRooms} >= ${q.minBreakoutRooms}`);
  if (q.stepFreeOnly) filters.push(sql`${s.vendors.stepFree} = true`);
  if (q.coastalOnly) filters.push(sql`${s.vendors.coastal} = true`);
  if (q.travelModes?.length) {
    filters.push(sql`${s.vendors.travelMode} in (${sql.join(q.travelModes.map((m) => sql`${m}`), sql`, `)})`);
  }
  if (q.regions?.length) {
    const ors = q.regions.map((r) => {
      const like = `%${r.toLowerCase()}%`;
      return sql`(lower(${s.vendors.region}) like ${like} or lower(${s.vendors.city}) like ${like})`;
    });
    filters.push(sql`(${sql.join(ors, sql` or `)})`);
  }

  const rows = await db
    .select({ vendor: s.vendors, rank })
    .from(s.vendors)
    .where(sql.join(filters, sql` and `))
    .orderBy(desc(rank), s.vendors.id)
    .limit(q.limit ?? 8);
  return rows.map((r) => ({ ...Venue.parse(r.vendor), rank: Math.round(Number(r.rank) * 1000) / 1000 }));
}

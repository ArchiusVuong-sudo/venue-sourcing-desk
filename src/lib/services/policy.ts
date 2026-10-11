import { getDb } from "../db/client";
import { loadPolicy, savePolicy } from "../db/repo";
import { PolicyPatch, type Policy } from "../domain/types";

export async function getPolicy(): Promise<Policy> {
  return loadPolicy(await getDb());
}

/** Applies the fields an expert may change; everything else stays as configured. */
export async function updatePolicy(raw: unknown): Promise<Policy> {
  const patch = PolicyPatch.strict().parse(raw);
  const db = await getDb();
  const current = await loadPolicy(db);
  return savePolicy(db, { ...current, ...patch });
}

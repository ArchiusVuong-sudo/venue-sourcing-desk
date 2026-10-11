import { randomUUID } from "node:crypto";
import { desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db/client";
import { decisions, requests, runs, type DecisionRow, type RequestRow } from "../db/schema";
import { startRun } from "../runs/runner";
import { visibleOffers } from "../runs/guard";
import { toRunView, type RunView } from "./views";

export const NewRequest = z.object({
  brief: z.string().trim().min(15, "Describe the event in a sentence or two").max(2_000),
});

export class NotFoundError extends Error {}
export class ConflictError extends Error {}

const titleFrom = (brief: string): string => {
  const first = brief.trim().split(/(?<=[.!?])\s/)[0] ?? brief;
  return first.length > 72 ? `${first.slice(0, 69).trimEnd()}...` : first.replace(/[.!?]$/, "");
};

export async function createRequest(input: unknown): Promise<{ requestId: string; runId: string }> {
  const { brief } = NewRequest.parse(input);
  const db = await getDb();
  const requestId = `req_${randomUUID().slice(0, 8)}`;
  await db.insert(requests).values({ id: requestId, title: titleFrom(brief), brief, status: "running" });
  const { runId } = await startRun({
    kind: "request",
    brief,
    requestId,
    onFinished: async (row) => {
      const status =
        row.status === "failed"
          ? "failed"
          : row.answer?.outcome === "needs_info"
            ? "needs_info"
            : visibleOffers(row.guarded).length > 0
              ? "awaiting_review"
              : "failed";
      await db.update(requests).set({ status }).where(eq(requests.id, requestId));
    },
  });
  await db.update(requests).set({ latestRunId: runId }).where(eq(requests.id, requestId));
  return { requestId, runId };
}

export interface RequestSummary extends Pick<RequestRow, "id" | "title" | "brief" | "status" | "latestRunId"> {
  createdAt: string;
  offerCount: number;
}

export async function listRequests(): Promise<RequestSummary[]> {
  const db = await getDb();
  const rows = await db.select().from(requests).orderBy(desc(requests.createdAt)).limit(30);
  const runIds = rows.map((r) => r.latestRunId).filter((id): id is string => Boolean(id));
  const runRows = runIds.length ? await db.select().from(runs).where(inArray(runs.id, runIds)) : [];
  const offersByRun = new Map(runRows.map((r) => [r.id, visibleOffers(r.guarded).length]));
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    brief: r.brief,
    status: r.status,
    latestRunId: r.latestRunId,
    createdAt: r.createdAt.toISOString(),
    offerCount: r.latestRunId ? offersByRun.get(r.latestRunId) ?? 0 : 0,
  }));
}

export interface RequestDetail {
  request: RequestSummary;
  run: RunView | null;
  decisions: Array<Omit<DecisionRow, "createdAt"> & { createdAt: string }>;
}

export async function getRequest(id: string): Promise<RequestDetail> {
  const db = await getDb();
  const [row] = await db.select().from(requests).where(eq(requests.id, id));
  if (!row) throw new NotFoundError(`Request ${id} not found`);
  const [run] = row.latestRunId ? await db.select().from(runs).where(eq(runs.id, row.latestRunId)) : [];
  const decided = run ? await db.select().from(decisions).where(eq(decisions.runId, run.id)) : [];
  return {
    request: {
      id: row.id,
      title: row.title,
      brief: row.brief,
      status: row.status,
      latestRunId: row.latestRunId,
      createdAt: row.createdAt.toISOString(),
      offerCount: run ? visibleOffers(run.guarded).length : 0,
    },
    run: run ? toRunView(run) : null,
    decisions: decided.map((d) => ({ ...d, createdAt: d.createdAt.toISOString() })),
  };
}

export async function getRun(id: string): Promise<RunView> {
  const db = await getDb();
  const [row] = await db.select().from(runs).where(eq(runs.id, id));
  if (!row) throw new NotFoundError(`Run ${id} not found`);
  return toRunView(row);
}

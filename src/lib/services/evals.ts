import { randomUUID } from "node:crypto";
import { desc, eq, inArray } from "drizzle-orm";
import { getDb } from "../db/client";
import { loadCatalog, loadPolicy } from "../db/repo";
import { evalCases, evalResults, evalSuiteRuns, runs, type EvalCaseRow, type RunRow } from "../db/schema";
import { checkLabel, runChecks, type CheckResult, type CheckSpec } from "../evals/checks";
import { startRun } from "../runs/runner";
import { SEED_CASES } from "../evals/seed-cases";
import { resolveMode } from "../agent/provider";

export const SUITE_CONCURRENCY = 3;

export const median = (values: number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = values.toSorted((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
};

/** Runs `worker` over `items` with at most `limit` in flight. */
export async function runPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items];
  const lanes = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    for (let item = queue.shift(); item !== undefined; item = queue.shift()) await worker(item);
  });
  await Promise.all(lanes);
}

const recordOf = (row: RunRow) => ({ status: row.status, error: row.error, answer: row.answer ?? null, trace: row.trace, policy: row.policy });

const g = globalThis as unknown as { __venueDeskSuite?: Promise<void> | null };

export async function startSuite(): Promise<{ suiteRunId: string; alreadyRunning: boolean }> {
  const db = await getDb();
  const [running] = await db.select().from(evalSuiteRuns).where(eq(evalSuiteRuns.status, "running"));
  if (running && g.__venueDeskSuite) return { suiteRunId: running.id, alreadyRunning: true };
  if (running) {
    // Left over from a stopped server: close it so the history stays honest.
    await db.update(evalSuiteRuns).set({ status: "done", finishedAt: new Date() }).where(eq(evalSuiteRuns.id, running.id));
    await db.update(evalResults).set({ status: "error", error: "Server stopped during the suite" }).where(inArray(evalResults.status, ["queued", "running"]));
  }

  const cases = orderCases(await db.select().from(evalCases));
  const policy = await loadPolicy(db);
  const suiteRunId = `suite_${randomUUID().slice(0, 8)}`;
  await db.insert(evalSuiteRuns).values({ id: suiteRunId, status: "running", mode: resolveMode().mode, policy, caseCount: cases.length });
  const resultIds = new Map(cases.map((c) => [c.id, `res_${randomUUID().slice(0, 8)}`]));
  if (cases.length) {
    await db.insert(evalResults).values(cases.map((c) => ({ id: resultIds.get(c.id)!, suiteRunId, caseId: c.id, status: "queued" as const, checks: [] })));
  }
  const catalog = await loadCatalog(db);

  const work = (async () => {
    await runPool(cases, SUITE_CONCURRENCY, async (evalCase) => {
      const resultId = resultIds.get(evalCase.id)!;
      try {
        const { runId, done } = await startRun({ kind: "eval", brief: evalCase.brief, evalCaseId: evalCase.id, suiteRunId });
        await db.update(evalResults).set({ status: "running", runId }).where(eq(evalResults.id, resultId));
        const row = await done;
        const checks = runChecks(evalCase.checks, recordOf(row), catalog);
        const passed = checks.every((c) => c.passed);
        await db.update(evalResults).set({ status: passed ? "passed" : "failed", checks, error: row.error }).where(eq(evalResults.id, resultId));
      } catch (err) {
        await db.update(evalResults).set({ status: "error", error: err instanceof Error ? err.message : String(err) }).where(eq(evalResults.id, resultId));
      }
    });
    const results = await db.select().from(evalResults).where(eq(evalResults.suiteRunId, suiteRunId));
    const runRows = await db.select().from(runs).where(eq(runs.suiteRunId, suiteRunId));
    await db
      .update(evalSuiteRuns)
      .set({
        status: "done",
        finishedAt: new Date(),
        passedCount: results.filter((r) => r.status === "passed").length,
        p50LatencyMs: median(runRows.filter((r) => r.durationMs !== null).map((r) => r.durationMs!)),
        costUsd: runRows.reduce((sum, r) => sum + (r.costUsd ?? 0), 0),
      })
      .where(eq(evalSuiteRuns.id, suiteRunId));
  })();
  g.__venueDeskSuite = work.finally(() => {
    g.__venueDeskSuite = null;
  });
  return { suiteRunId, alreadyRunning: false };
}

/** Test helper: wait for the suite in flight. */
export const waitForSuite = async (): Promise<void> => {
  await g.__venueDeskSuite;
};

/** Expert-made cases first (newest on top), then the seeded cases in their written order. */
const seedIndex = (id: string) => SEED_CASES.findIndex((c) => c.id === id);

export function orderCases(cases: EvalCaseRow[]): EvalCaseRow[] {
  return cases.toSorted((a, b) => {
    if (a.origin !== b.origin) return a.origin === "expert" ? -1 : 1;
    if (a.origin === "expert") return b.createdAt.getTime() - a.createdAt.getTime() || a.id.localeCompare(b.id);
    return seedIndex(a.id) - seedIndex(b.id);
  });
}

export interface SuiteSummary {
  id: string;
  status: "running" | "done";
  mode: "live" | "replay";
  caseCount: number;
  passedCount: number;
  finishedCount: number;
  passRate: number | null;
  p50LatencyMs: number | null;
  costUsd: number | null;
  startedAt: string;
  noFlightsRule: boolean;
}

export interface CaseView {
  id: string;
  title: string;
  brief: string;
  origin: "seed" | "expert";
  note: string | null;
  checks: Array<{ kind: CheckSpec["kind"]; label: string }>;
  sourceRunId: string | null;
  /** For expert cases: the checks computed over the stored run the expert rejected. */
  sourceResult: CheckResult[] | null;
  latest: { status: string; runId: string | null; checks: CheckResult[]; error: string | null; durationMs: number | null; costUsd: number | null } | null;
  previous: { status: string } | null;
}

export async function getEvalsView(): Promise<{ cases: CaseView[]; suites: SuiteSummary[] }> {
  const db = await getDb();
  const cases = orderCases(await db.select().from(evalCases));
  const suites = await db.select().from(evalSuiteRuns).orderBy(desc(evalSuiteRuns.startedAt)).limit(3);
  const suiteIds = suites.map((s) => s.id);
  const results = suiteIds.length ? await db.select().from(evalResults).where(inArray(evalResults.suiteRunId, suiteIds)) : [];
  const resultRunIds = results.map((r) => r.runId).filter((id): id is string => Boolean(id));
  const sourceIds = cases.map((c) => c.sourceRunId).filter((id): id is string => Boolean(id));
  const allRunIds = [...new Set([...resultRunIds, ...sourceIds])];
  const runRows = allRunIds.length ? await db.select().from(runs).where(inArray(runs.id, allRunIds)) : [];
  const runById = new Map(runRows.map((r) => [r.id, r]));
  const catalog = await loadCatalog(db);

  const [latestSuite, previousSuite] = suites;
  const resultFor = (suiteId: string | undefined, caseId: string) =>
    suiteId ? results.find((r) => r.suiteRunId === suiteId && r.caseId === caseId) : undefined;

  const caseViews = cases.map((c: EvalCaseRow): CaseView => {
    const source = c.sourceRunId ? runById.get(c.sourceRunId) : undefined;
    const latest = resultFor(latestSuite?.id, c.id);
    const latestRun = latest?.runId ? runById.get(latest.runId) : undefined;
    const previous = resultFor(previousSuite?.id, c.id);
    return {
      id: c.id,
      title: c.title,
      brief: c.brief,
      origin: c.origin,
      note: c.note,
      checks: c.checks.map((spec) => ({ kind: spec.kind, label: checkLabel(spec) })),
      sourceRunId: c.sourceRunId,
      sourceResult: source ? runChecks(c.checks, recordOf(source), catalog) : null,
      latest: latest
        ? { status: latest.status, runId: latest.runId, checks: latest.checks, error: latest.error, durationMs: latestRun?.durationMs ?? null, costUsd: latestRun?.costUsd ?? null }
        : null,
      previous: previous ? { status: previous.status } : null,
    };
  });

  const summaries = suites.map((s): SuiteSummary => {
    const rs = results.filter((r) => r.suiteRunId === s.id);
    const finished = rs.filter((r) => r.status === "passed" || r.status === "failed" || r.status === "error").length;
    const passed = rs.filter((r) => r.status === "passed").length;
    return {
      id: s.id,
      status: s.status,
      mode: s.mode,
      caseCount: s.caseCount,
      passedCount: passed,
      finishedCount: finished,
      passRate: s.status === "done" && s.caseCount ? passed / s.caseCount : null,
      p50LatencyMs: s.p50LatencyMs,
      costUsd: s.costUsd,
      startedAt: s.startedAt.toISOString(),
      noFlightsRule: s.policy.noFlightsShortEvents,
    };
  });
  return { cases: caseViews, suites: summaries };
}

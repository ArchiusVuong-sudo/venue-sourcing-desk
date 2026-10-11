import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { makeToolContext } from "../agent/context";
import { LiveProvider } from "../agent/live";
import { ProviderError, disableLive, resolveMode, type AgentProvider } from "../agent/provider";
import { ReplayProvider, saveFixture } from "../agent/replay";
import { getDb } from "../db/client";
import { loadCatalog, loadPolicy } from "../db/repo";
import { runs, type RunRow } from "../db/schema";
import { AgentAnswer, type TraceStep } from "../domain/types";
import { guardAnswer, visibleOffers } from "./guard";

// ---------- live run registry (SSE subscribers) ----------

type RunListener = (event: { steps: TraceStep[]; finished: boolean }) => void;
interface LiveRun {
  steps: TraceStep[];
  finished: boolean;
  listeners: Set<RunListener>;
}
const g = globalThis as unknown as { __venueDeskRuns?: Map<string, LiveRun>; __venueDeskProvider?: AgentProvider | null };
const registry = (g.__venueDeskRuns ??= new Map());

export function subscribeRun(runId: string, listener: RunListener): (() => void) | null {
  const live = registry.get(runId);
  if (!live) return null;
  live.listeners.add(listener);
  listener({ steps: live.steps, finished: live.finished });
  return () => live.listeners.delete(listener);
}

const publish = (runId: string) => {
  const live = registry.get(runId);
  if (!live) return;
  for (const l of live.listeners) l({ steps: live.steps, finished: live.finished });
};

// ---------- provider choice ----------

/** Tests can pin a provider; otherwise live when a login exists, replay when not. */
export const setProviderOverride = (provider: AgentProvider | null): void => {
  g.__venueDeskProvider = provider;
};

export function currentProvider(): AgentProvider {
  if (g.__venueDeskProvider) return g.__venueDeskProvider;
  return resolveMode().mode === "live" ? new LiveProvider() : new ReplayProvider();
}

// ---------- run ----------

export interface StartRunInput {
  kind: "request" | "eval";
  brief: string;
  requestId?: string;
  evalCaseId?: string;
  suiteRunId?: string;
  onFinished?: (row: RunRow) => Promise<void>;
}

/** Creates the run row and starts the agent in the background. `done` resolves with the final row. */
export async function startRun(input: StartRunInput): Promise<{ runId: string; done: Promise<RunRow> }> {
  const db = await getDb();
  const [policy, catalog] = await Promise.all([loadPolicy(db), loadCatalog(db)]);
  const provider = currentProvider();
  const runId = `run_${randomUUID().slice(0, 8)}`;
  await db.insert(runs).values({
    id: runId,
    kind: input.kind,
    requestId: input.requestId ?? null,
    evalCaseId: input.evalCaseId ?? null,
    suiteRunId: input.suiteRunId ?? null,
    status: "running",
    mode: provider.mode,
    model: provider.model,
    brief: input.brief,
    policy,
    trace: [],
  });

  const ctx = makeToolContext(db, policy, catalog, { delayScale: process.env.REPLAY_SPEED === "0" ? 0 : 1 });
  const live: LiveRun = { steps: ctx.trace.steps, finished: false, listeners: new Set() };
  registry.set(runId, live);

  let persistTimer: NodeJS.Timeout | null = null;
  const persistTrace = async () => {
    persistTimer = null;
    await db.update(runs).set({ trace: ctx.trace.steps }).where(eq(runs.id, runId));
  };
  ctx.trace.onChange(() => {
    publish(runId);
    persistTimer ??= setTimeout(() => void persistTrace().catch(() => undefined), 400);
  });

  const done = (async (): Promise<RunRow> => {
    const started = Date.now();
    let patch: Partial<RunRow>;
    try {
      const result = await provider.run({ brief: input.brief, ctx });
      const parsed = AgentAnswer.safeParse(result.answer);
      if (!parsed.success) {
        const issues = parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
        throw new ProviderError(`Structured output failed the shortlist schema: ${issues}`, false, "schema");
      }
      const guarded = guardAnswer(parsed.data, ctx.quotes, catalog, policy);
      const shown = visibleOffers(guarded).length;
      for (const item of guarded) {
        if (item.issues.length) {
          ctx.trace.push({ kind: "guard", at: ctx.trace.now(), ok: false, message: `Removed ${item.venue?.name ?? item.offer.venueId}: ${item.issues.join("; ")}` });
        }
      }
      ctx.trace.push({
        kind: "guard",
        at: ctx.trace.now(),
        ok: true,
        message: parsed.data.outcome === "needs_info"
          ? "Schema valid: the agent asked a question"
          : `Schema valid; ${shown} of ${guarded.length} offers passed the grounding and policy guard`,
      });
      if (provider.mode === "live" && process.env.RECORD_FIXTURES === "1") saveFixture(input.brief, policy, result);
      patch = {
        status: "done",
        answer: parsed.data,
        guarded,
        model: result.model,
        durationMs: provider.mode === "live" ? Date.now() - started : result.durationMs,
        turns: ctx.trace.steps.filter((s) => s.kind === "model").length,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costUsd: result.costUsd,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (err instanceof ProviderError && err.code === "auth") disableLive("The Claude login failed, so this session switched to replay");
      ctx.trace.push({ kind: "guard", at: ctx.trace.now(), ok: false, message: `Run failed: ${message}` });
      patch = { status: "failed", error: message, durationMs: Date.now() - started, turns: ctx.trace.steps.filter((s) => s.kind === "model").length };
    }
    if (persistTimer) clearTimeout(persistTimer);
    const [row] = await db.update(runs).set({ ...patch, trace: ctx.trace.steps }).where(eq(runs.id, runId)).returning();
    live.finished = true;
    publish(runId);
    setTimeout(() => registry.delete(runId), 60_000).unref?.();
    if (!row) throw new Error(`Run ${runId} disappeared`);
    if (input.onFinished) await input.onFinished(row);
    return row;
  })();
  done.catch((err) => console.error(`run ${runId} bookkeeping failed`, err));
  return { runId, done };
}

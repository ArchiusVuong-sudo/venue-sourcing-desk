import type { RunRow } from "../db/schema";
import type { AgentAnswer, GuardedOffer, TraceStep } from "../domain/types";
import { visibleOffers } from "../runs/guard";

export interface RunView {
  id: string;
  kind: "request" | "eval";
  status: "running" | "done" | "failed";
  mode: "live" | "replay";
  model: string;
  brief: string;
  requestId: string | null;
  evalCaseId: string | null;
  error: string | null;
  answer: AgentAnswer | null;
  offers: GuardedOffer[];
  dropped: GuardedOffer[];
  trace: TraceStep[];
  startedAt: string;
  metrics: {
    durationMs: number | null;
    turns: number | null;
    inputTokens: number | null;
    outputTokens: number | null;
    costUsd: number | null;
  };
}

export function toRunView(row: RunRow): RunView {
  const offers = visibleOffers(row.guarded);
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    mode: row.mode,
    model: row.model,
    brief: row.brief,
    requestId: row.requestId,
    evalCaseId: row.evalCaseId,
    error: row.error,
    answer: row.answer ?? null,
    offers,
    dropped: (row.guarded ?? []).filter((g) => g.issues.length > 0),
    trace: row.trace,
    startedAt: row.startedAt.toISOString(),
    metrics: {
      durationMs: row.durationMs,
      turns: row.turns,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      costUsd: row.costUsd,
    },
  };
}

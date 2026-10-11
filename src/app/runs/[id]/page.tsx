"use client";

import Link from "next/link";
import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, useRunStream } from "@/lib/client/api";
import { duration, tokens, usd } from "@/lib/client/format";
import type { RunView } from "@/lib/services/views";
import { JsonBlock, TraceTimeline } from "@/components/steps";
import { Badge, ErrorState, LoadingBlock, Stat } from "@/components/ui";

export default function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const run = useQuery({
    queryKey: ["run", id],
    queryFn: () => api<RunView>(`/api/runs/${id}`),
    refetchInterval: (q) => (q.state.data?.status === "running" ? 1_500 : false),
  });
  const stream = useRunStream(id, run.data?.status === "running");

  if (run.isPending) return <LoadingBlock label="Loading trace" />;
  if (run.error) return <ErrorState message={run.error.message} />;
  const r = run.data;
  const steps = (r.status === "running" && stream.steps) || r.trace;
  const toolCalls = steps.filter((s) => s.kind === "tool").length;
  const recorded = r.mode === "replay";

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-6">
        <div className="min-w-0">
          <div className="text-[13px] text-ink-500">
            {r.requestId ? <Link href={`/requests/${r.requestId}`} className="hover:text-ink-900">Request</Link> : <Link href="/evals" className="hover:text-ink-900">Evals</Link>} / Trace
          </div>
          <h1 className="mt-1 flex items-center gap-2 text-[22px] font-semibold tracking-tight text-ink-950">
            Run trace <span className="font-mono text-[14px] font-normal text-ink-400">{r.id}</span>
          </h1>
          <p className="mt-2 max-w-3xl text-[14px] leading-relaxed text-ink-700">{r.brief}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge tone={r.status === "done" ? "green" : r.status === "failed" ? "red" : "blue"}>{r.status === "done" ? "Done" : r.status === "failed" ? "Failed" : "Running"}</Badge>
          <Badge tone={recorded ? "amber" : "green"}>{recorded ? "Replay of a recorded live run" : "Live"}</Badge>
          <Badge>{r.model}</Badge>
          <Badge>{r.kind === "eval" ? "Eval run" : "Planner request"}</Badge>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-5 gap-4">
        <Stat label="Duration" value={duration(r.metrics.durationMs)} hint={recorded ? "Recorded live run" : "Wall clock"} />
        <Stat label="Model turns" value={r.metrics.turns ?? steps.filter((s) => s.kind === "model").length} hint={`${toolCalls} tool calls`} />
        <Stat label="Input tokens" value={tokens(r.metrics.inputTokens)} hint="Incl. cached prompt" />
        <Stat label="Output tokens" value={tokens(r.metrics.outputTokens)} />
        <Stat label="Est. cost" value={usd(r.metrics.costUsd, 4)} hint="SDK estimate, not a bill" />
      </div>

      {r.error ? <div className="mb-4"><ErrorState message={r.error} /></div> : null}

      <div className="grid grid-cols-[minmax(0,1fr)_380px] gap-6">
        <section className="card px-4 py-2">
          <div className="flex items-center justify-between border-b border-ink-100 py-2">
            <h2 className="text-[13px] font-semibold text-ink-900">Timeline</h2>
            <span className="text-[12px] text-ink-500">Click a tool call for its input and output</span>
          </div>
          <TraceTimeline steps={steps} />
        </section>
        <aside className="space-y-4">
          <div className="card px-4 py-3">
            <h2 className="mb-2 text-[13px] font-semibold text-ink-900">Structured output</h2>
            {r.answer ? <JsonBlock value={r.answer} /> : <p className="text-sm text-ink-500">{r.status === "running" ? "Waiting for the agent" : "No valid output"}</p>}
          </div>
          {r.dropped.length ? (
            <div className="card px-4 py-3">
              <h2 className="mb-1 text-[13px] font-semibold text-rose-800">Removed by the guard</h2>
              <ul className="space-y-1 text-[12.5px] text-rose-900">{r.dropped.map((g) => <li key={g.offer.venueId}>{g.venue?.name ?? g.offer.venueId}: {g.issues.join("; ")}</li>)}</ul>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

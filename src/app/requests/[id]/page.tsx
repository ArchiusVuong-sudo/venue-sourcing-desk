"use client";

import Link from "next/link";
import { use } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, useRunStream } from "@/lib/client/api";
import { duration, usd } from "@/lib/client/format";
import type { RequestDetail } from "@/lib/services/requests";
import { IconArrow } from "@/components/icons";
import { OfferCard } from "@/components/offer-card";
import { RequestStatus } from "@/components/status-pill";
import { StepFeed } from "@/components/steps";
import { Badge, EmptyState, ErrorState, LoadingBlock } from "@/components/ui";

export default function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const detail = useQuery({
    queryKey: ["request", id],
    queryFn: () => api<RequestDetail>(`/api/requests/${id}`),
    refetchInterval: (q) => (q.state.data?.run?.status === "running" ? 1_500 : false),
  });
  const run = detail.data?.run ?? null;
  const running = run?.status === "running";
  const stream = useRunStream(run?.id, running);
  const steps = (running && stream.steps) || run?.trace || [];

  if (detail.isPending) return <LoadingBlock label="Loading request" />;
  if (detail.error) return <ErrorState message={detail.error.message} retry={() => void detail.refetch()} />;
  const { request, decisions } = detail.data;
  const answer = run?.answer ?? null;
  const decisionFor = (venueId: string) => decisions.find((d) => d.venueId === venueId)?.action;

  return (
    <div>
      <div className="mb-6 flex items-start justify-between gap-6">
        <div className="min-w-0">
          <Link href="/" className="text-[13px] text-ink-500 hover:text-ink-900">Requests</Link>
          <h1 className="mt-1 text-[22px] font-semibold tracking-tight text-ink-950">{request.title}</h1>
          <p className="mt-2 max-w-3xl rounded-lg border-l-2 border-ink-200 pl-3 text-[14px] leading-relaxed text-ink-700">{request.brief}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          <RequestStatus status={request.status} />
          {run && run.status !== "running" ? (
            <span className="text-xs text-ink-500 tabular-nums">
              {duration(run.metrics.durationMs)}{run.mode === "replay" ? " recorded" : ""} · {run.metrics.turns ?? 0} model turns · est. {usd(run.metrics.costUsd)}
            </span>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_360px] gap-8">
        <section className="min-w-0">
          {running ? (
            <div className="card flex flex-col items-center justify-center px-6 py-16 text-center">
              <div className="relative mb-4 size-10">
                <span className="absolute inset-0 animate-ping rounded-full bg-brand-500/30" />
                <span className="absolute inset-2 rounded-full bg-brand-500" />
              </div>
              <p className="text-[15px] font-medium text-ink-900">The agent is sourcing venues</p>
              <p className="mt-1 max-w-md text-sm text-ink-500">Searching the catalog, checking dates, getting quotes and checking policy. Steps appear on the right as they happen.</p>
            </div>
          ) : run?.status === "failed" ? (
            <ErrorState message={run.error ?? "The run failed"} />
          ) : answer?.outcome === "needs_info" ? (
            <div className="card px-6 py-5">
              <div className="label">The agent needs more information</div>
              <p className="mt-2 text-[16px] font-medium text-ink-950">{answer.question}</p>
              <p className="mt-2 text-sm text-ink-500">{answer.summary}</p>
            </div>
          ) : run && answer ? (
            <>
              <div className="mb-4 flex items-end justify-between gap-4">
                <div>
                  <h2 className="text-[15px] font-semibold text-ink-950">Shortlist</h2>
                  <p className="mt-1 max-w-3xl text-[13.5px] leading-relaxed text-ink-600">{answer.summary}</p>
                </div>
              </div>
              {run.offers.length === 0 ? (
                <EmptyState title="No offer passed the checks" body="The guard removed every offer. Open the trace to see why." />
              ) : (
                <div className="grid grid-cols-3 gap-4">
                  {run.offers.map((g) => (
                    <OfferCard key={g.offer.venueId} g={g} guests={answer.understood.guests} decision={decisionFor(g.offer.venueId)} />
                  ))}
                </div>
              )}
              {run.dropped.length ? (
                <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50/60 px-4 py-3 text-[13px] text-rose-900">
                  <span className="font-semibold">Removed by the guard in code:</span>{" "}
                  {run.dropped.map((g) => `${g.venue?.name ?? g.offer.venueId} (${g.issues.join("; ")})`).join(", ")}
                </div>
              ) : null}
              <div className="mt-6 flex items-center justify-between rounded-xl border border-violet-200 bg-violet-50 px-5 py-4">
                <div>
                  <p className="text-[14px] font-semibold text-violet-950">
                    {request.status === "reviewed" ? "Reviewed by an event expert" : "Waiting for expert review"}
                  </p>
                  <p className="text-[13px] text-violet-900/80">
                    {request.status === "reviewed"
                      ? `${decisions.filter((d) => d.action === "approve").length} approved, ${decisions.filter((d) => d.action === "reject").length} rejected.`
                      : "No venue is contacted until an expert approves the RFP for it."}
                  </p>
                </div>
                <Link href={`/review?request=${request.id}`} className="inline-flex items-center gap-1.5 rounded-lg bg-violet-700 px-3.5 py-2 text-sm font-medium text-white hover:bg-violet-800">
                  Open expert review <IconArrow size={14} />
                </Link>
              </div>
            </>
          ) : (
            <EmptyState title="No run yet" />
          )}
        </section>

        <aside className="min-w-0">
          <div className="card">
            <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
              <div className="flex items-center gap-2">
                <h2 className="text-[13px] font-semibold text-ink-900">Agent steps</h2>
                {run?.mode === "replay" ? <Badge tone="amber">Replay</Badge> : run ? <Badge tone="green">Live</Badge> : null}
              </div>
              {run ? <Link href={`/runs/${run.id}`} className="text-[12.5px] font-medium text-brand-700 hover:underline">Full trace</Link> : null}
            </div>
            <div className="max-h-[640px] overflow-y-auto px-2 py-2">
              {steps.length ? <StepFeed steps={steps} running={running} /> : running ? <LoadingBlock label="Starting the agent" /> : <p className="px-2 py-4 text-sm text-ink-500">No steps recorded.</p>}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { duration, usd } from "@/lib/client/format";
import type { CheckResult } from "@/lib/evals/checks";
import type { CaseView, SuiteSummary } from "@/lib/services/evals";
import { IconCheck, IconPlay, IconX } from "@/components/icons";
import { Badge, Button, ErrorState, LoadingBlock, PageHeader, Spinner, Stat, cx } from "@/components/ui";

interface EvalsView {
  cases: CaseView[];
  suites: SuiteSummary[];
}

const pct = (n: number | null | undefined) => (n === null || n === undefined ? "-" : `${Math.round(n * 100)}%`);

function Delta({ now, prev, lowerIsBetter, format }: { now: number | null; prev: number | null | undefined; lowerIsBetter?: boolean; format: (n: number) => string }) {
  if (now === null || prev === null || prev === undefined) return <span>No previous suite run yet</span>;
  const diff = now - prev;
  const better = lowerIsBetter ? diff < 0 : diff > 0;
  return (
    <span>
      Previous run {format(prev)}
      {diff !== 0 ? <span className={cx("ml-1.5 font-medium", better ? "text-emerald-700" : "text-rose-700")}>{diff > 0 ? "+" : "-"}{format(Math.abs(diff))}</span> : null}
    </span>
  );
}

function CheckChip({ result, label }: { result?: CheckResult; label: string }) {
  if (!result) return <Badge title={label}>{label}</Badge>;
  return (
    <Badge tone={result.passed ? "green" : "red"} title={result.reason}>
      {result.passed ? <IconCheck size={11} /> : <IconX size={11} />} {label}
    </Badge>
  );
}

function StatusCell({ c }: { c: CaseView }) {
  const s = c.latest?.status;
  if (!s) return <span className="text-[12.5px] text-ink-400">Not run yet</span>;
  if (s === "queued") return <span className="text-[12.5px] text-ink-500">Queued</span>;
  if (s === "running") return <span className="flex items-center gap-1.5 text-[12.5px] text-sky-700"><Spinner className="size-3" /> Running</span>;
  if (s === "passed") return <Badge tone="green"><IconCheck size={11} /> Pass</Badge>;
  return <Badge tone="red"><IconX size={11} /> {s === "error" ? "Error" : "Fail"}</Badge>;
}

export default function EvalsPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState<string | null>(null);
  const view = useQuery({
    queryKey: ["evals"],
    queryFn: () => api<EvalsView>("/api/evals"),
    refetchInterval: (q) => (q.state.data?.suites[0]?.status === "running" ? 1_500 : false),
  });
  const run = useMutation({
    mutationFn: () => api<{ suiteRunId: string }>("/api/evals/run", { method: "POST" }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["evals"] }),
  });

  if (view.isPending) return <LoadingBlock label="Loading eval cases" />;
  if (view.error) return <ErrorState message={view.error.message} retry={() => void view.refetch()} />;
  const { cases, suites } = view.data;
  const current = suites[0];
  const running = current?.status === "running";
  const [latest, previous] = suites.filter((s) => s.status === "done");

  return (
    <div>
      <PageHeader
        title="Evals"
        subtitle="Each case re-runs the agent on a real request and checks its structured output and tool trace in code. Expert rejections become new cases. Cases run 3 at a time."
        actions={
          <Button onClick={() => run.mutate()} disabled={running || run.isPending}>
            {running || run.isPending ? <Spinner /> : <IconPlay size={13} />} {running ? `Running ${current.finishedCount}/${current.caseCount}` : `Run all ${cases.length} cases`}
          </Button>
        }
      />
      {run.error ? <div className="mb-4"><ErrorState message={run.error.message} /></div> : null}

      {running ? (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-[13px] text-sky-900">
          <Spinner className="text-sky-600" />
          Suite running: {current.finishedCount} of {current.caseCount} cases done, {current.passedCount} passing so far. Policy for this run: no-flights rule {current.noFlightsRule ? "on" : "off"}.
        </div>
      ) : null}
      <div className="mb-6 grid grid-cols-4 gap-4">
        <Stat
          label="Pass rate"
          value={latest ? pct(latest.passRate) : "-"}
          hint={latest ? <><span>{latest.passedCount} of {latest.caseCount} · </span><Delta now={latest.passRate} prev={previous?.passRate} format={(n) => pct(n)} /></> : "Run the suite to get a score"}
        />
        <Stat
          label="p50 latency per case"
          value={latest ? duration(latest.p50LatencyMs) : "-"}
          hint={latest ? <Delta now={latest.p50LatencyMs} prev={previous?.p50LatencyMs} lowerIsBetter format={(n) => duration(n)} /> : "Median agent run time"}
        />
        <Stat
          label="Est. cost per suite run"
          value={latest ? usd(latest.costUsd) : "-"}
          hint={latest ? <Delta now={latest.costUsd} prev={previous?.costUsd} lowerIsBetter format={(n) => usd(n)} /> : "SDK estimate, not a bill"}
        />
        <Stat
          label="Last finished suite"
          value={latest ? <span className="text-lg">{latest.mode === "replay" ? "Replay" : "Live"} · no-flights {latest.noFlightsRule ? "on" : "off"}</span> : "-"}
          hint={latest ? (latest.mode === "replay" ? "Latency and cost are from the recorded live runs" : "Live runs on the Claude Agent SDK") : "None yet"}
        />
      </div>

      <div className="card overflow-hidden">
        <table className="w-full text-left text-[13px]">
          <thead className="border-b border-ink-100 bg-ink-50/70">
            <tr className="text-ink-500">
              <th className="w-[42%] px-4 py-2.5 font-medium">Case</th>
              <th className="px-4 py-2.5 font-medium">Checks {running ? "(this run)" : "(latest run)"}</th>
              <th className="w-28 px-4 py-2.5 font-medium">Result</th>
              <th className="w-24 px-4 py-2.5 text-right font-medium">Latency</th>
              <th className="w-24 px-4 py-2.5 text-right font-medium">Est. cost</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-ink-100">
            {cases.map((c) => {
              const results = c.latest?.checks ?? [];
              const expanded = open === c.id;
              return (
                <tr key={c.id} className={cx("align-top", c.origin === "expert" && "bg-violet-50/40")}>
                  <td className="px-4 py-3">
                    <button className="text-left" onClick={() => setOpen(expanded ? null : c.id)}>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-ink-900">{c.title}</span>
                        {c.origin === "expert" ? <Badge tone="violet">From expert review</Badge> : <Badge>Seeded</Badge>}
                      </div>
                      <p className={cx("mt-0.5 max-w-md text-[12.5px] text-ink-500", !expanded && "line-clamp-1")}>{c.brief}</p>
                    </button>
                    {c.origin === "expert" && c.sourceResult ? (
                      <div className="mt-2 rounded-md border border-rose-200 bg-white px-2.5 py-1.5 text-[12px]">
                        <span className="font-medium text-ink-700">Source run: </span>
                        {c.sourceResult.filter((r) => !r.passed).length ? (
                          <span className="text-rose-700">fails {c.sourceResult.filter((r) => !r.passed).map((r) => `"${r.label}"`).join(", ")}</span>
                        ) : (
                          <span className="text-emerald-700">passes</span>
                        )}
                        {c.sourceRunId ? <> · <Link className="font-medium text-brand-700 hover:underline" href={`/runs/${c.sourceRunId}`}>trace</Link></> : null}
                        {c.note ? <p className="mt-0.5 text-ink-500">Expert note: {c.note}</p> : null}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex max-w-lg flex-wrap gap-1.5">
                      {c.checks.map((spec, i) => (
                        <CheckChip key={`${spec.kind}-${i}`} label={spec.label} result={results[i]} />
                      ))}
                    </div>
                    {expanded && results.length ? (
                      <ul className="mt-2 space-y-1 text-[12px]">
                        {results.map((r, i) => (
                          <li key={i} className={r.passed ? "text-emerald-800" : "text-rose-800"}>
                            <span className="font-medium">{r.label}:</span> {r.reason}
                          </li>
                        ))}
                      </ul>
                    ) : results.some((r) => !r.passed) ? (
                      <p className="mt-1.5 text-[12px] text-rose-700">{results.find((r) => !r.passed)?.reason}</p>
                    ) : null}
                    {c.latest?.error ? <p className="mt-1.5 text-[12px] text-rose-700">{c.latest.error}</p> : null}
                  </td>
                  <td className="px-4 py-3">
                    <StatusCell c={c} />
                    {c.previous ? <p className="mt-1 text-[11px] text-ink-400">before: {c.previous.status}</p> : null}
                    {c.latest?.runId ? <Link href={`/runs/${c.latest.runId}`} className="mt-1 block text-[12px] font-medium text-brand-700 hover:underline">trace</Link> : null}
                  </td>
                  <td className="px-4 py-3 text-right text-ink-700 tabular-nums">{duration(c.latest?.durationMs)}</td>
                  <td className="px-4 py-3 text-right text-ink-700 tabular-nums">{usd(c.latest?.costUsd)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

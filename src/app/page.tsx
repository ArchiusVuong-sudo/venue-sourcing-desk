"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, useStatus } from "@/lib/client/api";
import { timeAgo } from "@/lib/client/format";
import { EXAMPLE_REQUESTS } from "@/lib/evals/seed-cases";
import type { RequestSummary } from "@/lib/services/requests";
import { IconArrow, IconPlay } from "@/components/icons";
import { RequestStatus } from "@/components/status-pill";
import { Button, EmptyState, ErrorState, LoadingBlock, Spinner, cx } from "@/components/ui";

const CHIPS = EXAMPLE_REQUESTS.slice(0, 4);

export default function RequestsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [brief, setBrief] = useState("");
  const [chip, setChip] = useState<string | null>(null);
  const status = useStatus();
  const requests = useQuery({ queryKey: ["requests"], queryFn: () => api<RequestSummary[]>("/api/requests"), refetchInterval: 5_000 });
  const create = useMutation({
    mutationFn: (text: string) => api<{ requestId: string; runId: string }>("/api/requests", { method: "POST", body: JSON.stringify({ brief: text }) }),
    onSuccess: ({ requestId }) => {
      void qc.invalidateQueries({ queryKey: ["requests"] });
      router.push(`/requests/${requestId}`);
    },
  });

  const canRun = brief.trim().length >= 15 && !create.isPending;

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_380px] gap-8">
      <section>
        <h1 className="text-[26px] font-semibold tracking-tight text-ink-950">New event request</h1>
        <p className="mt-1 text-[15px] text-ink-500">
          Describe the event in plain words. The agent searches the venue catalog, checks dates, gets quotes and checks policy, then drafts a shortlist for an event expert to review.
        </p>

        <div className="card mt-6 p-1.5">
          <textarea
            value={brief}
            onChange={(e) => {
              setBrief(e.target.value);
              setChip(null);
            }}
            placeholder="e.g. Team offsite for 25 people, 2 nights in June 2027 near Berlin, budget EUR 15,000, 2 vegan..."
            rows={5}
            className="block w-full resize-none rounded-lg px-4 py-3 text-[15px] leading-relaxed text-ink-900 placeholder:text-ink-400 focus:outline-none"
            aria-label="Event request"
          />
          <div className="flex items-center justify-between gap-4 border-t border-ink-100 px-3 py-2.5">
            <p className="text-xs text-ink-500">
              {status.data?.mode === "replay"
                ? "Replay mode: example requests play back recorded live runs; tool calls run again for real."
                : "Runs the live agent on the Claude Agent SDK. Takes about 15-35 s."}
            </p>
            <Button onClick={() => create.mutate(brief)} disabled={!canRun}>
              {create.isPending ? <Spinner /> : <IconPlay size={13} />} Run agent
            </Button>
          </div>
        </div>
        {create.error ? <div className="mt-3"><ErrorState message={create.error.message} /></div> : null}

        <div className="mt-5">
          <div className="label mb-2">Examples</div>
          <div className="flex flex-wrap gap-2">
            {CHIPS.map((ex) => (
              <button
                key={ex.id}
                onClick={() => {
                  setBrief(ex.brief);
                  setChip(ex.id);
                }}
                className={cx(
                  "rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors",
                  chip === ex.id ? "border-brand-500 bg-brand-50 text-brand-700" : "border-ink-200 bg-white text-ink-700 hover:border-ink-400",
                )}
              >
                {ex.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-10 grid grid-cols-3 gap-4">
          {[
            ["1", "Agent drafts", "Four tools over the catalog: search, availability, quotes, policy. Prices come only from quotes."],
            ["2", "Expert decides", "Nothing reaches a venue until an expert approves. A rejection note can become a test."],
            ["3", "Evals catch regressions", "Every case re-runs with checks on the output and the tool trace."],
          ].map(([n, title, body]) => (
            <div key={n} className="rounded-xl border border-ink-200/70 bg-white/60 px-4 py-3.5">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-ink-900">
                <span className="grid size-5 place-items-center rounded-full bg-ink-900 text-[11px] text-white">{n}</span>
                {title}
              </div>
              <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-500">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <aside>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink-900">Recent requests</h2>
          <span className="text-xs text-ink-400">{requests.data?.length ?? 0}</span>
        </div>
        {requests.isPending ? (
          <LoadingBlock />
        ) : requests.error ? (
          <ErrorState message={requests.error.message} retry={() => void requests.refetch()} />
        ) : requests.data.length === 0 ? (
          <EmptyState title="No requests yet" body="Pick an example on the left and run it. Its first run starts here." />
        ) : (
          <ul className="space-y-2">
            {requests.data.map((r) => (
              <li key={r.id}>
                <Link href={`/requests/${r.id}`} className="card group block px-4 py-3 hover:border-ink-400">
                  <div className="flex items-start justify-between gap-3">
                    <p className="line-clamp-2 text-[13.5px] font-medium leading-snug text-ink-900">{r.title}</p>
                    <IconArrow size={14} className="mt-0.5 shrink-0 text-ink-300 group-hover:text-ink-700" />
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <RequestStatus status={r.status} />
                    <span className="text-[11.5px] text-ink-400">{timeAgo(r.createdAt)}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}

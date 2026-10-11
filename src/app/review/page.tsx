"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Suspense, useState } from "react";
import { api } from "@/lib/client/api";
import { eur, shortDate, timeAgo } from "@/lib/client/format";
import { CHECK_LABELS, EXPERT_CHECK_KINDS, type ExpertCheckKind } from "@/lib/evals/checks";
import type { GuardedOffer } from "@/lib/domain/types";
import type { RequestDetail, RequestSummary } from "@/lib/services/requests";
import type { DecisionResult } from "@/lib/services/review";
import { IconCheck, IconSend, IconX } from "@/components/icons";
import { OfferCard } from "@/components/offer-card";
import { RequestStatus } from "@/components/status-pill";
import { Badge, Button, EmptyState, ErrorState, LoadingBlock, PageHeader, Spinner, TextLink, cx } from "@/components/ui";

interface OutboxItem {
  id: string;
  venueName: string;
  subject: string;
  body: string;
  createdAt: string;
}

export default function ReviewPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <Review />
    </Suspense>
  );
}

function Review() {
  const router = useRouter();
  const params = useSearchParams();
  const requests = useQuery({ queryKey: ["requests"], queryFn: () => api<RequestSummary[]>("/api/requests"), refetchInterval: 5_000 });
  const reviewable = (requests.data ?? []).filter((r) => r.status === "awaiting_review" || r.status === "reviewed");
  const selectedId = params.get("request") ?? reviewable.find((r) => r.status === "awaiting_review")?.id ?? reviewable[0]?.id ?? null;

  return (
    <div>
      <PageHeader
        title="Expert review"
        subtitle="The agent cannot contact venues. Each offer reaches the outbox only after an expert approves its RFP; a rejection with a note can become a regression case."
      />
      <div className="grid grid-cols-[260px_minmax(0,1fr)] gap-6">
        <aside>
          <div className="label mb-2">Shortlists</div>
          {requests.isPending ? (
            <LoadingBlock />
          ) : reviewable.length === 0 ? (
            <EmptyState title="Nothing to review" body={<>Run a request first. <TextLink href="/">New request</TextLink></>} />
          ) : (
            <ul className="space-y-1.5">
              {reviewable.map((r) => (
                <li key={r.id}>
                  <button
                    onClick={() => router.replace(`/review?request=${r.id}`)}
                    className={cx("w-full rounded-lg border px-3 py-2.5 text-left transition-colors", r.id === selectedId ? "border-violet-300 bg-violet-50" : "border-transparent hover:bg-white")}
                  >
                    <p className="line-clamp-2 text-[13px] font-medium leading-snug text-ink-900">{r.title}</p>
                    <div className="mt-1.5 flex items-center justify-between">
                      <RequestStatus status={r.status} />
                      <span className="text-[11px] text-ink-400">{timeAgo(r.createdAt)}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Outbox />
        </aside>
        <section className="min-w-0">{selectedId ? <ReviewDetail key={selectedId} id={selectedId} /> : null}</section>
      </div>
    </div>
  );
}

function ReviewDetail({ id }: { id: string }) {
  const detail = useQuery({ queryKey: ["request", id], queryFn: () => api<RequestDetail>(`/api/requests/${id}`) });
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState<{ subject?: string; body?: string }>({});
  const rfp = detail.data?.run?.answer?.rfp;
  const subject = edits.subject ?? rfp?.subject ?? "";
  const body = edits.body ?? rfp?.body ?? "";
  const setSubject = (v: string) => setEdits((e) => ({ ...e, subject: v }));
  const setBody = (v: string) => setEdits((e) => ({ ...e, body: v }));

  if (detail.isPending) return <LoadingBlock />;
  if (detail.error) return <ErrorState message={detail.error.message} />;
  const { run, request, decisions } = detail.data;
  if (!run?.answer || run.offers.length === 0) return <EmptyState title="This request has no shortlist to review" />;
  const answer = run.answer;
  const edited = rfp ? subject !== rfp.subject || body !== rfp.body : false;

  // One line per reason, naming the venues it applies to.
  const reasons = new Map<string, { severity: string; venues: string[] }>();
  for (const g of run.offers) {
    for (const r of g.policyReasons) {
      if (r.code === "expert_review") continue;
      const entry = reasons.get(r.message) ?? { severity: r.severity, venues: [] };
      entry.venues.push(g.venue?.name ?? g.offer.venueId);
      reasons.set(r.message, entry);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[17px] font-semibold text-ink-950">{request.title}</h2>
          <p className="mt-0.5 text-[13px] text-ink-500">
            {answer.understood.guests} guests · {answer.understood.nights} nights · budget {eur(answer.understood.budgetEur)} · <TextLink href={`/runs/${run.id}`}>trace</TextLink>
          </p>
        </div>
        <RequestStatus status={request.status} />
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-5">
        <div className="card">
          <div className="flex items-center justify-between border-b border-ink-100 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <h3 className="text-[13px] font-semibold text-ink-900">Drafted RFP</h3>
              {edited ? <Badge tone="amber">Edited</Badge> : <Badge>Agent draft</Badge>}
            </div>
            <button className="text-[12.5px] font-medium text-brand-700 hover:underline" onClick={() => setEditing((e) => !e)}>{editing ? "Done" : "Edit"}</button>
          </div>
          <div className="px-4 py-3">
            {editing ? (
              <div className="space-y-2">
                <input value={subject} onChange={(e) => setSubject(e.target.value)} className="w-full rounded-md border border-ink-200 px-2.5 py-1.5 text-[13px] font-medium" aria-label="RFP subject" />
                <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={12} className="w-full rounded-md border border-ink-200 px-2.5 py-2 font-mono text-[12px] leading-relaxed" aria-label="RFP body" />
              </div>
            ) : (
              <>
                <p className="text-[13px] font-semibold text-ink-900">{subject}</p>
                <p className="mt-2 max-h-52 overflow-y-auto whitespace-pre-wrap text-[13px] leading-relaxed text-ink-700">{body}</p>
              </>
            )}
          </div>
        </div>
        <div className="card px-4 py-3">
          <h3 className="text-[13px] font-semibold text-ink-900">Policy reasons</h3>
          <ul className="mt-2 space-y-2 text-[13px]">
            <li className="flex gap-2 text-ink-700"><span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-violet-500" />Expert review before any vendor contact (always on)</li>
            {[...reasons].map(([message, { severity, venues }]) => (
              <li key={message} className="flex gap-2 text-ink-700">
                <span className={cx("mt-1.5 size-1.5 shrink-0 rounded-full", severity === "signoff" ? "bg-violet-500" : "bg-brand-500")} />
                <span>
                  {message}
                  <span className="block text-[12px] text-ink-500">
                    {venues.length === run.offers.length ? "All offers" : venues.join(", ")}
                    {severity === "signoff" ? ". In this demo the expert's approval covers the budget owner's sign-off." : ""}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-3 border-t border-ink-100 pt-2.5 text-[12px] text-ink-500">
            Dates: {answer.understood.earliestDate ? `${shortDate(answer.understood.earliestDate)} to ${shortDate(answer.understood.latestDate)}` : "-"}
            {answer.understood.dietary.length ? ` · Dietary: ${answer.understood.dietary.map((d) => `${d.count} ${d.label}`).join(", ")}` : ""}
            {answer.understood.wheelchairUsers ? ` · ${answer.understood.wheelchairUsers} wheelchair user` : ""}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {run.offers.map((g) => (
          <OfferCard key={g.offer.venueId} g={g} guests={answer.understood.guests} decision={decisions.find((d) => d.venueId === g.offer.venueId)?.action}>
            <OfferActions runId={run.id} requestId={id} g={g} decided={decisions.find((d) => d.venueId === g.offer.venueId)} rfp={edited ? { rfpSubject: subject, rfpBody: body } : {}} />
          </OfferCard>
        ))}
      </div>
    </div>
  );
}

function OfferActions({ runId, requestId, g, decided, rfp }: { runId: string; requestId: string; g: GuardedOffer; decided?: RequestDetail["decisions"][number]; rfp: { rfpSubject?: string; rfpBody?: string } }) {
  const qc = useQueryClient();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [addCase, setAddCase] = useState(true);
  const [check, setCheck] = useState<ExpertCheckKind>(g.venue?.travelMode === "flight" ? "no_flight_destinations" : "step_free_only");
  const decide = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api<DecisionResult>(`/api/runs/${runId}/decisions`, { method: "POST", body: JSON.stringify({ venueId: g.offer.venueId, ...payload }) }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["request", requestId] });
      void qc.invalidateQueries({ queryKey: ["requests"] });
      void qc.invalidateQueries({ queryKey: ["outbox"] });
      void qc.invalidateQueries({ queryKey: ["evals"] });
    },
  });

  if (decided) {
    return decided.action === "approve" ? (
      <p className="flex items-center gap-1.5 text-[13px] text-emerald-800"><IconSend size={14} /> RFP sent to the outbox (simulated)</p>
    ) : (
      <div className="text-[13px] text-rose-900">
        <p className="font-medium">Rejected: "{decided.note}"</p>
        {decided.evalCaseId ? <p className="mt-0.5 text-[12.5px]">Saved as a regression case. <TextLink href="/evals">See Evals</TextLink></p> : null}
      </div>
    );
  }

  if (rejecting) {
    return (
      <div className="space-y-2">
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} autoFocus placeholder="Why? This note is kept with the decision." className="w-full rounded-md border border-ink-200 bg-white px-2.5 py-1.5 text-[13px]" aria-label="Rejection note" />
        <label className="flex items-center gap-2 text-[12.5px] text-ink-700">
          <input type="checkbox" checked={addCase} onChange={(e) => setAddCase(e.target.checked)} className="accent-brand-600" /> Add as regression case
        </label>
        {addCase ? (
          <select value={check} onChange={(e) => setCheck(e.target.value as ExpertCheckKind)} className="w-full rounded-md border border-ink-200 bg-white px-2 py-1.5 text-[12.5px]" aria-label="Check">
            {EXPERT_CHECK_KINDS.map((k) => <option key={k} value={k}>{CHECK_LABELS[k]}</option>)}
          </select>
        ) : null}
        {decide.error ? <p className="text-[12px] text-rose-700">{decide.error.message}</p> : null}
        <div className="flex gap-2">
          <Button variant="danger" className="flex-1 py-1.5" disabled={note.trim().length < 3 || decide.isPending} onClick={() => decide.mutate({ action: "reject", note, ...(addCase ? { regressionCheck: check } : {}) })}>
            {decide.isPending ? <Spinner /> : null} Reject
          </Button>
          <Button variant="ghost" className="py-1.5" onClick={() => setRejecting(false)}>Cancel</Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex gap-2">
        <Button className="flex-1 py-1.5" disabled={decide.isPending} onClick={() => decide.mutate({ action: "approve", ...rfp })}>
          {decide.isPending ? <Spinner /> : <IconCheck size={14} />} Approve RFP
        </Button>
        <Button variant="danger" className="flex-1 py-1.5" onClick={() => setRejecting(true)}>
          <IconX size={14} /> Reject
        </Button>
      </div>
      {decide.error ? <p className="mt-1.5 text-[12px] text-rose-700">{decide.error.message}</p> : null}
    </div>
  );
}

function Outbox() {
  const outbox = useQuery({ queryKey: ["outbox"], queryFn: () => api<OutboxItem[]>("/api/outbox") });
  return (
    <div className="mt-8">
      <div className="mb-2 flex items-center justify-between">
        <div className="label">Outbox</div>
        <Badge tone="amber">Simulated</Badge>
      </div>
      {outbox.data?.length ? (
        <ul className="space-y-1.5">
          {outbox.data.map((o) => (
            <li key={o.id} className="rounded-lg border border-ink-200 bg-white px-3 py-2">
              <p className="flex items-center gap-1.5 text-[13px] font-medium text-ink-900"><IconSend size={13} className="text-emerald-600" />{o.venueName}</p>
              <p className="mt-0.5 truncate text-[12px] text-ink-500" title={o.subject}>{o.subject}</p>
              <p className="text-[11px] text-ink-400">Sent (simulated) {timeAgo(o.createdAt)}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[12.5px] text-ink-500">Nothing sent yet. Approved RFPs land here; no real email leaves the app.</p>
      )}
    </div>
  );
}

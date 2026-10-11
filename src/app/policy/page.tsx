"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, useStatus } from "@/lib/client/api";
import { VENUES } from "@/lib/domain/catalog";
import type { Policy } from "@/lib/domain/types";
import { Badge, Button, ErrorState, LoadingBlock, PageHeader, Spinner, cx } from "@/components/ui";

const nameOf = (id: string) => VENUES.find((v) => v.id === id)?.name ?? id;

export default function PolicyPage() {
  const qc = useQueryClient();
  const policy = useQuery({ queryKey: ["policy"], queryFn: () => api<Policy>("/api/policy") });
  const status = useStatus();
  const [edits, setDraft] = useState<Policy | null>(null);
  const [saved, setSaved] = useState(false);
  const draft = edits ?? policy.data ?? null;
  const save = useMutation({
    mutationFn: (p: Policy) =>
      api<Policy>("/api/policy", {
        method: "PUT",
        body: JSON.stringify({ signoffThresholdEur: p.signoffThresholdEur, perGuestCapEur: p.perGuestCapEur, noFlightsShortEvents: p.noFlightsShortEvents }),
      }),
    onSuccess: (p) => {
      qc.setQueryData(["policy"], p);
      setDraft(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 2_500);
    },
  });

  if (policy.error) return <ErrorState message={policy.error.message} />;
  if (!draft) return <LoadingBlock label="Loading policy" />;
  const dirty = JSON.stringify(draft) !== JSON.stringify(policy.data);

  return (
    <div>
      <PageHeader
        title="Company policy"
        subtitle={<>Rules for {draft.workspace} (a fictional company). The check_policy tool and the guard in code both read this policy, so a change applies to the next run.</>}
        actions={
          <>
            {saved ? <span className="text-sm text-emerald-700">Saved</span> : null}
            <Button onClick={() => save.mutate(draft)} disabled={!dirty || save.isPending}>
              {save.isPending ? <Spinner /> : null} Save policy
            </Button>
          </>
        }
      />
      {save.error ? <div className="mb-4"><ErrorState message={save.error.message} /></div> : null}
      {status.data?.mode === "replay" ? (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-[13px] text-amber-900">
          Replay mode has recordings for the default policy with the no-flights rule off and on. Other changes need a live run, so replayed requests will say there is no recording.
        </p>
      ) : null}

      <div className="grid grid-cols-[minmax(0,1fr)_340px] gap-6">
      <div className="card divide-y divide-ink-100">
        <Row title="No flights for events of 3 days or fewer" body="Short offsites stay reachable by train or road. Flight destinations are blocked by check_policy and removed by the guard.">
          <button
            role="switch"
            aria-checked={draft.noFlightsShortEvents}
            aria-label="No flights for events of 3 days or fewer"
            onClick={() => setDraft({ ...draft, noFlightsShortEvents: !draft.noFlightsShortEvents })}
            className={cx("relative h-6 w-11 rounded-full transition-colors", draft.noFlightsShortEvents ? "bg-brand-600" : "bg-ink-200")}
          >
            <span className={cx("absolute top-0.5 size-5 rounded-full bg-white shadow transition-all", draft.noFlightsShortEvents ? "left-5.5" : "left-0.5")} />
          </button>
        </Row>
        <Row title="Budget-owner sign-off above" body="Offers over this total are allowed but flagged for sign-off.">
          <MoneyInput value={draft.signoffThresholdEur} onChange={(n) => setDraft({ ...draft, signoffThresholdEur: n })} label="Sign-off threshold" />
        </Row>
        <Row title="Per-guest cap" body="Offers above this price per guest are blocked.">
          <MoneyInput value={draft.perGuestCapEur} onChange={(n) => setDraft({ ...draft, perGuestCapEur: n })} label="Per-guest cap" />
        </Row>
        <Row title="Expert review before any vendor contact" body="Always on. The agent has no tool that can contact a venue.">
          <Badge tone="green">Always on</Badge>
        </Row>
        <Row title="Preferred vendors" body="Shown first when they fit.">
          <div className="flex max-w-xs flex-wrap justify-end gap-1.5">{draft.preferredVendorIds.map((id) => <Badge key={id} tone="brand">{nameOf(id)}</Badge>)}</div>
        </Row>
        <Row title="Blocked vendors" body="Never offered, whatever the price.">
          <div className="flex max-w-xs flex-wrap justify-end gap-1.5">{draft.blockedVendorIds.map((id) => <Badge key={id} tone="red">{nameOf(id)}</Badge>)}</div>
        </Row>
      </div>
      <aside className="card h-fit px-5 py-4">
        <h2 className="text-[13px] font-semibold text-ink-900">Where each rule is enforced</h2>
        <ol className="mt-3 space-y-3 text-[13px] leading-relaxed text-ink-700">
          <li><span className="font-medium text-ink-900">1. The agent's tool.</span> check_policy returns blocked, needs sign-off or compliant with reasons, so the agent can pick another venue.</li>
          <li><span className="font-medium text-ink-900">2. The guard in code.</span> After the run, every offer is re-checked against this policy and the run's own quotes. Anything blocked is removed before an expert sees it.</li>
          <li><span className="font-medium text-ink-900">3. The eval checks.</span> They score the agent's raw answer, so a prompt or model change that starts proposing blocked options turns a case red even though the guard hid it.</li>
          <li><span className="font-medium text-ink-900">4. The expert.</span> Sending is a code path behind approval; the agent has no tool that contacts a venue.</li>
        </ol>
      </aside>
      </div>
    </div>
  );
}

function Row({ title, body, children }: { title: string; body: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 px-5 py-4">
      <div>
        <p className="text-[14px] font-medium text-ink-900">{title}</p>
        <p className="mt-0.5 text-[13px] text-ink-500">{body}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function MoneyInput({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-sm">
      <span className="text-ink-500">EUR</span>
      <input
        type="number"
        min={1}
        step={100}
        value={value}
        aria-label={label}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n) && n > 0) onChange(n);
        }}
        className="w-24 text-right tabular-nums focus:outline-none"
      />
    </label>
  );
}

"use client";

import { useState, type ReactNode } from "react";
import type { TraceStep } from "@/lib/domain/types";
import { duration, eur, shortDate, tokens } from "@/lib/client/format";
import { IconAlert, IconCheck, IconRetry, IconShield, IconSpark, IconTool } from "./icons";
import { Spinner, cx } from "./ui";

type Tone = "model" | "tool" | "ok" | "warn" | "bad" | "note";

interface Described {
  tone: Tone;
  title: string;
  detail: string;
  running: boolean;
}

/** Venue names as the run itself saw them in search results. */
export function venueNames(steps: TraceStep[]): Map<string, string> {
  const names = new Map<string, string>();
  for (const s of steps) {
    if (s.kind === "tool" && s.name === "search_venues" && s.output && typeof s.output === "object") {
      const venues = (s.output as { venues?: Array<{ venueId: string; name: string }> }).venues ?? [];
      for (const v of venues) names.set(v.venueId, v.name);
    }
  }
  return names;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : /(s|x|ch|sh)$/.test(word) ? "es" : "s"}`;

export function describeStep(step: TraceStep, names: Map<string, string>): Described {
  switch (step.kind) {
    case "model": {
      const calls = step.toolCalls.filter((c) => c !== "StructuredOutput");
      const counts = new Map<string, number>();
      for (const c of calls) counts.set(c, (counts.get(c) ?? 0) + 1);
      const callText = [...counts].map(([n, k]) => (k > 1 ? `${n} x${k}` : n)).join(", ");
      const final = step.toolCalls.includes("StructuredOutput");
      return {
        tone: "model",
        title: final ? "Model wrote the shortlist" : calls.length ? "Model planned the next calls" : "Model turn",
        detail: step.text || (callText ? `Calls ${callText}` : final ? "Structured output" : ""),
        running: false,
      };
    }
    case "tool": {
      const input = (step.input ?? {}) as Record<string, unknown>;
      const out = (step.output ?? {}) as Record<string, unknown>;
      const venue = typeof input.venueId === "string" ? names.get(input.venueId) ?? input.venueId : "";
      const running = step.ok === null;
      const err = typeof out.error === "string" ? out.error : null;
      const tone: Tone = running ? "tool" : step.ok ? "tool" : "bad";
      if (step.name === "search_venues") {
        const venues = (out.venues as Array<{ name: string }> | undefined) ?? [];
        return { tone, running, title: `Searched venues: "${String(input.query ?? "")}"`, detail: running ? "Searching the catalog" : err ?? `${plural(venues.length, "match")}: ${venues.slice(0, 4).map((v) => v.name).join(", ")}${venues.length > 4 ? ", ..." : ""}`, };
      }
      if (step.name === "check_availability") {
        const dates = (out.arrivalDates as string[] | undefined) ?? [];
        return { tone, running, title: `Checked dates at ${venue}`, detail: running ? "Checking calendar" : err ?? (dates.length ? `Open arrivals: ${dates.map((d) => shortDate(d).replace(/ \d{4}$/, "")).join(", ")}` : "No open dates in the window") };
      }
      if (step.name === "get_quote") {
        const attempts = (out.attempts as unknown[] | undefined)?.length ?? 0;
        const quote = out.quote as { totalEur: number; perGuestEur: number; quoteId: string } | undefined;
        const status = out.status as string | undefined;
        const retried = attempts > 1 ? ` after ${attempts} attempts` : "";
        return {
          tone: status === "quoted" ? "tool" : status === "unavailable" ? "warn" : tone,
          running,
          title: `Quote from ${venue}`,
          detail: running ? "Waiting for the venue's booking system" : status === "quoted" && quote ? `${eur(quote.totalEur)} (${eur(quote.perGuestEur)} per guest)${retried}` : status === "unavailable" ? `Quote unavailable${retried}` : String(out.reason ?? err ?? "Rejected"),
        };
      }
      if (step.name === "check_policy") {
        const status = out.status as string | undefined;
        const reasons = (out.reasons as Array<{ severity: string; message: string }> | undefined) ?? [];
        const key = reasons.filter((r) => r.severity !== "info").map((r) => r.message);
        return {
          tone: status === "blocked" ? "bad" : status ? "ok" : tone,
          running,
          title: `Policy check: ${venue}`,
          detail: running ? "Checking rules" : err ?? `${status === "blocked" ? "Blocked" : status === "needs_signoff" ? "OK, needs sign-off" : "Compliant"}${key.length ? ` - ${key.join("; ")}` : ""}`,
        };
      }
      return { tone, running, title: step.name, detail: err ?? "" };
    }
    case "retry":
      return { tone: "warn", title: step.scope === "quote" ? "Quote source timed out, retrying" : "Model API retry", detail: step.message, running: false };
    case "guard":
      return { tone: step.ok ? "ok" : "bad", title: step.ok ? "Checked in code" : "Guard", detail: step.message, running: false };
    case "note":
      return { tone: "note", title: "Note", detail: step.message, running: false };
  }
}

const toneStyle: Record<Tone, { dot: string; icon: ReactNode }> = {
  model: { dot: "bg-violet-100 text-violet-700", icon: <IconSpark size={13} /> },
  tool: { dot: "bg-sky-100 text-sky-700", icon: <IconTool size={13} /> },
  ok: { dot: "bg-emerald-100 text-emerald-700", icon: <IconShield size={13} /> },
  warn: { dot: "bg-amber-100 text-amber-700", icon: <IconRetry size={13} /> },
  bad: { dot: "bg-rose-100 text-rose-700", icon: <IconAlert size={13} /> },
  note: { dot: "bg-ink-100 text-ink-500", icon: <IconCheck size={13} /> },
};

/** Compact live feed for the request page. */
export function StepFeed({ steps, running }: { steps: TraceStep[]; running: boolean }) {
  const names = venueNames(steps);
  const visible = steps.filter((s) => s.kind !== "note");
  return (
    <ol className="relative space-y-0.5">
      {visible.map((step, i) => {
        const d = describeStep(step, names);
        const style = toneStyle[d.tone];
        return (
          <li key={`${step.kind}-${step.at}-${i}`} className="step-in flex gap-3 rounded-lg px-2 py-1.5">
            <span className={cx("mt-0.5 grid size-6 shrink-0 place-items-center rounded-full", style.dot)}>{d.running ? <Spinner className="size-3" /> : style.icon}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate text-[13px] font-medium text-ink-900">{d.title}</p>
                {step.kind === "tool" && step.ok !== null ? <span className="shrink-0 text-[11px] text-ink-400 tabular-nums">{duration(step.ms)}</span> : null}
              </div>
              {d.detail ? <p className="line-clamp-2 text-[12.5px] leading-snug text-ink-500">{d.detail}</p> : null}
            </div>
          </li>
        );
      })}
      {running ? (
        <li className="flex items-center gap-3 px-2 py-1.5 text-[13px] text-ink-500">
          <span className="grid size-6 place-items-center"><Spinner className="size-3 text-brand-600" /></span> Agent is working
        </li>
      ) : null}
    </ol>
  );
}

function Json({ value }: { value: unknown }) {
  return <pre className="max-h-72 overflow-auto rounded-lg bg-ink-950 px-3 py-2.5 font-mono text-[11.5px] leading-relaxed text-ink-100">{JSON.stringify(value, null, 2)}</pre>;
}

/** Full timeline for the trace page: every model turn and tool call with inputs, outputs, latency and tokens. */
export function TraceTimeline({ steps }: { steps: TraceStep[] }) {
  const names = venueNames(steps);
  const [open, setOpen] = useState<Set<number>>(new Set());
  const toggle = (i: number) => setOpen((prev) => {
    const next = new Set(prev);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    return next;
  });
  const end = Math.max(1, ...steps.map((s) => s.at + ("ms" in s ? s.ms : 0)));

  return (
    <ol className="divide-y divide-ink-100">
      {steps.map((step, i) => {
        const d = describeStep(step, names);
        const style = toneStyle[d.tone];
        const ms = "ms" in step ? step.ms : 0;
        const expandable = step.kind === "tool" || (step.kind === "model" && step.text.length > 160);
        return (
          <li key={`${step.kind}-${step.at}-${i}`} className="py-2.5">
            <button className={cx("flex w-full items-start gap-3 text-left", !expandable && "cursor-default")} onClick={() => expandable && toggle(i)}>
              <span className="w-14 shrink-0 pt-1 text-right font-mono text-[11px] text-ink-400 tabular-nums">{(step.at / 1000).toFixed(1)}s</span>
              <span className={cx("mt-0.5 grid size-6 shrink-0 place-items-center rounded-full", style.dot)}>{style.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-[13px] font-medium text-ink-900">{d.title}</span>
                  {step.kind === "tool" ? <span className="font-mono text-[11px] text-ink-400">{step.name}</span> : null}
                </div>
                {d.detail ? <p className={cx("text-[12.5px] leading-snug text-ink-500", !open.has(i) && "line-clamp-2")}>{d.detail}</p> : null}
              </div>
              <div className="flex w-64 shrink-0 items-center justify-end gap-3 pt-1 text-[11px] text-ink-500 tabular-nums">
                {step.kind === "model" ? <span>{tokens(step.inputTokens)} in / {tokens(step.outputTokens)} out</span> : null}
                {ms ? <span className="w-14 text-right">{duration(ms)}</span> : <span className="w-14" />}
                <span className="relative h-1.5 w-20 overflow-hidden rounded-full bg-ink-100" title="Position in the run">
                  <span className={cx("absolute inset-y-0 rounded-full", step.kind === "model" ? "bg-violet-400" : step.kind === "tool" ? "bg-sky-400" : "bg-ink-300")} style={{ left: `${((step.at - (step.kind === "model" ? ms : 0)) / end) * 100}%`, width: `${Math.max(3, (ms / end) * 100)}%` }} />
                </span>
              </div>
            </button>
            {open.has(i) && step.kind === "tool" ? (
              <div className="mt-2 grid grid-cols-2 gap-3 pl-[92px]">
                <div><div className="label mb-1">Input</div><Json value={step.input} /></div>
                <div><div className="label mb-1">Output</div><Json value={step.output} /></div>
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

export function JsonBlock({ value }: { value: unknown }) {
  return <Json value={value} />;
}

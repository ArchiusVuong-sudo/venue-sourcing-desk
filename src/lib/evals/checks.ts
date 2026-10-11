import { z } from "zod";
import type { AgentAnswer, Offer, Policy, Quote, TraceStep, Venue } from "../domain/types";

/** A deterministic check over one run's structured output and tool trace. */
export const CheckSpec = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("min_offers"), min: z.number().int().positive() }),
  z.object({ kind: z.literal("within_budget"), budgetEur: z.number().positive() }),
  z.object({ kind: z.literal("fits_headcount"), guests: z.number().int().positive() }),
  z.object({ kind: z.literal("min_breakout_rooms"), rooms: z.number().int().positive() }),
  z.object({ kind: z.literal("no_blocked_vendor") }),
  z.object({ kind: z.literal("grounded_prices") }),
  z.object({ kind: z.literal("step_free_only") }),
  z.object({
    kind: z.literal("rfp_dietary"),
    counts: z.array(z.object({ label: z.string(), count: z.number().int().positive() })).min(1),
  }),
  z.object({ kind: z.literal("asks_question") }),
  z.object({ kind: z.literal("no_flight_destinations") }),
]);
export type CheckSpec = z.infer<typeof CheckSpec>;
export type CheckKind = CheckSpec["kind"];

export interface CheckResult {
  kind: CheckKind;
  label: string;
  passed: boolean;
  reason: string;
}

export interface RunRecord {
  status: "running" | "done" | "failed";
  error: string | null;
  answer: AgentAnswer | null;
  trace: TraceStep[];
  policy: Policy;
}

export const CHECK_LABELS: Record<CheckKind, string> = {
  min_offers: "Shortlist has at least 2 offers",
  within_budget: "Every offer within budget",
  fits_headcount: "Every venue fits the headcount",
  min_breakout_rooms: "Enough breakout rooms",
  no_blocked_vendor: "No blocked vendors",
  grounded_prices: "Prices match a quote from this run",
  step_free_only: "Step-free venues only",
  rfp_dietary: "RFP states the dietary counts",
  asks_question: "Asks a question instead of guessing",
  no_flight_destinations: "No flight destinations",
};

export const checkLabel = (spec: CheckSpec): string =>
  spec.kind === "min_offers" ? `Shortlist has at least ${spec.min} offers` : CHECK_LABELS[spec.kind];

/** Quotes that a get_quote tool call actually returned in this run, by quote id. */
export function quotesFromTrace(trace: TraceStep[]): Map<string, Quote> {
  const quotes = new Map<string, Quote>();
  for (const step of trace) {
    if (step.kind !== "tool" || step.name !== "get_quote" || !step.ok) continue;
    const output = step.output as { status?: string; quote?: Quote } | null;
    if (output?.status === "quoted" && output.quote) quotes.set(output.quote.quoteId, output.quote);
  }
  return quotes;
}

const eur = (n: number) => `EUR ${n.toLocaleString("en-US")}`;
const names = (offers: Offer[], venues: Map<string, Venue>) =>
  offers.map((o) => venues.get(o.venueId)?.name ?? o.venueId).join(", ");

/** Checks that need a shortlist fail on a question or an empty answer, so nothing passes vacuously. */
function needOffers(record: RunRecord): { offers: Offer[] } | { fail: string } {
  if (record.status === "failed") return { fail: `Run failed: ${record.error ?? "unknown error"}` };
  if (!record.answer) return { fail: "No structured answer" };
  if (record.answer.outcome !== "shortlist" || record.answer.offers.length === 0) {
    return { fail: "No offers to check (the agent returned no shortlist)" };
  }
  return { offers: record.answer.offers };
}

export function runCheck(spec: CheckSpec, record: RunRecord, catalog: Venue[]): CheckResult {
  const label = checkLabel(spec);
  const result = (passed: boolean, reason: string): CheckResult => ({ kind: spec.kind, label, passed, reason });
  const venues = new Map(catalog.map((v) => [v.id, v]));

  if (spec.kind === "asks_question") {
    if (record.status === "failed") return result(false, `Run failed: ${record.error ?? "unknown error"}`);
    const a = record.answer;
    if (!a) return result(false, "No structured answer");
    if (a.outcome === "needs_info" && a.question && a.offers.length === 0) {
      return result(true, `Asked: "${a.question}"`);
    }
    return result(false, `Returned ${a.offers.length} offer(s) instead of asking for the missing details`);
  }

  const got = needOffers(record);
  if ("fail" in got) return result(false, got.fail);
  const { offers } = got;
  const quoted = offers.filter((o) => o.quoteStatus === "quoted");
  const quotes = quotesFromTrace(record.trace);

  switch (spec.kind) {
    case "min_offers":
      return quoted.length >= spec.min
        ? result(true, `${quoted.length} priced offers`)
        : result(false, `Only ${quoted.length} priced offer(s), expected ${spec.min}`);

    case "within_budget": {
      const over = quoted.filter((o) => (quotes.get(o.quoteId ?? "")?.totalEur ?? o.totalEur ?? Infinity) > spec.budgetEur);
      return over.length === 0
        ? result(true, `All priced offers at or under ${eur(spec.budgetEur)}`)
        : result(false, `Over ${eur(spec.budgetEur)}: ${names(over, venues)}`);
    }

    case "fits_headcount": {
      const bad = offers.filter((o) => {
        const venue = venues.get(o.venueId);
        const quote = quotes.get(o.quoteId ?? "");
        return !venue || venue.capacity < spec.guests || (quote !== undefined && quote.guests !== spec.guests);
      });
      return bad.length === 0
        ? result(true, `Every venue seats ${spec.guests} and every quote is for ${spec.guests} guests`)
        : result(false, `Wrong size or headcount: ${names(bad, venues)}`);
    }

    case "min_breakout_rooms": {
      const bad = offers.filter((o) => (venues.get(o.venueId)?.breakoutRooms ?? 0) < spec.rooms);
      return bad.length === 0
        ? result(true, `Every venue has ${spec.rooms}+ breakout rooms`)
        : result(false, `Fewer than ${spec.rooms} breakout rooms: ${names(bad, venues)}`);
    }

    case "no_blocked_vendor": {
      const bad = offers.filter((o) => record.policy.blockedVendorIds.includes(o.venueId));
      return bad.length === 0
        ? result(true, "No offer uses a blocked vendor")
        : result(false, `Blocked vendor offered: ${names(bad, venues)}`);
    }

    case "grounded_prices": {
      const problems: string[] = [];
      for (const o of offers) {
        const venue = venues.get(o.venueId);
        if (!venue) {
          problems.push(`${o.venueId} is not in the catalog`);
          continue;
        }
        if (o.quoteStatus === "unavailable") {
          if (o.totalEur !== null || o.perGuestEur !== null) problems.push(`${venue.name} shows a price without a quote`);
          continue;
        }
        const quote = quotes.get(o.quoteId ?? "");
        if (!quote || quote.venueId !== o.venueId) problems.push(`${venue.name}: quote ${o.quoteId ?? "(none)"} was not returned in this run`);
        else if (quote.totalEur !== o.totalEur || quote.perGuestEur !== o.perGuestEur) {
          problems.push(`${venue.name}: shows ${eur(o.totalEur ?? 0)}, quote says ${eur(quote.totalEur)}`);
        }
      }
      return problems.length === 0
        ? result(true, `${offers.length} offer(s) match catalog venues and quotes from this run`)
        : result(false, problems.join("; "));
    }

    case "step_free_only": {
      const bad = offers.filter((o) => !venues.get(o.venueId)?.stepFree);
      return bad.length === 0 ? result(true, "Every venue is step-free") : result(false, `Not step-free: ${names(bad, venues)}`);
    }

    case "rfp_dietary": {
      const body = record.answer?.rfp?.body ?? "";
      const missing = spec.counts.filter(({ label: diet, count }) => !mentionsCount(body, diet, count));
      return missing.length === 0
        ? result(true, `RFP states ${spec.counts.map((c) => `${c.count} ${c.label}`).join(", ")}`)
        : result(false, `RFP does not state ${missing.map((c) => `${c.count} ${c.label}`).join(", ")}`);
    }

    case "no_flight_destinations": {
      const bad = offers.filter((o) => venues.get(o.venueId)?.travelMode === "flight");
      return bad.length === 0
        ? result(true, "Every offer is reachable without flying")
        : result(false, `Flight destination offered: ${names(bad, venues)}`);
    }
  }
}

/** True when text states "<count> ... <label>" or "<label> ... <count>" within one short phrase. */
const normDashes = (s: string) => s.toLowerCase().replace(/[‐-―]/g, "-");

export function mentionsCount(text: string, label: string, count: number): boolean {
  const norm = normDashes;
  const t = norm(text);
  const l = norm(label).replace(/[-\s]+/g, "[-\\s]?").replace(/s$/, "") + "\\w*";
  const n = `\\b${count}\\b`;
  return new RegExp(`${n}[^.\\n\\d]{0,40}${l}|${l}[^.\\n\\d]{0,25}${n}`).test(t);
}

export const runChecks = (specs: CheckSpec[], record: RunRecord, catalog: Venue[]): CheckResult[] =>
  specs.map((spec) => runCheck(spec, record, catalog));

/** Checks an expert can attach to a regression case from the review page. */
export const EXPERT_CHECK_KINDS = [
  "no_flight_destinations",
  "step_free_only",
  "no_blocked_vendor",
  "grounded_prices",
  "within_budget",
] as const satisfies readonly CheckKind[];
export type ExpertCheckKind = (typeof EXPERT_CHECK_KINDS)[number];

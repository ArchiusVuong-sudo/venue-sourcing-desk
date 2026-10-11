import { z } from "zod";
import type { Db } from "../db/client";
import { searchVenues } from "../db/repo";
import { venueById } from "../domain/catalog";
import { evaluatePolicy } from "../domain/policy";
import { priceQuote, QuoteError, type QuoteRequest } from "../domain/quotes";
import { IsoDate, type Policy, type Quote, type QuoteAttempt, type Venue } from "../domain/types";
import type { TraceRecorder } from "./trace";

export interface ToolContext {
  db: Db;
  policy: Policy;
  catalog: Venue[];
  trace: TraceRecorder;
  /** Quotes returned in this run, by id: the only prices the agent may use. */
  quotes: Map<string, Quote>;
  /** Chains whose flaky quote API already timed out once in this run. */
  flakyFired: Set<string>;
  sleep: (ms: number) => Promise<void>;
  quoteTimeoutMs: number;
  quoteBackoffMs: number;
}

export interface ToolSpec<S extends z.ZodRawShape> {
  name: string;
  description: string;
  shape: S;
  run: (args: z.infer<z.ZodObject<S>>, ctx: ToolContext) => Promise<unknown>;
}

const defineTool = <S extends z.ZodRawShape>(spec: ToolSpec<S>): ToolSpec<S> => spec;

const venueSummary = (v: Venue) => ({
  venueId: v.id,
  name: v.name,
  region: v.region,
  city: v.city,
  description: v.description,
  capacity: v.capacity,
  bedrooms: v.bedrooms,
  breakoutRooms: v.breakoutRooms,
  stepFree: v.stepFree,
  dietary: v.dietary,
  travelFromBerlin: { mode: v.travelMode, minutes: v.travelMinutes },
  co2PerGuestKgIllustrative: v.co2PerGuestKg,
  avgHighInMayC: v.mayAvgHighC,
  coastal: v.coastal,
});

export const searchVenuesTool = defineTool({
  name: "search_venues",
  description:
    "Search the venue catalog. Hard filters (capacity, bedrooms, breakout rooms, step-free, coastal, travel mode, region) then full-text ranking of `query` over venue descriptions. Regions: Berlin, Brandenburg, Baltic coast, Leipzig, Hamburg, Munich, Lisbon coast, Mallorca. Travel modes from Berlin: local, car, train, flight.",
  shape: {
    query: z.string().min(1).max(200).describe("Free-text wishes, e.g. 'warm sea quiet'"),
    regions: z.array(z.string().min(2)).max(8).optional(),
    minCapacity: z.number().int().min(1).max(1000),
    minBedrooms: z.number().int().min(0).max(1000).optional(),
    minBreakoutRooms: z.number().int().min(0).max(20).optional(),
    stepFreeOnly: z.boolean().optional(),
    coastalOnly: z.boolean().optional(),
    travelModes: z.array(z.enum(["local", "car", "train", "flight"])).max(4).optional(),
  },
  run: async (args, ctx) => {
    const found = await searchVenues(ctx.db, { ...args, limit: 8 });
    return { count: found.length, venues: found.map((v) => ({ ...venueSummary(v), textRank: v.rank })) };
  },
});

const overlaps = (start: string, end: string, b: { from: string; to: string }) => start <= b.to && end >= b.from;

const addDays = (iso: string, days: number): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export const checkAvailabilityTool = defineTool({
  name: "check_availability",
  description:
    "Check which arrival dates work for a venue inside a date window. Returns up to 3 open arrival dates for the given number of nights.",
  shape: {
    venueId: z.string().min(1),
    earliestDate: IsoDate,
    latestDate: IsoDate,
    nights: z.number().int().min(0).max(14),
  },
  run: async (args, ctx) => {
    const venue = venueById(args.venueId, ctx.catalog);
    if (!venue) return { error: `Unknown venueId ${args.venueId}` };
    if (args.latestDate < args.earliestDate) return { error: "latestDate is before earliestDate" };
    const open: string[] = [];
    let day = args.earliestDate;
    while (day <= args.latestDate && open.length < 3) {
      const end = addDays(day, args.nights);
      if (venue.blackouts.some((b) => overlaps(day, end, b))) {
        day = addDays(day, 1);
      } else {
        open.push(day);
        day = addDays(day, 7); // spread suggestions a week apart
      }
    }
    return { venueId: venue.id, available: open.length > 0, arrivalDates: open, blackouts: venue.blackouts };
  },
});

/** The quote source for a venue. One chain's API times out once per run; one venue's API is always down. */
async function callQuoteSource(venue: Venue, req: QuoteRequest, ctx: ToolContext): Promise<Quote> {
  if (venue.quoteSource === "broken_api") {
    await ctx.sleep(ctx.quoteTimeoutMs / 4);
    throw new Error("quote service returned 503");
  }
  if (venue.quoteSource === "chain_api" && venue.chain && !ctx.flakyFired.has(venue.chain)) {
    ctx.flakyFired.add(venue.chain);
    await ctx.sleep(ctx.quoteTimeoutMs);
    throw new Error(`timed out after ${ctx.quoteTimeoutMs} ms`);
  }
  return priceQuote(venue, req);
}

export const getQuoteTool = defineTool({
  name: "get_quote",
  description:
    "Get a priced quote from the venue's booking system. Retries a failing source with backoff. Returns status 'quoted' with a quote (use its quoteId, totalEur and perGuestEur exactly), 'unavailable' when the source is down, or 'rejected' when the venue cannot host the request.",
  shape: {
    venueId: z.string().min(1),
    guests: z.number().int().min(1).max(1000),
    nights: z.number().int().min(0).max(14),
    startDate: IsoDate,
    breakoutRooms: z.number().int().min(0).max(20),
  },
  run: async (args, ctx) => {
    const venue = venueById(args.venueId, ctx.catalog);
    if (!venue) return { status: "rejected", reason: `Unknown venueId ${args.venueId}` };
    const attempts: QuoteAttempt[] = [];
    const maxAttempts = 3;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const started = Date.now();
      try {
        const quote = await callQuoteSource(venue, args, ctx);
        attempts.push({ attempt, outcome: "ok", ms: Date.now() - started });
        ctx.quotes.set(quote.quoteId, quote);
        return { status: "quoted", quote, attempts };
      } catch (err) {
        if (err instanceof QuoteError) return { status: "rejected", reason: err.message, attempts };
        const message = err instanceof Error ? err.message : String(err);
        attempts.push({ attempt, outcome: message.includes("timed out") ? "timeout" : "error", ms: Date.now() - started, message });
        if (attempt < maxAttempts) {
          const wait = ctx.quoteBackoffMs * 2 ** (attempt - 1);
          ctx.trace.push({ kind: "retry", at: ctx.trace.now(), scope: "quote", message: `${venue.name}: quote attempt ${attempt} ${message}, retrying in ${wait} ms` });
          await ctx.sleep(wait);
        }
      }
    }
    return { status: "unavailable", reason: `Quote source for ${venue.name} failed ${maxAttempts} times. Show 'quote unavailable', never estimate a price.`, attempts };
  },
});

export const checkPolicyTool = defineTool({
  name: "check_policy",
  description:
    "Check one venue (and its quote, when you have one) against company policy: blocked vendors, accessibility, travel rules, per-guest cap, request budget and sign-off threshold. Offer only venues whose status is not 'blocked'.",
  shape: {
    venueId: z.string().min(1),
    quoteId: z.string().nullable().describe("quoteId from get_quote, or null"),
    nights: z.number().int().min(0).max(14),
    wheelchairUsers: z.number().int().min(0).max(100),
    budgetEur: z.number().positive().nullable(),
  },
  run: async (args, ctx) => {
    const venue = venueById(args.venueId, ctx.catalog);
    if (!venue) return { error: `Unknown venueId ${args.venueId}` };
    const quote = args.quoteId ? ctx.quotes.get(args.quoteId) ?? null : null;
    if (args.quoteId && !quote) return { error: `quoteId ${args.quoteId} was not returned by get_quote in this run` };
    if (quote && quote.venueId !== venue.id) return { error: `quoteId ${args.quoteId} belongs to another venue` };
    return evaluatePolicy({ venue, quote, nights: args.nights, wheelchairUsers: args.wheelchairUsers, budgetEur: args.budgetEur }, ctx.policy);
  },
});

// oxlint-disable-next-line typescript/no-explicit-any -- heterogenous tool list
export const TOOLS: ToolSpec<any>[] = [searchVenuesTool, checkAvailabilityTool, getQuoteTool, checkPolicyTool];

export const TOOL_NAMES = TOOLS.map((t) => t.name);

/**
 * The one execution path for every tool call, live or replayed:
 * validate input, run, record a trace step. Invalid input returns an error to the model.
 */
export async function executeTool(name: string, rawInput: unknown, ctx: ToolContext): Promise<{ ok: boolean; output: unknown }> {
  const spec = TOOLS.find((t) => t.name === name);
  const started = Date.now();
  const step = ctx.trace.push({ kind: "tool", at: ctx.trace.now(), ms: 0, name, input: rawInput, output: null as unknown, ok: null as boolean | null });
  let ok = true;
  let output: unknown;
  if (!spec) {
    ok = false;
    output = { error: `Unknown tool ${name}` };
  } else {
    const parsed = z.object(spec.shape).strict().safeParse(rawInput);
    if (!parsed.success) {
      ok = false;
      output = { error: "Invalid input", issues: parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`) };
    } else {
      try {
        output = await spec.run(parsed.data, ctx);
        if (output && typeof output === "object" && "error" in output) ok = false;
      } catch (err) {
        ok = false;
        output = { error: err instanceof Error ? err.message : String(err) };
      }
    }
  }
  step.ms = Date.now() - started;
  step.output = output;
  step.ok = ok;
  ctx.trace.touch();
  return { ok, output };
}

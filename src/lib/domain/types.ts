import { z } from "zod";

/** ISO calendar date, e.g. 2027-05-11. */
export const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

export const TravelMode = z.enum(["train", "flight", "car", "local"]);
export type TravelMode = z.infer<typeof TravelMode>;

export const QuoteSource = z.enum(["direct", "chain_api", "broken_api"]);
export type QuoteSource = z.infer<typeof QuoteSource>;

export const Venue = z.object({
  id: z.string(),
  name: z.string(),
  region: z.string(),
  city: z.string(),
  description: z.string(),
  capacity: z.number().int().positive(),
  bedrooms: z.number().int().nonnegative(),
  breakoutRooms: z.number().int().nonnegative(),
  dayDelegateRateEur: z.number().positive(),
  roomRateEur: z.number().nonnegative(),
  breakoutRateEur: z.number().nonnegative(),
  travelCostPerGuestEur: z.number().nonnegative(),
  stepFree: z.boolean(),
  dietary: z.array(z.string()),
  travelMode: TravelMode,
  travelMinutes: z.number().int().nonnegative(),
  co2PerGuestKg: z.number().nonnegative(),
  mayAvgHighC: z.number(),
  coastal: z.boolean(),
  chain: z.string().nullable(),
  quoteSource: QuoteSource,
  blackouts: z.array(z.object({ from: IsoDate, to: IsoDate })),
});
export type Venue = z.infer<typeof Venue>;

export const Policy = z.object({
  workspace: z.string(),
  expertReviewRequired: z.literal(true),
  signoffThresholdEur: z.number().positive(),
  perGuestCapEur: z.number().positive(),
  preferredVendorIds: z.array(z.string()),
  blockedVendorIds: z.array(z.string()),
  noFlightsShortEvents: z.boolean(),
  shortEventMaxDays: z.number().int().positive(),
});
export type Policy = z.infer<typeof Policy>;

/** Fields an expert can change on the Policy page. */
export const PolicyPatch = Policy.pick({
  signoffThresholdEur: true,
  perGuestCapEur: true,
  noFlightsShortEvents: true,
}).partial();
export type PolicyPatch = z.infer<typeof PolicyPatch>;

// ---------- Agent answer (structured output) ----------

export const DietaryCount = z.object({
  label: z.string().describe("Dietary need as written, e.g. vegetarian, vegan, gluten-free"),
  count: z.number().int().nonnegative(),
});

export const Offer = z.object({
  venueId: z.string().describe("Venue id exactly as returned by search_venues"),
  quoteId: z.string().nullable().describe("quoteId returned by get_quote; null only when the quote is unavailable"),
  quoteStatus: z.enum(["quoted", "unavailable"]),
  startDate: IsoDate.nullable().describe("Proposed arrival date from check_availability"),
  totalEur: z.number().nullable().describe("Copy totalEur from the quote exactly; null when unavailable"),
  perGuestEur: z.number().nullable().describe("Copy perGuestEur from the quote exactly; null when unavailable"),
  tradeOff: z.string().describe("One line: why this option, and what you give up"),
  policyNotes: z.array(z.string()).describe("Policy reasons from check_policy, short"),
});
export type Offer = z.infer<typeof Offer>;

export const AgentAnswer = z.object({
  outcome: z.enum(["shortlist", "needs_info"]),
  question: z.string().nullable().describe("The one question to the planner when outcome is needs_info, else null"),
  understood: z.object({
    guests: z.number().int().positive().nullable(),
    nights: z.number().int().nonnegative().nullable(),
    earliestDate: IsoDate.nullable(),
    latestDate: IsoDate.nullable(),
    budgetEur: z.number().positive().nullable(),
    wheelchairUsers: z.number().int().nonnegative(),
    breakoutRooms: z.number().int().nonnegative(),
    dietary: z.array(DietaryCount),
  }),
  summary: z.string().describe("Two or three sentences for the planner"),
  offers: z.array(Offer).max(3),
  rfp: z
    .object({
      subject: z.string(),
      body: z.string().describe("Request for proposal text sent to each venue after expert approval"),
    })
    .nullable(),
});
export type AgentAnswer = z.infer<typeof AgentAnswer>;

export const agentAnswerJsonSchema = (): Record<string, unknown> =>
  z.toJSONSchema(AgentAnswer, { target: "draft-7" }) as Record<string, unknown>;

// ---------- Tool results ----------

export const QuoteLine = z.object({
  label: z.string(),
  quantity: z.number(),
  unitEur: z.number(),
  amountEur: z.number(),
});

export const Quote = z.object({
  quoteId: z.string(),
  venueId: z.string(),
  guests: z.number().int(),
  nights: z.number().int(),
  startDate: IsoDate,
  breakoutRooms: z.number().int(),
  lines: z.array(QuoteLine),
  totalEur: z.number(),
  perGuestEur: z.number(),
  currency: z.literal("EUR"),
});
export type Quote = z.infer<typeof Quote>;

export const QuoteAttempt = z.object({
  attempt: z.number().int(),
  outcome: z.enum(["ok", "timeout", "error"]),
  ms: z.number(),
  message: z.string().optional(),
});
export type QuoteAttempt = z.infer<typeof QuoteAttempt>;

export const PolicyReason = z.object({
  code: z.string(),
  severity: z.enum(["block", "signoff", "info"]),
  message: z.string(),
});
export type PolicyReason = z.infer<typeof PolicyReason>;

// ---------- Trace ----------

export type TraceStep =
  | {
      kind: "model";
      at: number;
      ms: number;
      text: string;
      toolCalls: string[];
      inputTokens: number;
      outputTokens: number;
    }
  | {
      kind: "tool";
      at: number;
      ms: number;
      name: string;
      input: unknown;
      output: unknown;
      /** null while the call is running */
      ok: boolean | null;
    }
  | { kind: "retry"; at: number; scope: "quote" | "llm"; message: string }
  | { kind: "guard"; at: number; message: string; ok: boolean }
  | { kind: "note"; at: number; message: string };

export type RunStatus = "running" | "done" | "failed";

export interface RunMetrics {
  durationMs: number;
  turns: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

/** What the guard in code decided for each offer of the raw answer. */
export interface GuardedOffer {
  offer: Offer;
  venue: Venue | null;
  quote: Quote | null;
  issues: string[];
  policyReasons: PolicyReason[];
}

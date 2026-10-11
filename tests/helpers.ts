import { DEFAULT_POLICY, VENUES } from "@/lib/domain/catalog";
import type { AgentAnswer, Offer, Policy, Quote, TraceStep } from "@/lib/domain/types";
import { priceQuote } from "@/lib/domain/quotes";
import { venueById } from "@/lib/domain/catalog";

export const policy = (patch: Partial<Policy> = {}): Policy => ({ ...DEFAULT_POLICY, ...patch });

export const venue = (id: string) => {
  const v = venueById(id);
  if (!v) throw new Error(`no venue ${id}`);
  return v;
};

export const quoteFor = (venueId: string, guests = 40, nights = 2, startDate = "2027-05-01", breakoutRooms = 0): Quote =>
  priceQuote(venue(venueId), { venueId, guests, nights, startDate, breakoutRooms });

export const quoteStep = (quote: Quote): TraceStep => ({
  kind: "tool",
  at: 0,
  ms: 1,
  name: "get_quote",
  input: { venueId: quote.venueId },
  output: { status: "quoted", quote, attempts: [] },
  ok: true,
});

export const offerFrom = (quote: Quote, patch: Partial<Offer> = {}): Offer => ({
  venueId: quote.venueId,
  quoteId: quote.quoteId,
  quoteStatus: "quoted",
  startDate: quote.startDate,
  totalEur: quote.totalEur,
  perGuestEur: quote.perGuestEur,
  tradeOff: "test",
  policyNotes: [],
  ...patch,
});

export const answer = (offers: Offer[], patch: Partial<AgentAnswer> = {}): AgentAnswer => ({
  outcome: "shortlist",
  question: null,
  understood: {
    guests: 40,
    nights: 2,
    earliestDate: "2027-05-01",
    latestDate: "2027-05-31",
    budgetEur: 60_000,
    wheelchairUsers: 1,
    breakoutRooms: 0,
    dietary: [{ label: "vegetarian", count: 6 }],
  },
  summary: "test",
  offers,
  rfp: { subject: "RFP", body: "40 guests, 6 vegetarian, step-free access needed." },
  ...patch,
});

export const catalog = VENUES;

export async function waitUntil<T>(fn: () => Promise<T>, done: (v: T) => boolean, timeoutMs = 20_000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const value = await fn();
    if (done(value)) return value;
    if (Date.now() - start > timeoutMs) throw new Error("waitUntil timed out");
    await new Promise((r) => setTimeout(r, 20));
  }
}

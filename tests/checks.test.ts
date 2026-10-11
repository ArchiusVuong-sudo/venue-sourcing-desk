import { describe, expect, it } from "vitest";
import { mentionsCount, runCheck, type CheckSpec, type RunRecord } from "@/lib/evals/checks";
import { answer, catalog, offerFrom, policy, quoteFor, quoteStep } from "./helpers";

const record = (patch: Partial<RunRecord> = {}): RunRecord => {
  const q1 = quoteFor("pmi-olivera");
  const q2 = quoteFor("lis-baia");
  return {
    status: "done",
    error: null,
    answer: answer([offerFrom(q1), offerFrom(q2)]),
    trace: [quoteStep(q1), quoteStep(q2)],
    policy: policy(),
    ...patch,
  };
};
const check = (spec: CheckSpec, r: RunRecord = record()) => runCheck(spec, r, catalog);

describe("eval checks", () => {
  it("min_offers counts priced offers only", () => {
    expect(check({ kind: "min_offers", min: 2 }).passed).toBe(true);
    const r = record();
    r.answer!.offers[1] = { ...r.answer!.offers[1]!, quoteStatus: "unavailable", quoteId: null, totalEur: null, perGuestEur: null };
    expect(check({ kind: "min_offers", min: 2 }, r)).toMatchObject({ passed: false, reason: "Only 1 priced offer(s), expected 2" });
  });

  it("every shortlist check fails on an empty answer, so nothing passes vacuously", () => {
    const empty = record({ answer: answer([]) });
    const question = record({ answer: answer([], { outcome: "needs_info", question: "When?" }) });
    const failed = record({ status: "failed", error: "boom", answer: null });
    const specs: CheckSpec[] = [
      { kind: "no_flight_destinations" },
      { kind: "no_blocked_vendor" },
      { kind: "grounded_prices" },
      { kind: "within_budget", budgetEur: 60_000 },
      { kind: "step_free_only" },
      { kind: "min_offers", min: 2 },
    ];
    for (const r of [empty, question, failed]) for (const s of specs) expect(check(s, r).passed).toBe(false);
    expect(check({ kind: "grounded_prices" }, failed).reason).toMatch(/Run failed: boom/);
  });

  it("no_flight_destinations names the flight venues", () => {
    const res = check({ kind: "no_flight_destinations" });
    expect(res.passed).toBe(false);
    expect(res.reason).toContain("Finca Olivera");
    const q = quoteFor("bal-seebruecke");
    expect(check({ kind: "no_flight_destinations" }, record({ answer: answer([offerFrom(q)]), trace: [quoteStep(q)] })).passed).toBe(true);
  });

  it("grounded_prices fails on a price that differs from the quote, a quote from another run and an unknown venue", () => {
    const r1 = record();
    r1.answer!.offers[0] = { ...r1.answer!.offers[0]!, totalEur: 30_000 };
    expect(check({ kind: "grounded_prices" }, r1)).toMatchObject({ passed: false });
    expect(check({ kind: "grounded_prices" }, r1).reason).toMatch(/quote says EUR 31,120/);

    const r2 = record({ trace: [] });
    expect(check({ kind: "grounded_prices" }, r2).reason).toMatch(/was not returned in this run/);

    const r3 = record();
    r3.answer!.offers[0] = { ...r3.answer!.offers[0]!, venueId: "made-up-hotel" };
    expect(check({ kind: "grounded_prices" }, r3).reason).toMatch(/not in the catalog/);
  });

  it("grounded_prices allows an honest 'quote unavailable' but not a price without a quote", () => {
    const ok = record();
    ok.answer!.offers.push(offerFrom(quoteFor("ham-elbblick", 12, 1), { quoteStatus: "unavailable", quoteId: null, totalEur: null, perGuestEur: null }));
    expect(check({ kind: "grounded_prices" }, ok).passed).toBe(true);
    const bad = record();
    bad.answer!.offers.push(offerFrom(quoteFor("ham-elbblick", 12, 1), { quoteStatus: "unavailable", quoteId: null }));
    expect(check({ kind: "grounded_prices" }, bad).reason).toMatch(/price without a quote/);
  });

  it("within_budget uses the quote total", () => {
    expect(check({ kind: "within_budget", budgetEur: 32_000 }).passed).toBe(true);
    expect(check({ kind: "within_budget", budgetEur: 31_500 }).reason).toContain("Baia Azul Resort");
  });

  it("no_blocked_vendor reads the run's own policy", () => {
    const q = quoteFor("lej-kesselhalle", 30, 1, "2027-02-16");
    const r = record({ answer: answer([offerFrom(q)]), trace: [quoteStep(q)] });
    expect(check({ kind: "no_blocked_vendor" }, r).passed).toBe(false);
    expect(check({ kind: "no_blocked_vendor" }, { ...r, policy: policy({ blockedVendorIds: [] }) }).passed).toBe(true);
  });

  it("fits_headcount and min_breakout_rooms use the catalog", () => {
    expect(check({ kind: "fits_headcount", guests: 40 }).passed).toBe(true);
    expect(check({ kind: "fits_headcount", guests: 50 }).passed).toBe(false); // olivera seats 45; quotes are for 40
    expect(check({ kind: "min_breakout_rooms", rooms: 3 }).passed).toBe(true);
    expect(check({ kind: "min_breakout_rooms", rooms: 4 }).passed).toBe(false);
  });

  it("step_free_only fails on a venue with stairs", () => {
    const q = quoteFor("bb-ahornfeld", 18);
    expect(check({ kind: "step_free_only" }, record({ answer: answer([offerFrom(q)]), trace: [quoteStep(q)] })).passed).toBe(false);
    expect(check({ kind: "step_free_only" }).passed).toBe(true);
  });

  it("rfp_dietary needs every count in the RFP body", () => {
    expect(check({ kind: "rfp_dietary", counts: [{ label: "vegetarian", count: 6 }] }).passed).toBe(true);
    const res = check({ kind: "rfp_dietary", counts: [{ label: "vegetarian", count: 6 }, { label: "vegan", count: 2 }] });
    expect(res).toMatchObject({ passed: false, reason: "RFP does not state 2 vegan" });
  });

  it("asks_question passes only on a question with no offers", () => {
    expect(check({ kind: "asks_question" }, record({ answer: answer([], { outcome: "needs_info", question: "Which dates?" }) })).passed).toBe(true);
    expect(check({ kind: "asks_question" }).passed).toBe(false);
  });
});

describe("mentionsCount", () => {
  it.each([
    ["Dietary: 6 vegetarian.", "vegetarian", 6, true],
    ["6 guests are vegetarian", "vegetarian", 6, true],
    ["Vegetarian meals: 6", "vegetarian", 6, true],
    ["3 vegan and 2 gluten free", "gluten-free", 2, true],
    ["2 gluten‑free meals", "gluten-free", 2, true],
    ["16 vegetarian", "vegetarian", 6, false],
    ["6 rooms. Some vegetarian food", "vegetarian", 6, false],
  ])("%s / %s %d -> %s", (text, label, count, expected) => {
    expect(mentionsCount(text, label, count)).toBe(expected);
  });
});

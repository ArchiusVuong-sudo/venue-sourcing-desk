import { describe, expect, it } from "vitest";
import { evaluatePolicy, policyFingerprint } from "@/lib/domain/policy";
import { policy, quoteFor, venue } from "./helpers";

const codes = (r: ReturnType<typeof evaluatePolicy>) => r.reasons.map((x) => `${x.severity}:${x.code}`);

describe("evaluatePolicy", () => {
  it("blocks a blocked vendor whatever the price", () => {
    const v = venue("lej-kesselhalle");
    const r = evaluatePolicy({ venue: v, quote: quoteFor(v.id, 30, 1, "2027-02-16"), nights: 1, wheelchairUsers: 0, budgetEur: 10_000 }, policy());
    expect(r.status).toBe("blocked");
    expect(codes(r)).toContain("block:blocked_vendor");
  });

  it("blocks a venue that is not step-free when someone uses a wheelchair, not otherwise", () => {
    const v = venue("bb-ahornfeld");
    expect(evaluatePolicy({ venue: v, quote: null, nights: 2, wheelchairUsers: 1, budgetEur: null }, policy()).status).toBe("blocked");
    expect(evaluatePolicy({ venue: v, quote: null, nights: 2, wheelchairUsers: 0, budgetEur: null }, policy()).status).toBe("compliant");
  });

  it("blocks flights for short events only when the rule is on", () => {
    const v = venue("lis-baia");
    const input = { venue: v, quote: null, nights: 2, wheelchairUsers: 0, budgetEur: null };
    expect(evaluatePolicy(input, policy()).status).toBe("compliant");
    const on = evaluatePolicy(input, policy({ noFlightsShortEvents: true }));
    expect(on.status).toBe("blocked");
    expect(codes(on)).toContain("block:no_flights_short_events");
    // 4 nights = 5 days, longer than the 3-day limit
    expect(evaluatePolicy({ ...input, nights: 4 }, policy({ noFlightsShortEvents: true })).status).toBe("compliant");
    // train venues are never affected
    expect(evaluatePolicy({ ...input, venue: venue("bal-seebruecke") }, policy({ noFlightsShortEvents: true })).status).toBe("compliant");
  });

  it("flags sign-off over the threshold without blocking", () => {
    const v = venue("pmi-olivera");
    const r = evaluatePolicy({ venue: v, quote: quoteFor(v.id), nights: 2, wheelchairUsers: 1, budgetEur: 60_000 }, policy());
    expect(r.status).toBe("needs_signoff");
    expect(codes(r)).toEqual(expect.arrayContaining(["signoff:signoff_threshold", "info:preferred_vendor", "info:expert_review"]));
  });

  it("blocks over the per-guest cap and over the request budget", () => {
    const v = venue("pmi-olivera");
    const q = quoteFor(v.id); // 778 per guest, 31,120 total
    expect(codes(evaluatePolicy({ venue: v, quote: q, nights: 2, wheelchairUsers: 0, budgetEur: null }, policy({ perGuestCapEur: 700 })))).toContain("block:per_guest_cap");
    expect(codes(evaluatePolicy({ venue: v, quote: q, nights: 2, wheelchairUsers: 0, budgetEur: 30_000 }, policy()))).toContain("block:over_budget");
  });

  it("says price rules were not checked when there is no quote", () => {
    const r = evaluatePolicy({ venue: venue("brl-hofgarten"), quote: null, nights: 1, wheelchairUsers: 0, budgetEur: 5_000 }, policy());
    expect(codes(r)).toContain("info:no_quote");
  });
});

describe("policyFingerprint", () => {
  it("changes with rules that change the answer and ignores list order", () => {
    const base = policy();
    expect(policyFingerprint(base)).toBe(policyFingerprint({ ...base, preferredVendorIds: base.preferredVendorIds.toReversed() }));
    expect(policyFingerprint(base)).not.toBe(policyFingerprint({ ...base, noFlightsShortEvents: true }));
    expect(policyFingerprint(base)).not.toBe(policyFingerprint({ ...base, perGuestCapEur: 999 }));
  });
});

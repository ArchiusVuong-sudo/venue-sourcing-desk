import { describe, expect, it } from "vitest";
import { guardAnswer, visibleOffers } from "@/lib/runs/guard";
import { answer, catalog, offerFrom, policy, quoteFor } from "./helpers";

const quotesOf = (...qs: ReturnType<typeof quoteFor>[]) => new Map(qs.map((q) => [q.quoteId, q]));

describe("guardAnswer", () => {
  it("keeps grounded, compliant offers and attaches policy reasons", () => {
    const q = quoteFor("pmi-olivera");
    const [g] = guardAnswer(answer([offerFrom(q)]), quotesOf(q), catalog, policy());
    expect(g!.issues).toEqual([]);
    expect(g!.quote?.totalEur).toBe(q.totalEur);
    expect(g!.policyReasons.map((r) => r.code)).toContain("signoff_threshold");
  });

  it("removes an offer whose price differs from its quote", () => {
    const q = quoteFor("pmi-olivera");
    const [g] = guardAnswer(answer([offerFrom(q, { totalEur: 25_000 })]), quotesOf(q), catalog, policy());
    expect(g!.issues[0]).toMatch(/Price differs/);
  });

  it("removes an offer with a quote id this run never returned, or an unknown venue", () => {
    const q = quoteFor("pmi-olivera");
    const out = guardAnswer(answer([offerFrom(q), offerFrom(q, { venueId: "ghost-hotel" })]), new Map(), catalog, policy());
    expect(out[0]!.issues[0]).toMatch(/not returned by get_quote/);
    expect(out[1]!.issues[0]).toMatch(/not in the catalog/);
    expect(visibleOffers(out)).toHaveLength(0);
  });

  it("removes blocked vendors and policy blocks even if the model offered them", () => {
    const blocked = quoteFor("lej-kesselhalle", 30, 1, "2027-02-16");
    const flight = quoteFor("lis-baia");
    const a = answer([offerFrom(blocked), offerFrom(flight)]);
    const out = guardAnswer(a, quotesOf(blocked, flight), catalog, policy({ noFlightsShortEvents: true }));
    expect(out[0]!.issues.join()).toMatch(/blocked vendor list/);
    expect(out[1]!.issues.join()).toMatch(/Flight destination/);
  });

  it("keeps an honest 'quote unavailable' offer but drops a price without a quote", () => {
    const honest = offerFrom(quoteFor("ham-elbblick", 12, 1), { quoteStatus: "unavailable", quoteId: null, totalEur: null, perGuestEur: null });
    const made = offerFrom(quoteFor("ham-elbblick", 12, 1), { quoteStatus: "unavailable", quoteId: null });
    const a = answer([honest, made], { understood: { ...answer([]).understood, guests: 12, nights: 1, wheelchairUsers: 0, budgetEur: 8_000 } });
    const out = guardAnswer(a, new Map(), catalog, policy());
    expect(out[0]!.issues).toEqual([]);
    expect(out[1]!.issues).toEqual(["Shows a price but has no quote"]);
  });
});

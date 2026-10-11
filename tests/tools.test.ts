import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { makeToolContext } from "@/lib/agent/context";
import { executeTool, type ToolContext } from "@/lib/agent/tools";
import { openDb } from "@/lib/db/client";
import { loadCatalog, loadPolicy, searchVenues } from "@/lib/db/repo";
import type { PGlite } from "@electric-sql/pglite";

let ctx: ToolContext;
let client: PGlite;

beforeAll(async () => {
  const handle = await openDb("memory://");
  client = handle.client;
  ctx = makeToolContext(handle.db, await loadPolicy(handle.db), await loadCatalog(handle.db), { delayScale: 0 });
});
afterAll(async () => client.close());

const fresh = () => ({ ...ctx, quotes: new Map(), flakyFired: new Set<string>() });

describe("search_venues", () => {
  it("applies hard filters and ranks by full text", async () => {
    const found = await searchVenues(ctx.db, { query: "warm sea", minCapacity: 40, minBedrooms: 40, stepFreeOnly: true, coastalOnly: true });
    expect(found.length).toBeGreaterThan(3);
    for (const v of found) {
      expect(v.capacity).toBeGreaterThanOrEqual(40);
      expect(v.stepFree).toBe(true);
      expect(v.coastal).toBe(true);
    }
    expect(found[0]!.rank).toBeGreaterThan(0);
    expect(found[0]!.rank).toBeGreaterThanOrEqual(found[found.length - 1]!.rank);
  });

  it("filters by region, city and travel mode", async () => {
    const munich = await searchVenues(ctx.db, { query: "kick-off", regions: ["munich"], minCapacity: 120, minBreakoutRooms: 4 });
    expect(munich.map((v) => v.id).toSorted()).toEqual(["muc-alpenblick", "muc-isarforum", "muc-maelzerei"]);
    const train = await searchVenues(ctx.db, { query: "sea", coastalOnly: true, travelModes: ["train"], minCapacity: 10 });
    expect(train.every((v) => v.travelMode === "train" && v.region === "Baltic coast")).toBe(true);
  });

  it("still returns filtered venues for a query of stop words or symbols", async () => {
    expect((await searchVenues(ctx.db, { query: "the and of", minCapacity: 200 })).length).toBeGreaterThan(0);
    expect((await searchVenues(ctx.db, { query: "!!! ''", minCapacity: 200 })).length).toBeGreaterThan(0);
  });

  it("returns blocked vendors too, so policy, not search, keeps them out", async () => {
    const res = await executeTool("search_venues", { query: "cheap workshop", regions: ["Leipzig"], minCapacity: 30 }, fresh());
    expect(JSON.stringify(res.output)).toContain("lej-kesselhalle");
  });
});

describe("executeTool", () => {
  it("rejects invalid input with the issue, without running the tool", async () => {
    const c = fresh();
    const res = await executeTool("get_quote", { venueId: "pmi-olivera", guests: -1, nights: 2, startDate: "May 1", breakoutRooms: 0 }, c);
    expect(res.ok).toBe(false);
    expect(JSON.stringify(res.output)).toMatch(/guests/);
    expect(JSON.stringify(res.output)).toMatch(/startDate/);
    expect(c.quotes.size).toBe(0);
  });

  it("rejects unknown keys and unknown tools", async () => {
    expect((await executeTool("search_venues", { query: "x", minCapacity: 1, sendEmail: true }, fresh())).ok).toBe(false);
    expect((await executeTool("send_rfp", {}, fresh())).output).toEqual({ error: "Unknown tool send_rfp" });
  });

  it("records a trace step that starts pending and ends with the output", async () => {
    const c = { ...fresh(), trace: new (ctx.trace.constructor as new () => typeof ctx.trace)() };
    const seen: Array<boolean | null> = [];
    c.trace.onChange((steps) => {
      const s = steps[0];
      if (s?.kind === "tool") seen.push(s.ok);
    });
    await executeTool("check_availability", { venueId: "lis-farol", earliestDate: "2027-05-01", latestDate: "2027-05-31", nights: 2 }, c);
    expect(seen[0]).toBe(null);
    expect(seen.at(-1)).toBe(true);
  });
});

describe("check_availability", () => {
  it("skips blackout dates", async () => {
    const res = await executeTool("check_availability", { venueId: "pmi-serena", earliestDate: "2027-05-01", latestDate: "2027-05-31", nights: 2 }, fresh());
    const out = res.output as { arrivalDates: string[] };
    expect(out.arrivalDates[0]).toBe("2027-05-17");
  });
  it("reports no dates inside a blackout", async () => {
    const res = await executeTool("check_availability", { venueId: "pmi-serena", earliestDate: "2027-05-02", latestDate: "2027-05-10", nights: 2 }, fresh());
    expect(res.output).toMatchObject({ available: false, arrivalDates: [] });
  });
});

const req = (venueId: string, guests = 40) => ({ venueId, guests, nights: 2, startDate: "2027-05-15", breakoutRooms: 0 });

describe("get_quote", () => {
  it("retries the flaky chain source once with backoff and records the retry", async () => {
    const c = fresh();
    const res = await executeTool("get_quote", req("lis-baia"), c);
    const out = res.output as { status: string; attempts: Array<{ outcome: string }> };
    expect(out.status).toBe("quoted");
    expect(out.attempts.map((a) => a.outcome)).toEqual(["timeout", "ok"]);
    expect(c.trace.steps.some((s) => s.kind === "retry" && s.scope === "quote")).toBe(true);
    // the chain timed out once in this run: the next chain venue answers first time
    const again = (await executeTool("get_quote", req("pmi-llum"), c)).output as { attempts: unknown[] };
    expect(again.attempts).toHaveLength(1);
  });

  it("returns 'unavailable' after 3 failures and never a price", async () => {
    const c = fresh();
    const res = await executeTool("get_quote", req("ham-elbblick", 12), c);
    expect(res.output).toMatchObject({ status: "unavailable" });
    expect(JSON.stringify(res.output)).not.toMatch(/totalEur/);
    expect((res.output as { attempts: unknown[] }).attempts).toHaveLength(3);
    expect(c.quotes.size).toBe(0);
  });

  it("rejects a request the venue cannot host", async () => {
    const res = await executeTool("get_quote", req("brl-kastanie", 40), fresh());
    expect(res.output).toMatchObject({ status: "rejected" });
  });
});

describe("check_policy", () => {
  it("only accepts quote ids returned in this run", async () => {
    const res = await executeTool("check_policy", { venueId: "pmi-olivera", quoteId: "Q-DEADBEEF", nights: 2, wheelchairUsers: 0, budgetEur: null }, fresh());
    expect(res.ok).toBe(false);
    expect(JSON.stringify(res.output)).toMatch(/not returned by get_quote/);
  });

  it("uses the run's quote for the price rules", async () => {
    const c = fresh();
    const quoted = (await executeTool("get_quote", { venueId: "pmi-olivera", guests: 40, nights: 2, startDate: "2027-05-15", breakoutRooms: 0 }, c)).output as { quote: { quoteId: string } };
    const res = await executeTool("check_policy", { venueId: "pmi-olivera", quoteId: quoted.quote.quoteId, nights: 2, wheelchairUsers: 1, budgetEur: 60_000 }, c);
    expect(res.output).toMatchObject({ status: "needs_signoff" });
  });
});

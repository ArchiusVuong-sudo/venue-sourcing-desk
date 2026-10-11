import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { makeToolContext } from "@/lib/agent/context";
import { ProviderError } from "@/lib/agent/provider";
import { Fixture, fixtureKey, loadFixture, ReplayProvider } from "@/lib/agent/replay";
import { openDb } from "@/lib/db/client";
import { loadCatalog } from "@/lib/db/repo";
import { AgentAnswer } from "@/lib/domain/types";
import { EXAMPLE_REQUESTS, SEED_CASES } from "@/lib/evals/seed-cases";
import { policy } from "./helpers";

const briefs = [EXAMPLE_REQUESTS[0]!.brief, ...SEED_CASES.map((c) => c.brief)];

describe("replay fixtures", () => {
  it("cover every example and seed case under both settings of the no-flights rule", () => {
    for (const brief of briefs) {
      for (const noFlights of [false, true]) {
        expect(loadFixture(fixtureKey(brief, policy({ noFlightsShortEvents: noFlights }))), brief.slice(0, 40)).not.toBeNull();
      }
    }
  });

  it("are recorded live runs whose answers pass the shortlist schema", () => {
    const dir = path.join(process.cwd(), "fixtures");
    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    expect(files.length).toBeGreaterThanOrEqual(14);
    for (const f of files) {
      const fixture = Fixture.parse(JSON.parse(readFileSync(path.join(dir, f), "utf8")));
      expect(`${fixture.key}.json`).toBe(f);
      expect(fixture.model).toMatch(/^claude-/);
      expect(fixture.metrics.costUsd).toBeGreaterThan(0);
      expect(AgentAnswer.safeParse(fixture.answer).success).toBe(true);
    }
  });

  it("key on the brief text and the policy", () => {
    const b = briefs[0]!;
    expect(fixtureKey(b, policy())).toBe(fixtureKey(`  ${b.toUpperCase()}  `, policy()));
    expect(fixtureKey(b, policy())).not.toBe(fixtureKey(b, policy({ noFlightsShortEvents: true })));
  });
});

describe("ReplayProvider", () => {
  it("re-runs the recorded tool calls so the quotes match the recorded answer", async () => {
    const { db, client } = await openDb("memory://");
    const ctx = makeToolContext(db, policy(), await loadCatalog(db), { delayScale: 0 });
    const result = await new ReplayProvider(0).run({ brief: briefs[0]!, ctx });
    const parsed = AgentAnswer.parse(result.answer);
    for (const offer of parsed.offers.filter((o) => o.quoteStatus === "quoted")) {
      expect(ctx.quotes.get(offer.quoteId!)?.totalEur).toBe(offer.totalEur);
    }
    expect(ctx.trace.steps.filter((s) => s.kind === "tool").length).toBeGreaterThan(5);
    await client.close();
  });

  it("fails plainly when there is no recording", async () => {
    const { db, client } = await openDb("memory://");
    const ctx = makeToolContext(db, policy(), await loadCatalog(db), { delayScale: 0 });
    await expect(new ReplayProvider(0).run({ brief: "A brand new request nobody recorded", ctx })).rejects.toBeInstanceOf(ProviderError);
    await client.close();
  });
});

/** Opt-in: one real agent run on the Claude Agent SDK. Run with LIVE=1 npm run test:live. */
import { describe, expect, it } from "vitest";
import { makeToolContext } from "@/lib/agent/context";
import { LiveProvider } from "@/lib/agent/live";
import { openDb } from "@/lib/db/client";
import { loadCatalog, loadPolicy } from "@/lib/db/repo";
import { AgentAnswer } from "@/lib/domain/types";
import { runChecks } from "@/lib/evals/checks";
import { SEED_CASES } from "@/lib/evals/seed-cases";
import { guardAnswer, visibleOffers } from "@/lib/runs/guard";

describe.skipIf(process.env.LIVE !== "1")("live smoke", () => {
  it("runs a seeded case end to end with grounded prices", async () => {
    const seed = SEED_CASES.find((c) => c.id === "case-berlin-retreat")!;
    const { db, client } = await openDb("memory://");
    const policy = await loadPolicy(db);
    const catalog = await loadCatalog(db);
    const ctx = makeToolContext(db, policy, catalog);
    const result = await new LiveProvider().run({ brief: seed.brief, ctx });
    const answer = AgentAnswer.parse(result.answer);
    expect(visibleOffers(guardAnswer(answer, ctx.quotes, catalog, policy)).length).toBeGreaterThanOrEqual(2);
    const checks = runChecks(seed.checks, { status: "done", error: null, answer, trace: ctx.trace.steps, policy }, catalog);
    expect(checks.filter((c) => !c.passed)).toEqual([]);
    expect(result.costUsd).toBeGreaterThan(0);
    await client.close();
  }, 240_000);
});

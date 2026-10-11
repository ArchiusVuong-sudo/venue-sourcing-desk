/**
 * Live smoke check: one real agent run on the Claude Agent SDK, printed step by step.
 * Usage: npm run smoke -- "<brief>"   (defaults to the offsite example)
 */
import { openDb } from "../src/lib/db/client";
import { loadCatalog, loadPolicy } from "../src/lib/db/repo";
import { makeToolContext } from "../src/lib/agent/context";
import { LiveProvider } from "../src/lib/agent/live";
import { AgentAnswer } from "../src/lib/domain/types";
import { EXAMPLE_REQUESTS } from "../src/lib/evals/seed-cases";

const brief = process.argv[2] ?? EXAMPLE_REQUESTS[0]!.brief;
const { db, client } = await openDb("memory://");
const policy = await loadPolicy(db);
if (process.env.NO_FLIGHTS === "1") policy.noFlightsShortEvents = true;
const ctx = makeToolContext(db, policy, await loadCatalog(db));
ctx.trace.onStep((step) => {
  const line = step.kind === "tool" ? `${step.name} ${step.ok ? "ok" : "ERR"} ${step.ms}ms ${JSON.stringify(step.input)}`
    : step.kind === "model" ? `model turn (tools: ${step.toolCalls.join(", ") || "-"})`
    : `${step.kind}: ${"message" in step ? step.message : ""}`;
  console.log(`[${String(step.at).padStart(6)}ms] ${line}`);
});
try {
  const result = await new LiveProvider().run({ brief, ctx });
  const parsed = AgentAnswer.safeParse(result.answer);
  console.log(JSON.stringify(result.answer, null, 2));
  console.log(`schema ok: ${parsed.success}; turns ${result.numTurns}; tokens in ${result.inputTokens} out ${result.outputTokens}; est. cost $${result.costUsd.toFixed(4)}; ${result.durationMs} ms`);
  if (!parsed.success) console.log(parsed.error.issues);
} finally {
  await client.close();
}

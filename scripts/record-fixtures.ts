/**
 * Records replay fixtures from real live runs on the Claude Agent SDK.
 * Every example request and eval case runs under the default policy and with the
 * no-flights rule on, so replay covers the whole demo loop.
 *
 * Usage: npm run record            (all 14 runs, 3 at a time)
 *        npm run record -- offsite (only briefs whose id contains "offsite")
 */
import { DEFAULT_POLICY } from "../src/lib/domain/catalog";
import { getDb } from "../src/lib/db/client";
import { loadCatalog, savePolicy } from "../src/lib/db/repo";
import { fixtureKey } from "../src/lib/agent/replay";
import { runChecks } from "../src/lib/evals/checks";
import { EXAMPLE_REQUESTS, SEED_CASES } from "../src/lib/evals/seed-cases";
import { LiveProvider } from "../src/lib/agent/live";
import { setProviderOverride, startRun } from "../src/lib/runs/runner";
import { visibleOffers } from "../src/lib/runs/guard";
import { runPool } from "../src/lib/services/evals";

process.env.DATA_DIR = "memory://";
process.env.RECORD_FIXTURES = "1";
delete process.env.DEMO_REPLAY;
setProviderOverride(new LiveProvider());

const filter = process.argv[2];
const briefs = [
  ...EXAMPLE_REQUESTS.filter((e) => e.id === "offsite").map((e) => ({ id: e.id, brief: e.brief, checks: [] as never[] })),
  ...SEED_CASES.map((c) => ({ id: c.id, brief: c.brief, checks: c.checks })),
].filter((b) => !filter || b.id.includes(filter));

const db = await getDb();
const catalog = await loadCatalog(db);
let failures = 0;

for (const noFlights of [false, true]) {
  const policy = { ...DEFAULT_POLICY, noFlightsShortEvents: noFlights };
  await savePolicy(db, policy);
  await runPool(briefs, 3, async (b) => {
    const { done } = await startRun({ kind: "eval", brief: b.brief });
    const row = await done;
    const shown = visibleOffers(row.guarded);
    const flights = shown.filter((g) => g.venue?.travelMode === "flight").map((g) => g.venue?.name);
    const checks = runChecks(b.checks, { status: row.status, error: row.error, answer: row.answer ?? null, trace: row.trace, policy: row.policy }, catalog);
    if (row.status !== "done") failures++;
    console.log(
      [
        `${b.id} noFlights=${noFlights} key=${fixtureKey(b.brief, policy)}`,
        `  status=${row.status} outcome=${row.answer?.outcome ?? "-"} offers=${shown.map((g) => g.venue?.name).join(" | ")} dropped=${row.guarded?.length ? row.guarded.length - shown.length : 0}`,
        `  flights=${flights.join(", ") || "none"} ${row.durationMs} ms est. $${(row.costUsd ?? 0).toFixed(4)} ${row.error ?? ""}`,
        ...checks.map((c) => `  ${c.passed ? "PASS" : "FAIL"} ${c.label}: ${c.reason}`),
      ].join("\n"),
    );
  });
}
console.log(failures ? `RECORD_DONE with ${failures} failed run(s)` : "RECORD_DONE all runs recorded");
process.exit(failures ? 1 : 0);

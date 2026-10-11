/**
 * End-to-end main flow in replay mode, through the same services and route
 * handlers the pages call: request -> live-style run -> shortlist -> expert
 * rejects one offer as a regression case and approves the rest -> outbox ->
 * suite shows the new case red -> policy change -> suite turns it green.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { resetDbForTests } from "@/lib/db/client";
import { EXAMPLE_REQUESTS } from "@/lib/evals/seed-cases";
import { setProviderOverride } from "@/lib/runs/runner";
import { getEvalsView, startSuite, waitForSuite } from "@/lib/services/evals";
import { updatePolicy } from "@/lib/services/policy";
import { createRequest, getRequest, type RequestDetail } from "@/lib/services/requests";
import { listOutbox } from "@/lib/services/review";
import { POST as postDecision } from "@/app/api/runs/[id]/decisions/route";
import { POST as postRequest } from "@/app/api/requests/route";
import { GET as getStatus } from "@/app/api/status/route";
import { waitUntil } from "./helpers";

const offsite = EXAMPLE_REQUESTS.find((e) => e.id === "offsite")!.brief;

const decide = (runId: string, body: unknown) =>
  postDecision(new Request(`http://test/api/runs/${runId}/decisions`, { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ id: runId }) });

beforeAll(async () => {
  setProviderOverride(null);
  await resetDbForTests();
});

describe("main flow (replay)", () => {
  let detail: RequestDetail;

  it("reports replay mode", async () => {
    const res = await getStatus();
    expect(await res.json()).toMatchObject({ mode: "replay", reason: "DEMO_REPLAY=1" });
  });

  it("validates a new request", async () => {
    const res = await postRequest(new Request("http://test/api/requests", { method: "POST", body: JSON.stringify({ brief: "hi" }) }));
    expect(res.status).toBe(400);
  });

  it("runs the offsite request to a grounded shortlist waiting for review", async () => {
    const { requestId } = await createRequest({ brief: offsite });
    detail = await waitUntil(() => getRequest(requestId), (d) => d.request.status !== "running");
    expect(detail.request.status).toBe("awaiting_review");
    const run = detail.run!;
    expect(run.mode).toBe("replay");
    expect(run.offers.length).toBeGreaterThanOrEqual(2);
    expect(run.trace.some((s) => s.kind === "retry" && s.scope === "quote")).toBe(true);
    for (const g of run.offers) expect(g.quote?.totalEur).toBe(g.offer.totalEur);
    expect(run.offers.some((g) => g.venue?.travelMode === "flight")).toBe(true);
  });

  it("refuses a rejection without a note and a decision on a venue not on the shortlist", async () => {
    const runId = detail.run!.id;
    expect((await decide(runId, { venueId: detail.run!.offers[0]!.offer.venueId, action: "reject" })).status).toBe(400);
    expect((await decide(runId, { venueId: "lej-kesselhalle", action: "approve" })).status).toBe(409);
  });

  it("turns a rejection into a regression case whose source run fails the chosen check", async () => {
    const run = detail.run!;
    const flight = run.offers.find((g) => g.venue?.travelMode === "flight")!;
    const res = await decide(run.id, { venueId: flight.offer.venueId, action: "reject", note: "No flights for short offsites, keep it reachable by train", regressionCheck: "no_flight_destinations" });
    expect(res.status).toBe(201);
    const { evalCaseId } = (await res.json()) as { evalCaseId: string };
    expect(evalCaseId).toBeTruthy();
    expect((await decide(run.id, { venueId: flight.offer.venueId, action: "approve" })).status).toBe(409);

    const view = await getEvalsView();
    const created = view.cases.find((c) => c.id === evalCaseId)!;
    expect(created.origin).toBe("expert");
    expect(view.cases[0]!.id).toBe(evalCaseId);
    expect(created.checks.map((c) => c.kind)).toEqual(["no_flight_destinations", "min_offers"]);
    expect(created.sourceResult!.find((r) => r.kind === "no_flight_destinations")!.passed).toBe(false);
  });

  it("sends approved RFPs to the simulated outbox and marks the request reviewed", async () => {
    const run = detail.run!;
    for (const g of run.offers.slice(1)) {
      const res = await decide(run.id, { venueId: g.offer.venueId, action: "approve" });
      if (res.status !== 201) expect(res.status).toBe(409); // the rejected one
    }
    const outbox = await listOutbox();
    expect(outbox.length).toBe(run.offers.length - 1);
    expect(outbox[0]!.body).toMatch(/vegetarian/i);
    expect((await getRequest(detail.request.id)).request.status).toBe("reviewed");
  });

  it("scores the suite: the new case is red under the old policy", async () => {
    await startSuite();
    await waitForSuite();
    const view = await getEvalsView();
    const suite = view.suites[0]!;
    expect(suite.status).toBe("done");
    expect(suite.caseCount).toBe(7);
    const expert = view.cases.find((c) => c.origin === "expert")!;
    expect(expert.latest!.status).toBe("failed");
    expect(view.cases.filter((c) => c.origin === "seed").every((c) => c.latest!.status === "passed")).toBe(true);
    expect(suite.p50LatencyMs).toBeGreaterThan(0);
    expect(suite.costUsd).toBeGreaterThan(0);
  });

  it("turns the case green once the rule is in company policy, and compares with the previous suite", async () => {
    await updatePolicy({ noFlightsShortEvents: true });
    await startSuite();
    await waitForSuite();
    const view = await getEvalsView();
    const [latest, previous] = view.suites;
    expect(latest!.passedCount).toBe(7);
    expect(latest!.passRate).toBe(1);
    expect(previous!.passedCount).toBe(6);
    expect(view.cases.find((c) => c.origin === "expert")!.latest!.status).toBe("passed");
  });
});

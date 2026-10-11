import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "../db/client";
import { decisions, evalCases, outbox, requests, runs } from "../db/schema";
import { CHECK_LABELS, EXPERT_CHECK_KINDS, type CheckSpec } from "../evals/checks";
import { visibleOffers } from "../runs/guard";
import { ConflictError, NotFoundError } from "./requests";

export const DecisionInput = z
  .object({
    venueId: z.string().min(1),
    action: z.enum(["approve", "reject"]),
    note: z.string().trim().max(500).optional(),
    rfpSubject: z.string().trim().min(3).max(200).optional(),
    rfpBody: z.string().trim().min(20).max(5_000).optional(),
    regressionCheck: z.enum(EXPERT_CHECK_KINDS).optional(),
  })
  .superRefine((d, ctx) => {
    if (d.action === "reject" && (!d.note || d.note.length < 3)) {
      ctx.addIssue({ code: "custom", path: ["note"], message: "A rejection needs a note saying why" });
    }
    if (d.action === "approve" && d.regressionCheck) {
      ctx.addIssue({ code: "custom", path: ["regressionCheck"], message: "Only a rejection can become a regression case" });
    }
  });
export type DecisionInput = z.infer<typeof DecisionInput>;

export interface DecisionResult {
  decisionId: string;
  outboxId: string | null;
  evalCaseId: string | null;
  requestStatus: string;
}

/**
 * The only path to a vendor: an expert's approval of one offer writes the RFP to the
 * (simulated) outbox. The agent has no tool that can do this.
 */
export async function decide(runId: string, raw: unknown): Promise<DecisionResult> {
  const input = DecisionInput.parse(raw);
  const db = await getDb();
  const [run] = await db.select().from(runs).where(eq(runs.id, runId));
  if (!run) throw new NotFoundError(`Run ${runId} not found`);
  if (run.kind !== "request" || run.status !== "done" || !run.answer) throw new ConflictError("This run has no shortlist to review");
  const offer = visibleOffers(run.guarded).find((g) => g.offer.venueId === input.venueId);
  if (!offer?.venue) throw new ConflictError(`Venue ${input.venueId} is not on this shortlist`);
  const [existing] = await db.select().from(decisions).where(and(eq(decisions.runId, runId), eq(decisions.venueId, input.venueId)));
  if (existing) throw new ConflictError(`${offer.venue.name} already has a decision`);

  let check: CheckSpec | null = null;
  if (input.regressionCheck === "within_budget") {
    const budget = run.answer.understood.budgetEur;
    if (!budget) throw new ConflictError("The request has no budget, so a budget check cannot be added");
    check = { kind: "within_budget", budgetEur: budget };
  } else if (input.regressionCheck) {
    check = { kind: input.regressionCheck };
  }

  const decisionId = `dec_${randomUUID().slice(0, 8)}`;
  const subject = input.rfpSubject ?? run.answer.rfp?.subject ?? "Request for proposal";
  const body = input.rfpBody ?? run.answer.rfp?.body ?? "";
  let outboxId: string | null = null;
  let evalCaseId: string | null = null;

  await db.transaction(async (tx) => {
    if (check) {
      evalCaseId = `case_${randomUUID().slice(0, 8)}`;
      await tx.insert(evalCases).values({
        id: evalCaseId,
        title: `Expert: ${input.note!.length > 60 ? `${input.note!.slice(0, 57)}...` : input.note}`,
        brief: run.brief,
        origin: "expert",
        checks: [check, { kind: "min_offers", min: 2 }],
        note: `${input.note} (rejected ${offer.venue!.name}; check: ${CHECK_LABELS[check.kind]})`,
        sourceRunId: run.id,
        sourceDecisionId: decisionId,
      });
    }
    await tx.insert(decisions).values({
      id: decisionId,
      runId,
      venueId: input.venueId,
      action: input.action,
      note: input.note ?? null,
      rfpSubject: input.action === "approve" ? subject : null,
      rfpBody: input.action === "approve" ? body : null,
      evalCaseId,
    });
    if (input.action === "approve") {
      outboxId = `out_${randomUUID().slice(0, 8)}`;
      await tx.insert(outbox).values({ id: outboxId, decisionId, venueId: input.venueId, venueName: offer.venue!.name, subject, body });
    }
  });

  const decidedCount = (await db.select().from(decisions).where(eq(decisions.runId, runId))).length;
  let requestStatus = "awaiting_review";
  if (run.requestId && decidedCount >= visibleOffers(run.guarded).length) {
    requestStatus = "reviewed";
    await db.update(requests).set({ status: "reviewed" }).where(eq(requests.id, run.requestId));
  }
  return { decisionId, outboxId, evalCaseId, requestStatus };
}

export async function listOutbox() {
  const db = await getDb();
  const rows = await db.select().from(outbox).orderBy(desc(outbox.createdAt)).limit(50);
  return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
}

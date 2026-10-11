import { sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import type { CheckResult, CheckSpec } from "../evals/checks";
import type { AgentAnswer, GuardedOffer, Policy, TraceStep } from "../domain/types";

export const vendors = pgTable(
  "vendors",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    region: text("region").notNull(),
    city: text("city").notNull(),
    description: text("description").notNull(),
    capacity: integer("capacity").notNull(),
    bedrooms: integer("bedrooms").notNull(),
    breakoutRooms: integer("breakout_rooms").notNull(),
    dayDelegateRateEur: doublePrecision("day_delegate_rate_eur").notNull(),
    roomRateEur: doublePrecision("room_rate_eur").notNull(),
    breakoutRateEur: doublePrecision("breakout_rate_eur").notNull(),
    travelCostPerGuestEur: doublePrecision("travel_cost_per_guest_eur").notNull(),
    stepFree: boolean("step_free").notNull(),
    dietary: jsonb("dietary").$type<string[]>().notNull(),
    travelMode: text("travel_mode").notNull(),
    travelMinutes: integer("travel_minutes").notNull(),
    co2PerGuestKg: doublePrecision("co2_per_guest_kg").notNull(),
    mayAvgHighC: doublePrecision("may_avg_high_c").notNull(),
    coastal: boolean("coastal").notNull(),
    chain: text("chain"),
    quoteSource: text("quote_source").notNull(),
    blackouts: jsonb("blackouts").$type<{ from: string; to: string }[]>().notNull(),
  },
  (t) => [
    index("vendors_search_idx").using(
      "gin",
      sql`to_tsvector('english', ${t.name} || ' ' || ${t.region} || ' ' || ${t.city} || ' ' || ${t.description})`,
    ),
  ],
);

export const policies = pgTable("policies", {
  id: text("id").primaryKey(),
  data: jsonb("data").$type<Policy>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const requests = pgTable("requests", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  brief: text("brief").notNull(),
  status: text("status").$type<"running" | "awaiting_review" | "needs_info" | "reviewed" | "failed">().notNull(),
  latestRunId: text("latest_run_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const runs = pgTable(
  "runs",
  {
    id: text("id").primaryKey(),
    kind: text("kind").$type<"request" | "eval">().notNull(),
    requestId: text("request_id"),
    evalCaseId: text("eval_case_id"),
    suiteRunId: text("suite_run_id"),
    status: text("status").$type<"running" | "done" | "failed">().notNull(),
    mode: text("mode").$type<"live" | "replay">().notNull(),
    model: text("model").notNull(),
    brief: text("brief").notNull(),
    policy: jsonb("policy").$type<Policy>().notNull(),
    trace: jsonb("trace").$type<TraceStep[]>().notNull(),
    answer: jsonb("answer").$type<AgentAnswer>(),
    guarded: jsonb("guarded").$type<GuardedOffer[]>(),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    durationMs: integer("duration_ms"),
    turns: integer("turns"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    costUsd: doublePrecision("cost_usd"),
  },
  (t) => [index("runs_request_idx").on(t.requestId), index("runs_suite_idx").on(t.suiteRunId)],
);

export const decisions = pgTable("decisions", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  venueId: text("venue_id").notNull(),
  action: text("action").$type<"approve" | "reject">().notNull(),
  note: text("note"),
  rfpSubject: text("rfp_subject"),
  rfpBody: text("rfp_body"),
  evalCaseId: text("eval_case_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const outbox = pgTable("outbox", {
  id: text("id").primaryKey(),
  decisionId: text("decision_id").notNull(),
  venueId: text("venue_id").notNull(),
  venueName: text("venue_name").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const evalCases = pgTable("eval_cases", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  brief: text("brief").notNull(),
  origin: text("origin").$type<"seed" | "expert">().notNull(),
  checks: jsonb("checks").$type<CheckSpec[]>().notNull(),
  note: text("note"),
  sourceRunId: text("source_run_id"),
  sourceDecisionId: text("source_decision_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const evalSuiteRuns = pgTable("eval_suite_runs", {
  id: text("id").primaryKey(),
  status: text("status").$type<"running" | "done">().notNull(),
  mode: text("mode").$type<"live" | "replay">().notNull(),
  policy: jsonb("policy").$type<Policy>().notNull(),
  caseCount: integer("case_count").notNull(),
  passedCount: integer("passed_count").notNull().default(0),
  p50LatencyMs: integer("p50_latency_ms"),
  costUsd: doublePrecision("cost_usd"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

export const evalResults = pgTable(
  "eval_results",
  {
    id: text("id").primaryKey(),
    suiteRunId: text("suite_run_id").notNull(),
    caseId: text("case_id").notNull(),
    runId: text("run_id"),
    status: text("status").$type<"queued" | "running" | "passed" | "failed" | "error">().notNull(),
    checks: jsonb("checks").$type<CheckResult[]>().notNull(),
    error: text("error"),
  },
  (t) => [index("eval_results_suite_idx").on(t.suiteRunId)],
);

export type RunRow = typeof runs.$inferSelect;
export type RequestRow = typeof requests.$inferSelect;
export type EvalCaseRow = typeof evalCases.$inferSelect;
export type EvalSuiteRunRow = typeof evalSuiteRuns.$inferSelect;
export type EvalResultRow = typeof evalResults.$inferSelect;
export type DecisionRow = typeof decisions.$inferSelect;
export type OutboxRow = typeof outbox.$inferSelect;

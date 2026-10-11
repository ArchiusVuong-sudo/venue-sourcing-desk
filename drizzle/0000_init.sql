CREATE TABLE "decisions" (
	"id" text PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"venue_id" text NOT NULL,
	"action" text NOT NULL,
	"note" text,
	"rfp_subject" text,
	"rfp_body" text,
	"eval_case_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eval_cases" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"brief" text NOT NULL,
	"origin" text NOT NULL,
	"checks" jsonb NOT NULL,
	"note" text,
	"source_run_id" text,
	"source_decision_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eval_results" (
	"id" text PRIMARY KEY NOT NULL,
	"suite_run_id" text NOT NULL,
	"case_id" text NOT NULL,
	"run_id" text,
	"status" text NOT NULL,
	"checks" jsonb NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "eval_suite_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"status" text NOT NULL,
	"mode" text NOT NULL,
	"policy" jsonb NOT NULL,
	"case_count" integer NOT NULL,
	"passed_count" integer DEFAULT 0 NOT NULL,
	"p50_latency_ms" integer,
	"cost_usd" double precision,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" text PRIMARY KEY NOT NULL,
	"decision_id" text NOT NULL,
	"venue_id" text NOT NULL,
	"venue_name" text NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policies" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "requests" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"brief" text NOT NULL,
	"status" text NOT NULL,
	"latest_run_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"request_id" text,
	"eval_case_id" text,
	"suite_run_id" text,
	"status" text NOT NULL,
	"mode" text NOT NULL,
	"model" text NOT NULL,
	"brief" text NOT NULL,
	"policy" jsonb NOT NULL,
	"trace" jsonb NOT NULL,
	"answer" jsonb,
	"guarded" jsonb,
	"error" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"duration_ms" integer,
	"turns" integer,
	"input_tokens" integer,
	"output_tokens" integer,
	"cost_usd" double precision
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"region" text NOT NULL,
	"city" text NOT NULL,
	"description" text NOT NULL,
	"capacity" integer NOT NULL,
	"bedrooms" integer NOT NULL,
	"breakout_rooms" integer NOT NULL,
	"day_delegate_rate_eur" double precision NOT NULL,
	"room_rate_eur" double precision NOT NULL,
	"breakout_rate_eur" double precision NOT NULL,
	"travel_cost_per_guest_eur" double precision NOT NULL,
	"step_free" boolean NOT NULL,
	"dietary" jsonb NOT NULL,
	"travel_mode" text NOT NULL,
	"travel_minutes" integer NOT NULL,
	"co2_per_guest_kg" double precision NOT NULL,
	"may_avg_high_c" double precision NOT NULL,
	"coastal" boolean NOT NULL,
	"chain" text,
	"quote_source" text NOT NULL,
	"blackouts" jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX "eval_results_suite_idx" ON "eval_results" USING btree ("suite_run_id");--> statement-breakpoint
CREATE INDEX "runs_request_idx" ON "runs" USING btree ("request_id");--> statement-breakpoint
CREATE INDEX "runs_suite_idx" ON "runs" USING btree ("suite_run_id");--> statement-breakpoint
CREATE INDEX "vendors_search_idx" ON "vendors" USING gin (to_tsvector('english', "name" || ' ' || "region" || ' ' || "city" || ' ' || "description"));
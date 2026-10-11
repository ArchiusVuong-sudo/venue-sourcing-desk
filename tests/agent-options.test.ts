import { describe, expect, it } from "vitest";
import { makeToolContext } from "@/lib/agent/context";
import { childEnv, isolatedOptions, isTransient } from "@/lib/agent/live";
import { ProviderError } from "@/lib/agent/provider";
import { TOOL_NAMES } from "@/lib/agent/tools";
import { AgentAnswer, agentAnswerJsonSchema } from "@/lib/domain/types";
import { policy } from "./helpers";
import type { Db } from "@/lib/db/client";

describe("live agent isolation", () => {
  it("sets every isolation option on the SDK query", () => {
    const ctx = makeToolContext({} as Db, policy(), [], { delayScale: 0 });
    const opts = isolatedOptions(ctx, "/tmp/x", new AbortController());
    expect(opts.tools).toEqual([]);
    expect(opts.settingSources).toEqual([]);
    expect(opts.strictMcpConfig).toBe(true);
    expect(opts.persistSession).toBe(false);
    expect(opts.permissionMode).toBe("dontAsk");
    expect(opts.permissionPrompts).toBe("none");
    expect(opts.cwd).toBe("/tmp/x");
    expect(opts.maxTurns).toBeLessThanOrEqual(16);
    expect(opts.allowedTools).toEqual(TOOL_NAMES.map((n) => `mcp__desk__${n}`));
    expect(Object.keys(opts.mcpServers)).toEqual(["desk"]);
    expect(opts.outputFormat.type).toBe("json_schema");
  });

  it("builds the child env from an allowlist only", () => {
    const env = childEnv({
      PATH: "/bin",
      HOME: "/home/x",
      USER: "x",
      LANG: "en_US.UTF-8",
      TMPDIR: "/tmp",
      CLAUDECODE: "1",
      CLAUDE_CODE_ENTRYPOINT: "cli",
      CLAUDE_CODE_SESSION_ID: "abc",
      AWS_SECRET_ACCESS_KEY: "nope",
      NODE_OPTIONS: "--inspect",
    });
    expect(Object.keys(env).toSorted()).toEqual(["HOME", "LANG", "PATH", "TMPDIR", "USER"]);
    expect(Object.keys(childEnv({ PATH: "/bin", ANTHROPIC_API_KEY: "test-value" }))).toContain("ANTHROPIC_API_KEY");
  });
});

describe("shortlist schema", () => {
  it("produces a JSON schema the SDK can send, with every top-level field required", () => {
    const schema = agentAnswerJsonSchema() as { type: string; required: string[] };
    expect(schema.type).toBe("object");
    expect(schema.required).toEqual(expect.arrayContaining(["outcome", "question", "understood", "summary", "offers", "rfp"]));
  });

  it("rejects more than 3 offers and malformed dates", () => {
    const base = {
      outcome: "shortlist",
      question: null,
      understood: { guests: 40, nights: 2, earliestDate: "2027-05-01", latestDate: "2027-05-31", budgetEur: 60_000, wheelchairUsers: 0, breakoutRooms: 0, dietary: [] },
      summary: "x",
      offers: [],
      rfp: null,
    };
    expect(AgentAnswer.safeParse(base).success).toBe(true);
    const offer = { venueId: "a", quoteId: "Q", quoteStatus: "quoted", startDate: "2027-05-01", totalEur: 1, perGuestEur: 1, tradeOff: "x", policyNotes: [] };
    expect(AgentAnswer.safeParse({ ...base, offers: [offer, offer, offer, offer] }).success).toBe(false);
    expect(AgentAnswer.safeParse({ ...base, understood: { ...base.understood, earliestDate: "May 2027" } }).success).toBe(false);
  });
});

describe("LLM retry rule", () => {
  it("retries overload, rate limits and 5xx, not auth or schema failures", () => {
    expect(isTransient(new ProviderError("Model API: overloaded", true, "overloaded"))).toBe(true);
    expect(isTransient(new Error("529 overloaded_error"))).toBe(true);
    expect(isTransient(new Error("request failed with 503"))).toBe(true);
    expect(isTransient(new ProviderError("Claude login failed", false, "auth"))).toBe(false);
    expect(isTransient(new ProviderError("Structured output failed the shortlist schema", false, "schema"))).toBe(false);
  });
});

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { policyFingerprint } from "../domain/policy";
import type { Policy } from "../domain/types";
import { ProviderError, type AgentProvider, type ProviderInput, type ProviderResult } from "./provider";
import { executeTool, TOOL_NAMES } from "./tools";

export const Fixture = z.object({
  key: z.string(),
  brief: z.string(),
  policyFingerprint: z.string(),
  model: z.string(),
  recordedAt: z.string(),
  turns: z.array(
    z.object({
      ms: z.number(),
      text: z.string(),
      toolCalls: z.array(z.object({ name: z.string(), input: z.unknown() })),
      inputTokens: z.number(),
      outputTokens: z.number(),
    }),
  ),
  answer: z.unknown(),
  metrics: z.object({
    numTurns: z.number(),
    inputTokens: z.number(),
    outputTokens: z.number(),
    costUsd: z.number(),
    durationMs: z.number(),
  }),
});
export type Fixture = z.infer<typeof Fixture>;

export const normalizeBrief = (brief: string): string => brief.trim().replace(/\s+/g, " ").toLowerCase();

/** Replay key: the request text plus the parts of the policy that change the agent's answer. */
export const fixtureKey = (brief: string, policy: Policy): string =>
  createHash("sha256")
    .update(`${normalizeBrief(brief)}\n${policyFingerprint(policy)}`)
    .digest("hex")
    .slice(0, 16);

export const fixturesDir = (): string => process.env.FIXTURES_DIR || path.join(process.cwd(), "fixtures");

export function loadFixture(key: string): Fixture | null {
  const file = path.join(fixturesDir(), `${key}.json`);
  if (!existsSync(file)) return null;
  return Fixture.parse(JSON.parse(readFileSync(file, "utf8")));
}

export function saveFixture(brief: string, policy: Policy, result: ProviderResult): Fixture {
  const key = fixtureKey(brief, policy);
  const fixture: Fixture = {
    key,
    brief: brief.trim(),
    policyFingerprint: policyFingerprint(policy),
    model: result.model,
    recordedAt: new Date().toISOString(),
    turns: result.turns,
    answer: result.answer,
    metrics: {
      numTurns: result.numTurns,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      costUsd: result.costUsd,
      durationMs: result.durationMs,
    },
  };
  mkdirSync(fixturesDir(), { recursive: true });
  writeFileSync(path.join(fixturesDir(), `${key}.json`), `${JSON.stringify(fixture, null, 2)}\n`);
  return fixture;
}

/**
 * Replay provider: plays back a recorded live run. The model's turns come from the
 * fixture, but every tool call runs again through the same tools, so the trace,
 * quotes, retries and policy results are computed now, not copied.
 */
export class ReplayProvider implements AgentProvider {
  readonly mode = "replay" as const;
  readonly model: string = "recorded";

  /** speed 1 = recorded pace, 0 = instant. */
  constructor(private readonly speed = Number(process.env.REPLAY_SPEED ?? "0.4")) {}

  async run({ brief, ctx, signal }: ProviderInput): Promise<ProviderResult> {
    const fixture = loadFixture(fixtureKey(brief, ctx.policy));
    if (!fixture) {
      throw new ProviderError(
        "Replay mode has no recording of this request under the current policy. Pick an example request, or run with a Claude login to go live.",
        false,
        "no_fixture",
      );
    }
    const wait = (ms: number) => (this.speed > 0 ? new Promise((r) => setTimeout(r, Math.min(ms * this.speed, 4_000))) : Promise.resolve());
    ctx.trace.note(`Replaying a live run recorded ${fixture.recordedAt.slice(0, 10)} on ${fixture.model}; tool calls run again now`);
    for (const turn of fixture.turns) {
      if (signal?.aborted) throw new ProviderError("Run cancelled", false, "aborted");
      await wait(turn.ms);
      ctx.trace.push({
        kind: "model",
        at: ctx.trace.now(),
        ms: turn.ms,
        text: turn.text,
        toolCalls: turn.toolCalls.map((c) => c.name),
        inputTokens: turn.inputTokens,
        outputTokens: turn.outputTokens,
      });
      for (const call of turn.toolCalls) {
        if (!TOOL_NAMES.includes(call.name)) continue; // e.g. the SDK's own structured-output step
        await executeTool(call.name, call.input, ctx);
        await wait(120);
      }
    }
    return {
      answer: fixture.answer,
      model: fixture.model,
      turns: fixture.turns,
      ...fixture.metrics,
    };
  }
}

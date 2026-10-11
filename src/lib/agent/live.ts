import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createSdkMcpServer, query, tool, type SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import { agentAnswerJsonSchema, type TraceStep } from "../domain/types";
import { systemPrompt, userPrompt } from "./prompt";
import { agentModel, ProviderError, type AgentProvider, type ProviderInput, type ProviderResult, type RecordedTurn } from "./provider";
import { executeTool, TOOLS, type ToolContext } from "./tools";

export const MCP_SERVER = "desk";
const toolId = (name: string) => `mcp__${MCP_SERVER}__${name}`;
const MAX_TURNS = 14;
const RETRYABLE = new Set(["rate_limit", "overloaded", "server_error"]);

/** Child env from an allowlist: no CLAUDECODE / CLAUDE_CODE_* or anything else from the parent leaks in. */
export function childEnv(source: Record<string, string | undefined> = process.env): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of ["PATH", "HOME", "USER", "LANG", "TMPDIR", "ANTHROPIC_API_KEY"]) {
    const value = source[key];
    if (value) env[key] = value;
  }
  return env;
}

function buildServer(ctx: ToolContext) {
  return createSdkMcpServer({
    name: MCP_SERVER,
    version: "1.0.0",
    alwaysLoad: true,
    tools: TOOLS.map((spec) =>
      tool(spec.name, spec.description, spec.shape, async (args: unknown) => {
        const { ok, output } = await executeTool(spec.name, args, ctx);
        return { content: [{ type: "text" as const, text: JSON.stringify(output) }], isError: !ok };
      }),
    ),
  });
}

/** Query options with every isolation switch set. Exported so a test can assert them. */
export function isolatedOptions(ctx: ToolContext, cwd: string, abortController: AbortController) {
  return {
    model: agentModel(),
    systemPrompt: systemPrompt(ctx.policy, new Date().toISOString().slice(0, 10)),
    tools: [] as string[],
    allowedTools: TOOLS.map((t) => toolId(t.name)),
    mcpServers: { [MCP_SERVER]: buildServer(ctx) },
    strictMcpConfig: true,
    settingSources: [],
    persistSession: false,
    cwd,
    maxTurns: MAX_TURNS,
    permissionMode: "dontAsk" as const,
    permissionPrompts: "none" as const,
    env: childEnv(),
    outputFormat: { type: "json_schema" as const, schema: agentAnswerJsonSchema() },
    abortController,
  };
}

interface Usage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

const inputTokensOf = (u: Usage | undefined) =>
  (u?.input_tokens ?? 0) + (u?.cache_read_input_tokens ?? 0) + (u?.cache_creation_input_tokens ?? 0);

async function runOnce({ brief, ctx, signal }: ProviderInput): Promise<ProviderResult> {
  const cwd = mkdtempSync(path.join(tmpdir(), "venue-desk-run-"));
  const abort = new AbortController();
  const onAbort = () => abort.abort();
  signal?.addEventListener("abort", onAbort);
  const started = Date.now();
  const turns: RecordedTurn[] = [];
  const byMessageId = new Map<string, { turn: RecordedTurn; step: Extract<TraceStep, { kind: "model" }> }>();
  let lastEventAt = Date.now();
  const unsubscribe = ctx.trace.onChange((steps) => {
    const last = steps[steps.length - 1];
    if (last?.kind === "tool" && last.ok !== null) lastEventAt = Date.now();
  });

  try {
    const options = isolatedOptions(ctx, cwd, abort);
    for await (const msg of query({ prompt: userPrompt(brief), options }) as AsyncIterable<SDKMessage>) {
      if (msg.type === "assistant") {
        if (msg.parent_tool_use_id) continue;
        if (msg.error && RETRYABLE.has(msg.error)) throw new ProviderError(`Model API: ${msg.error}`, true, msg.error);
        if (msg.error === "authentication_failed") throw new ProviderError("Claude login failed", false, "auth");
        const id = msg.message.id;
        let entry = byMessageId.get(id);
        if (!entry) {
          const now = Date.now();
          const turn: RecordedTurn = { ms: now - lastEventAt, text: "", toolCalls: [], inputTokens: 0, outputTokens: 0 };
          const step = { kind: "model" as const, at: ctx.trace.now(), ms: turn.ms, text: "", toolCalls: [] as string[], inputTokens: 0, outputTokens: 0 };
          entry = { turn, step };
          byMessageId.set(id, entry);
          turns.push(turn);
          ctx.trace.push(step);
          lastEventAt = now;
        }
        for (const block of msg.message.content) {
          if (block.type === "text" && block.text.trim()) {
            entry.turn.text = entry.step.text = (entry.turn.text ? `${entry.turn.text}\n` : "") + block.text.trim();
          } else if (block.type === "tool_use") {
            const name = block.name.startsWith(`mcp__${MCP_SERVER}__`) ? block.name.slice(`mcp__${MCP_SERVER}__`.length) : block.name;
            entry.turn.toolCalls.push({ name, input: block.input });
            entry.step.toolCalls.push(name);
          }
        }
        const usage = msg.message.usage as Usage | undefined;
        entry.turn.inputTokens = entry.step.inputTokens = inputTokensOf(usage);
        entry.turn.outputTokens = entry.step.outputTokens = usage?.output_tokens ?? 0;
      } else if (msg.type === "system" && msg.subtype === "api_retry") {
        ctx.trace.push({ kind: "retry", at: ctx.trace.now(), scope: "llm", message: `Model API ${msg.error} (status ${msg.error_status ?? "n/a"}), SDK retry ${msg.attempt}/${msg.max_retries} in ${msg.retry_delay_ms} ms` });
      } else if (msg.type === "result") {
        // Streamed messages carry partial usage; the result has the final per-call numbers.
        const iterations = (msg.usage as { iterations?: Usage[] }).iterations ?? [];
        const steps = [...byMessageId.values()];
        if (iterations.length === steps.length) {
          iterations.forEach((u, i) => {
            const entry = steps[i]!;
            entry.turn.inputTokens = entry.step.inputTokens = inputTokensOf(u);
            entry.turn.outputTokens = entry.step.outputTokens = u.output_tokens ?? 0;
          });
        }
        const usage = Object.values(msg.modelUsage ?? {});
        const base = {
          model: agentModel(),
          turns,
          numTurns: msg.num_turns,
          inputTokens: usage.reduce((n, u) => n + u.inputTokens + u.cacheReadInputTokens + u.cacheCreationInputTokens, 0),
          outputTokens: usage.reduce((n, u) => n + u.outputTokens, 0),
          costUsd: msg.total_cost_usd,
          durationMs: Date.now() - started,
        };
        if (msg.subtype === "success" && !msg.is_error) return { ...base, answer: msg.structured_output ?? null };
        if (msg.subtype === "success") {
          const status = msg.api_error_status ?? 0;
          throw new ProviderError(`Model API error ${status}: ${msg.result.slice(0, 200)}`, status === 429 || status >= 500, `http_${status}`);
        }
        const reason = msg.subtype === "error_max_structured_output_retries"
          ? "The model could not produce output matching the shortlist schema"
          : msg.subtype === "error_max_turns"
            ? `Stopped after ${MAX_TURNS} turns without a final answer`
            : `Agent run failed (${msg.subtype}): ${msg.errors.join("; ").slice(0, 200)}`;
        throw new ProviderError(reason, false, msg.subtype);
      }
    }
    throw new ProviderError("Agent stream ended without a result", true, "no_result");
  } finally {
    unsubscribe();
    signal?.removeEventListener("abort", onAbort);
    rmSync(cwd, { recursive: true, force: true });
  }
}

const isTransient = (err: unknown): boolean => {
  if (err instanceof ProviderError) return err.retryable;
  const text = err instanceof Error ? err.message : String(err);
  return /overloaded|rate.?limit|429|5\d\d|ECONNRESET|socket hang up/i.test(text);
};

/** Live provider: the Claude Agent SDK on the local login, retried with backoff on overload, rate limits and 5xx. */
export class LiveProvider implements AgentProvider {
  readonly mode = "live" as const;
  readonly model = agentModel();

  constructor(private readonly backoffMs: number[] = [3_000, 10_000, 25_000]) {}

  async run(input: ProviderInput): Promise<ProviderResult> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await runOnce(input);
      } catch (err) {
        const wait = this.backoffMs[attempt];
        if (wait === undefined || !isTransient(err) || input.signal?.aborted) throw err;
        const message = err instanceof Error ? err.message : String(err);
        input.ctx.trace.push({ kind: "retry", at: input.ctx.trace.now(), scope: "llm", message: `${message}; restarting the run in ${wait / 1000} s (attempt ${attempt + 2})` });
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }
}


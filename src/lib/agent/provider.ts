import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { ToolContext } from "./tools";

/** One model turn as recorded: what the model said and which tools it called. */
export interface RecordedTurn {
  ms: number;
  text: string;
  toolCalls: Array<{ name: string; input: unknown }>;
  inputTokens: number;
  outputTokens: number;
}

export interface ProviderResult {
  answer: unknown;
  model: string;
  turns: RecordedTurn[];
  numTurns: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs: number;
}

export interface ProviderInput {
  brief: string;
  ctx: ToolContext;
  signal?: AbortSignal;
}

/** Live (Claude Agent SDK) and replay (recorded fixtures) share this interface. */
export interface AgentProvider {
  readonly mode: "live" | "replay";
  readonly model: string;
  run(input: ProviderInput): Promise<ProviderResult>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly code: string,
  ) {
    super(message);
  }
}

export const agentModel = (): string => process.env.AGENT_MODEL?.trim() || "claude-sonnet-5-5";

/** True when an API key or a local Claude Code login is present. Never reads the secret itself. */
export function hasClaudeCredentials(): boolean {
  if (process.env.ANTHROPIC_API_KEY) return true;
  const home = homedir();
  if (existsSync(path.join(home, ".claude", ".credentials.json"))) return true;
  try {
    const cfg = JSON.parse(readFileSync(path.join(home, ".claude.json"), "utf8")) as Record<string, unknown>;
    if (cfg.oauthAccount) return true;
  } catch {
    // no config file
  }
  if (process.platform === "darwin") {
    const probe = spawnSync("security", ["find-generic-password", "-s", "Claude Code-credentials"], { stdio: "ignore" });
    if (probe.status === 0) return true;
  }
  return false;
}

let liveDisabledReason: string | null = null;

/** Called when a live run fails on authentication: the rest of this process uses replay. */
export const disableLive = (reason: string): void => {
  liveDisabledReason = reason;
};

export function resolveMode(): { mode: "live" | "replay"; reason: string } {
  if (process.env.DEMO_REPLAY === "1") return { mode: "replay", reason: "DEMO_REPLAY=1" };
  if (liveDisabledReason) return { mode: "replay", reason: liveDisabledReason };
  if (!hasClaudeCredentials()) return { mode: "replay", reason: "No Claude login or ANTHROPIC_API_KEY found" };
  return { mode: "live", reason: "Claude Agent SDK on the local login" };
}

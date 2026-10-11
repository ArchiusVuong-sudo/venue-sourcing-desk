import type { Db } from "../db/client";
import type { Policy, Venue } from "../domain/types";
import { TraceRecorder } from "./trace";
import type { ToolContext } from "./tools";

export interface ContextOptions {
  /** 0 makes every simulated delay instant (tests). */
  delayScale?: number;
}

export function makeToolContext(db: Db, policy: Policy, catalog: Venue[], opts: ContextOptions = {}): ToolContext {
  const scale = opts.delayScale ?? 1;
  return {
    db,
    policy,
    catalog,
    trace: new TraceRecorder(),
    quotes: new Map(),
    flakyFired: new Set(),
    sleep: (ms) => (scale <= 0 ? Promise.resolve() : new Promise((r) => setTimeout(r, ms * scale))),
    quoteTimeoutMs: 2_500,
    quoteBackoffMs: 500,
  };
}

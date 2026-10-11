import type { TraceStep } from "../domain/types";

type Listener = (step: TraceStep, index: number) => void;

/** Ordered step log for one run. Steps get an offset in ms from the run start. */
export class TraceRecorder {
  readonly steps: TraceStep[] = [];
  private readonly listeners = new Set<Listener>();
  private readonly t0 = Date.now();

  now(): number {
    return Date.now() - this.t0;
  }

  push(step: TraceStep): void {
    this.steps.push(step);
    const index = this.steps.length - 1;
    for (const listener of this.listeners) listener(step, index);
  }

  /** Inserts a step before the first step at or after `beforeAt` (keeps model turns ahead of the tool calls they made). */
  insertAt(step: TraceStep, beforeAt: number): void {
    const idx = this.steps.findIndex((s) => s.at >= beforeAt && s.kind === "tool");
    if (idx === -1) return this.push(step);
    this.steps.splice(idx, 0, step);
    for (const listener of this.listeners) listener(step, idx);
  }

  note(message: string): void {
    this.push({ kind: "note", at: this.now(), message });
  }

  onStep(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

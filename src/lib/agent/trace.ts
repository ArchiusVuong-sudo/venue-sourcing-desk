import type { TraceStep } from "../domain/types";

type Listener = (steps: TraceStep[]) => void;

/**
 * Ordered step log for one run. Steps carry an offset in ms from the run start.
 * A tool step is pushed when the call starts (ok: null) and updated when it ends,
 * so the array order is the order things happened.
 */
export class TraceRecorder {
  readonly steps: TraceStep[] = [];
  private readonly listeners = new Set<Listener>();
  private readonly t0 = Date.now();

  now(): number {
    return Date.now() - this.t0;
  }

  push<T extends TraceStep>(step: T): T {
    this.steps.push(step);
    this.emit();
    return step;
  }

  /** Call after mutating a step in place. */
  touch(): void {
    this.emit();
  }

  note(message: string): void {
    this.push({ kind: "note", at: this.now(), message });
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const listener of this.listeners) listener(this.steps);
  }
}

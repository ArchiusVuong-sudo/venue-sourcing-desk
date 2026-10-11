"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { TraceStep } from "@/lib/domain/types";

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new ApiError(body.error ?? `Request failed (${res.status})`, res.status);
  return body as T;
}

export interface Status {
  mode: "live" | "replay";
  reason: string;
  model: string;
}

export const useStatus = () => useQuery({ queryKey: ["status"], queryFn: () => api<Status>("/api/status"), staleTime: 30_000 });

/**
 * Live steps of a running agent over server-sent events. When EventSource fails,
 * the caller's polling keeps the page current.
 */
export function useRunStream(runId: string | null | undefined, running: boolean): { steps: TraceStep[] | null } {
  const [steps, setSteps] = useState<TraceStep[] | null>(null);
  useEffect(() => {
    if (!runId || !running || typeof EventSource === "undefined") return;
    const source = new EventSource(`/api/runs/${runId}/events`);
    const onTrace = (e: Event) => setSteps(JSON.parse((e as MessageEvent<string>).data) as TraceStep[]);
    const stop = () => source.close();
    source.addEventListener("trace", onTrace);
    source.addEventListener("end", stop);
    source.addEventListener("error", stop);
    return stop;
  }, [runId, running]);
  return { steps };
}

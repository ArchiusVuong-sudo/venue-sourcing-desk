import { Badge } from "./ui";

const MAP: Record<string, { tone: Parameters<typeof Badge>[0]["tone"]; label: string }> = {
  running: { tone: "blue", label: "Agent running" },
  awaiting_review: { tone: "violet", label: "Waiting for expert review" },
  needs_info: { tone: "amber", label: "Needs info from planner" },
  reviewed: { tone: "green", label: "Reviewed" },
  failed: { tone: "red", label: "Failed" },
};

export function RequestStatus({ status }: { status: string }) {
  const s = MAP[status] ?? { tone: "neutral" as const, label: status };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { api, useStatus } from "@/lib/client/api";
import type { RequestSummary } from "@/lib/services/requests";
import { cx } from "./ui";

const NAV = [
  { href: "/", label: "Requests", match: (p: string) => p === "/" || p.startsWith("/requests") },
  { href: "/review", label: "Expert review", match: (p: string) => p.startsWith("/review") },
  { href: "/evals", label: "Evals", match: (p: string) => p.startsWith("/evals") || p.startsWith("/runs") },
  { href: "/policy", label: "Policy", match: (p: string) => p.startsWith("/policy") },
];

function ModeBadge() {
  const { data } = useStatus();
  if (!data) return null;
  return data.mode === "replay" ? (
    <span title={data.reason} className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-900 ring-1 ring-inset ring-amber-300">
      <span className="size-1.5 rounded-full bg-amber-500" /> Replay mode
    </span>
  ) : (
    <span title={data.reason} className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-xs font-medium text-white ring-1 ring-inset ring-white/20">
      <span className="size-1.5 rounded-full bg-emerald-400" /> Live agent <span className="font-mono text-[11px] text-white/60">{data.model}</span>
    </span>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { data: requests } = useQuery({
    queryKey: ["requests"],
    queryFn: () => api<RequestSummary[]>("/api/requests"),
    refetchInterval: 5_000,
  });
  const awaiting = requests?.filter((r) => r.status === "awaiting_review").length ?? 0;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 bg-ink-950 text-white">
        <div className="mx-auto flex h-14 max-w-[1320px] items-center gap-8 px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="grid size-7 place-items-center rounded-lg bg-brand-500 text-[13px] font-bold text-ink-950">VS</span>
            <span className="text-[15px] font-semibold tracking-tight">Venue Sourcing Desk</span>
            <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[11px] font-medium text-white/70">Demo Co.</span>
          </Link>
          <nav className="flex items-center gap-1">
            {NAV.map((item) => {
              const active = item.match(pathname);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cx(
                    "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                    active ? "bg-white/12 text-white" : "text-white/65 hover:bg-white/8 hover:text-white",
                  )}
                >
                  {item.label}
                  {item.href === "/review" && awaiting > 0 ? (
                    <span className="grid h-4.5 min-w-4.5 place-items-center rounded-full bg-brand-500 px-1 text-[10.5px] font-semibold text-ink-950">{awaiting}</span>
                  ) : null}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto">
            <ModeBadge />
          </div>
        </div>
      </header>
      <div className="border-b border-amber-200 bg-amber-50">
        <div className="mx-auto flex max-w-[1320px] items-center gap-2 px-8 py-1.5 text-[12.5px] text-amber-900">
          <span className="rounded bg-amber-200/70 px-1.5 py-px text-[11px] font-semibold uppercase tracking-wide">Synthetic data</span>
          Every venue, price, CO2 figure and company here is invented for this demo. Approved requests go to a simulated outbox.
        </div>
      </div>
      <main className="mx-auto max-w-[1320px] px-8 py-8">{children}</main>
    </div>
  );
}

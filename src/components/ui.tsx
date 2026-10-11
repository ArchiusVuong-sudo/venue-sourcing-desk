import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { IconAlert } from "./icons";

export const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(" ");

type Tone = "neutral" | "brand" | "green" | "red" | "amber" | "blue" | "violet";

const tones: Record<Tone, string> = {
  neutral: "bg-ink-100 text-ink-700 ring-ink-200",
  brand: "bg-brand-50 text-brand-700 ring-brand-100",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  red: "bg-rose-50 text-rose-700 ring-rose-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200",
  blue: "bg-sky-50 text-sky-700 ring-sky-200",
  violet: "bg-violet-50 text-violet-700 ring-violet-200",
};

export function Badge({ tone = "neutral", children, className, title }: { tone?: Tone; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-medium ring-1 ring-inset", tones[tone], className)}>
      {children}
    </span>
  );
}

type Variant = "primary" | "secondary" | "danger" | "ghost";
const variants: Record<Variant, string> = {
  primary: "bg-brand-600 text-white hover:bg-brand-700 shadow-sm disabled:bg-ink-200 disabled:text-ink-500",
  secondary: "bg-white text-ink-900 ring-1 ring-inset ring-ink-200 hover:bg-ink-50 disabled:text-ink-400",
  danger: "bg-white text-rose-700 ring-1 ring-inset ring-rose-200 hover:bg-rose-50 disabled:text-ink-400",
  ghost: "text-ink-700 hover:bg-ink-100",
};

export function Button({ variant = "primary", className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...rest}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:cursor-not-allowed",
        variants[variant],
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cx("inline-block size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent", className)} aria-label="Loading" />;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex items-end justify-between gap-6">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight text-ink-950">{title}</h1>
        {subtitle ? <p className="mt-1 max-w-3xl text-sm text-ink-500">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-ink-200 bg-white/60 px-6 py-12 text-center">
      <p className="text-sm font-medium text-ink-900">{title}</p>
      {body ? <p className="mt-1 max-w-md text-sm text-ink-500">{body}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800" role="alert">
      <IconAlert className="mt-0.5 shrink-0" />
      <div className="flex-1">{message}</div>
      {retry ? <button className="font-medium underline" onClick={retry}>Try again</button> : null}
    </div>
  );
}

export function LoadingBlock({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 px-1 py-8 text-sm text-ink-500">
      <Spinner /> {label}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="card px-4 py-3.5">
      <div className="label">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight text-ink-950 tabular-nums">{value}</div>
      {hint ? <div className="mt-0.5 text-xs text-ink-500">{hint}</div> : null}
    </div>
  );
}

export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="font-medium text-brand-700 hover:underline">
      {children}
    </Link>
  );
}

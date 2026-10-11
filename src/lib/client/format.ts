export const eur = (n: number | null | undefined): string =>
  n === null || n === undefined ? "-" : `EUR ${Math.round(n).toLocaleString("en-US")}`;

export const usd = (n: number | null | undefined, digits = 3): string =>
  n === null || n === undefined ? "-" : `$${n.toFixed(digits)}`;

export const duration = (ms: number | null | undefined): string => {
  if (ms === null || ms === undefined) return "-";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  return `${Math.floor(ms / 60_000)} min ${Math.round((ms % 60_000) / 1000)} s`;
};

export const travelTime = (minutes: number): string => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h} h${m ? ` ${m} min` : ""}` : `${m} min`;
};

export const tokens = (n: number | null | undefined): string =>
  n === null || n === undefined ? "-" : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

export const shortDate = (iso: string | null | undefined): string => {
  if (!iso) return "-";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
};

export const timeAgo = (iso: string): string => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86_400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86_400)} d ago`;
};

/** "17-19 May 2027" or "30 May - 1 Jun 2027". */
export const dateRange = (startIso: string, nights: number): string => {
  const opts = { timeZone: "UTC" } as const;
  const a = new Date(`${startIso}T00:00:00Z`);
  const b = new Date(a);
  b.setUTCDate(b.getUTCDate() + nights);
  const month = (d: Date) => d.toLocaleDateString("en-GB", { month: "short", ...opts });
  if (nights === 0) return shortDate(startIso);
  if (a.getUTCMonth() === b.getUTCMonth()) return `${a.getUTCDate()}-${b.getUTCDate()} ${month(b)} ${b.getUTCFullYear()}`;
  return `${a.getUTCDate()} ${month(a)} - ${b.getUTCDate()} ${month(b)} ${b.getUTCFullYear()}`;
};

export const addDays = (iso: string, days: number): string => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

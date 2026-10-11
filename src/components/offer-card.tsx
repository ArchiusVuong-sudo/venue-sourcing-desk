import type { GuardedOffer } from "@/lib/domain/types";
import { dateRange, eur, shortDate, travelTime } from "@/lib/client/format";
import { IconAccess, IconCar, IconLeaf, IconPin, IconPlane, IconTrain } from "./icons";
import { Badge, cx } from "./ui";

const modeIcon = { flight: IconPlane, train: IconTrain, car: IconCar, local: IconPin } as const;
const modeLabel = { flight: "Flight", train: "Train", car: "Coach or car", local: "Local" } as const;

export function OfferCard({ g, guests, decision, children }: { g: GuardedOffer; guests: number | null; decision?: "approve" | "reject"; children?: React.ReactNode }) {
  const { offer, venue, quote } = g;
  if (!venue) return null;
  const Mode = modeIcon[venue.travelMode];
  const signoff = g.policyReasons.find((r) => r.severity === "signoff");
  const preferred = g.policyReasons.some((r) => r.code === "preferred_vendor");
  const start = quote?.startDate ?? offer.startDate;
  return (
    <article
      className={cx(
        "card flex flex-col overflow-hidden transition-shadow",
        decision === "approve" && "ring-2 ring-emerald-400",
        decision === "reject" && "opacity-70 ring-2 ring-rose-300",
      )}
    >
      <div className="border-b border-ink-100 px-5 pt-4 pb-3.5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-[15px] font-semibold leading-tight text-ink-950">{venue.name}</h3>
            <p className="mt-0.5 text-[13px] text-ink-500">
              {venue.city}, {venue.region}
            </p>
          </div>
          {decision ? (
            <Badge tone={decision === "approve" ? "green" : "red"}>{decision === "approve" ? "Approved" : "Rejected"}</Badge>
          ) : preferred ? (
            <Badge tone="brand">Preferred</Badge>
          ) : null}
        </div>
        <div className="mt-3">
          {offer.quoteStatus === "quoted" && quote ? (
            <>
              <div className="whitespace-nowrap text-[22px] font-semibold leading-tight tracking-tight text-ink-950 tabular-nums">{eur(quote.totalEur)}</div>
              <div className="text-[12.5px] text-ink-500 tabular-nums">{eur(quote.perGuestEur)} per guest · quote {quote.quoteId}</div>
            </>
          ) : (
            <span className="text-[15px] font-medium text-amber-700">Quote unavailable</span>
          )}
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 px-5 py-3.5 text-[13px]">
        <div>
          <dt className="label">Capacity</dt>
          <dd className="mt-0.5 text-ink-900">
            {venue.capacity} seats{guests ? <span className="text-ink-500"> for {guests}</span> : null}
          </dd>
        </div>
        <div>
          <dt className="label">Dates</dt>
          <dd className="mt-0.5 whitespace-nowrap text-ink-900">{start && quote ? dateRange(start, quote.nights) : start ? shortDate(start) : "-"}</dd>
        </div>
        <div>
          <dt className="label">From Berlin</dt>
          <dd className="mt-0.5 flex items-center gap-1.5 whitespace-nowrap text-ink-900">
            <Mode size={14} className={venue.travelMode === "flight" ? "text-sky-600" : "text-ink-500"} />
            {modeLabel[venue.travelMode]}, {travelTime(venue.travelMinutes)}
          </dd>
        </div>
        <div>
          <dt className="label" title="Illustrative factor, not a measurement">CO2 / guest*</dt>
          <dd className="mt-0.5 flex items-center gap-1.5 whitespace-nowrap text-ink-900" title="Illustrative factor, not a measurement">
            <IconLeaf size={14} className={venue.co2PerGuestKg > 100 ? "text-amber-600" : "text-emerald-600"} />
            ~{venue.co2PerGuestKg} kg
          </dd>
        </div>
      </dl>

      <div className="flex flex-wrap gap-1.5 px-5">
        {venue.stepFree ? (
          <Badge tone="green">
            <IconAccess size={12} /> Step-free
          </Badge>
        ) : (
          <Badge tone="amber">Not step-free</Badge>
        )}
        {signoff ? <Badge tone="violet" title={signoff.message}>Budget-owner sign-off</Badge> : <Badge tone="green">Within policy</Badge>}
        {venue.travelMode === "flight" ? <Badge tone="blue">Flight</Badge> : null}
        {venue.mayAvgHighC >= 22 ? <Badge tone="amber">{venue.mayAvgHighC}°C in May</Badge> : <Badge>{venue.mayAvgHighC}°C in May</Badge>}
      </div>

      <p className="mt-3 flex-1 px-5 text-[13px] leading-relaxed text-ink-700">{offer.tradeOff}</p>
      <p className="px-5 pt-2 pb-3.5 text-[11px] text-ink-400">*Illustrative CO2 factor, not a measurement</p>
      {children ? <div className="border-t border-ink-100 bg-ink-50/60 px-5 py-3">{children}</div> : null}
    </article>
  );
}

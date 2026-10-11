import { eventDays } from "./quotes";
import type { Policy, PolicyReason, Quote, Venue } from "./types";

export interface PolicyInput {
  venue: Venue;
  quote: Quote | null;
  nights: number;
  wheelchairUsers: number;
  budgetEur: number | null;
}

export type PolicyStatus = "compliant" | "needs_signoff" | "blocked";

export interface PolicyVerdict {
  venueId: string;
  status: PolicyStatus;
  reasons: PolicyReason[];
}

const eur = (n: number): string => `EUR ${n.toLocaleString("en-US")}`;

/**
 * Company policy as code. Every rule returns a reason with a severity:
 * block (never offer), signoff (offer, but a budget owner signs) or info.
 */
export function evaluatePolicy(input: PolicyInput, policy: Policy): PolicyVerdict {
  const { venue, quote, nights, wheelchairUsers, budgetEur } = input;
  const reasons: PolicyReason[] = [];
  const add = (code: string, severity: PolicyReason["severity"], message: string) =>
    reasons.push({ code, severity, message });

  if (policy.blockedVendorIds.includes(venue.id)) {
    add("blocked_vendor", "block", `${venue.name} is on the blocked vendor list`);
  }
  if (wheelchairUsers > 0 && !venue.stepFree) {
    add("step_free_required", "block", `Not step-free, and the group includes ${wheelchairUsers} wheelchair user${wheelchairUsers > 1 ? "s" : ""}`);
  }
  const days = eventDays(nights);
  if (policy.noFlightsShortEvents && venue.travelMode === "flight" && days <= policy.shortEventMaxDays) {
    add("no_flights_short_events", "block", `Flight destination for a ${days}-day event (policy: no flights for events of ${policy.shortEventMaxDays} days or fewer)`);
  }
  if (quote) {
    if (quote.perGuestEur > policy.perGuestCapEur) {
      add("per_guest_cap", "block", `${eur(quote.perGuestEur)} per guest is over the ${eur(policy.perGuestCapEur)} cap`);
    }
    if (budgetEur !== null && quote.totalEur > budgetEur) {
      add("over_budget", "block", `${eur(quote.totalEur)} is over the request budget of ${eur(budgetEur)}`);
    }
    if (quote.totalEur > policy.signoffThresholdEur) {
      add("signoff_threshold", "signoff", `Over ${eur(policy.signoffThresholdEur)}: needs budget-owner sign-off`);
    }
  } else {
    add("no_quote", "info", "No quote checked yet: price rules not evaluated");
  }
  if (policy.preferredVendorIds.includes(venue.id)) {
    add("preferred_vendor", "info", "Preferred vendor");
  }
  if (policy.expertReviewRequired) {
    add("expert_review", "info", "Expert review before any vendor contact");
  }

  const status: PolicyStatus = reasons.some((r) => r.severity === "block")
    ? "blocked"
    : reasons.some((r) => r.severity === "signoff")
      ? "needs_signoff"
      : "compliant";
  return { venueId: venue.id, status, reasons };
}

/** The subset of the policy that changes agent behaviour, used to key replay fixtures. */
export const policyFingerprint = (policy: Policy): string =>
  JSON.stringify({
    signoff: policy.signoffThresholdEur,
    cap: policy.perGuestCapEur,
    preferred: policy.preferredVendorIds.toSorted(),
    blocked: policy.blockedVendorIds.toSorted(),
    noFlights: policy.noFlightsShortEvents,
    shortDays: policy.shortEventMaxDays,
  });

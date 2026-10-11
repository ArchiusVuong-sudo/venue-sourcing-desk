import { evaluatePolicy } from "../domain/policy";
import type { AgentAnswer, GuardedOffer, Policy, Quote, Venue } from "../domain/types";

/**
 * Checks the agent's answer in code before anyone sees it: every venue must be in
 * the catalog, every price must equal a quote returned in this run, and policy is
 * re-evaluated here rather than trusted from the model. Offers with issues are
 * kept in the record but never shown as offers.
 */
export function guardAnswer(
  answer: AgentAnswer,
  quotes: Map<string, Quote>,
  catalog: Venue[],
  policy: Policy,
): GuardedOffer[] {
  const venues = new Map(catalog.map((v) => [v.id, v]));
  const { understood } = answer;
  return answer.offers.map((offer) => {
    const issues: string[] = [];
    const venue = venues.get(offer.venueId) ?? null;
    let quote: Quote | null = null;
    if (!venue) issues.push(`Venue ${offer.venueId} is not in the catalog`);

    if (offer.quoteStatus === "quoted") {
      quote = offer.quoteId ? quotes.get(offer.quoteId) ?? null : null;
      if (!quote) issues.push(`Quote ${offer.quoteId ?? "(missing)"} was not returned by get_quote in this run`);
      else if (quote.venueId !== offer.venueId) issues.push(`Quote ${quote.quoteId} belongs to another venue`);
      else if (quote.totalEur !== offer.totalEur || quote.perGuestEur !== offer.perGuestEur) {
        issues.push(`Price differs from the quote (shows ${offer.totalEur}, quote says ${quote.totalEur})`);
      }
    } else if (offer.totalEur !== null || offer.perGuestEur !== null) {
      issues.push("Shows a price but has no quote");
    }

    const policyReasons = venue
      ? evaluatePolicy(
          {
            venue,
            quote,
            nights: quote?.nights ?? understood.nights ?? 0,
            wheelchairUsers: understood.wheelchairUsers,
            budgetEur: understood.budgetEur,
          },
          policy,
        ).reasons
      : [];
    for (const reason of policyReasons) {
      if (reason.severity === "block") issues.push(`Policy: ${reason.message}`);
    }
    return { offer, venue, quote, issues, policyReasons };
  });
}

export const visibleOffers = (guarded: GuardedOffer[] | null | undefined): GuardedOffer[] =>
  (guarded ?? []).filter((g) => g.issues.length === 0);

import { createHash } from "node:crypto";
import type { Quote, Venue } from "./types";

export interface QuoteRequest {
  venueId: string;
  guests: number;
  nights: number;
  startDate: string;
  breakoutRooms: number;
}

export class QuoteError extends Error {
  constructor(
    message: string,
    readonly code: "capacity" | "bedrooms" | "breakouts" | "input",
  ) {
    super(message);
  }
}

/** Meeting days: arrival day plus one per night (a day event is 1 day). */
export const eventDays = (nights: number): number => nights + 1;

/** Stable id so a replayed run produces the same quote ids as the recorded one. */
export const quoteIdFor = (req: QuoteRequest): string =>
  "Q-" +
  createHash("sha256")
    .update([req.venueId, req.guests, req.nights, req.startDate, req.breakoutRooms].join("|"))
    .digest("hex")
    .slice(0, 8)
    .toUpperCase();

const round = (n: number): number => Math.round(n);

/** Pure quote math over a venue's rate card. Throws QuoteError on a request the venue cannot host. */
export function priceQuote(venue: Venue, req: QuoteRequest): Quote {
  if (req.guests < 1 || req.nights < 0 || req.breakoutRooms < 0) {
    throw new QuoteError("guests must be at least 1, nights and breakout rooms 0 or more", "input");
  }
  if (req.guests > venue.capacity) {
    throw new QuoteError(`${venue.name} seats ${venue.capacity}, not ${req.guests}`, "capacity");
  }
  if (req.nights > 0 && req.guests > venue.bedrooms) {
    throw new QuoteError(`${venue.name} has ${venue.bedrooms} bedrooms for ${req.guests} guests`, "bedrooms");
  }
  if (req.breakoutRooms > venue.breakoutRooms) {
    throw new QuoteError(`${venue.name} has ${venue.breakoutRooms} breakout rooms, not ${req.breakoutRooms}`, "breakouts");
  }

  const days = eventDays(req.nights);
  const lines = [
    ...(req.nights > 0
      ? [{ label: "Bedrooms, single occupancy", quantity: req.guests * req.nights, unitEur: venue.roomRateEur }]
      : []),
    { label: "Day delegate package (meeting room, lunch, coffee)", quantity: req.guests * days, unitEur: venue.dayDelegateRateEur },
    ...(req.breakoutRooms > 0
      ? [{ label: "Breakout rooms", quantity: req.breakoutRooms * days, unitEur: venue.breakoutRateEur }]
      : []),
    { label: "Group travel estimate, round trip from Berlin", quantity: req.guests, unitEur: venue.travelCostPerGuestEur },
  ].map((line) => ({ ...line, amountEur: round(line.quantity * line.unitEur) }));

  const totalEur = lines.reduce((sum, line) => sum + line.amountEur, 0);
  return {
    quoteId: quoteIdFor(req),
    venueId: venue.id,
    guests: req.guests,
    nights: req.nights,
    startDate: req.startDate,
    breakoutRooms: req.breakoutRooms,
    lines,
    totalEur,
    perGuestEur: round(totalEur / req.guests),
    currency: "EUR",
  };
}

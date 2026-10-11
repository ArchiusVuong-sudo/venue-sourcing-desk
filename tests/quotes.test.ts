import { describe, expect, it } from "vitest";
import { eventDays, priceQuote, quoteIdFor, QuoteError } from "@/lib/domain/quotes";
import { venue } from "./helpers";

describe("priceQuote", () => {
  it("prices rooms, day packages, breakouts and travel per line", () => {
    const v = venue("pmi-olivera"); // 145 room, 76 DDR, 120 breakout, 260 travel
    const q = priceQuote(v, { venueId: v.id, guests: 40, nights: 2, startDate: "2027-05-01", breakoutRooms: 1 });
    expect(q.lines.map((l) => [l.label.split(",")[0], l.quantity, l.amountEur])).toEqual([
      ["Bedrooms", 80, 11_600],
      ["Day delegate package (meeting room", 120, 9_120],
      ["Breakout rooms", 3, 360],
      ["Group travel estimate", 40, 10_400],
    ]);
    expect(q.totalEur).toBe(31_480);
    expect(q.perGuestEur).toBe(787);
    expect(q.currency).toBe("EUR");
  });

  it("has no bedroom line for a day event", () => {
    const v = venue("brl-ziegelwerk");
    const q = priceQuote(v, { venueId: v.id, guests: 60, nights: 0, startDate: "2027-03-01", breakoutRooms: 0 });
    expect(q.lines.some((l) => l.label.startsWith("Bedrooms"))).toBe(false);
    expect(eventDays(0)).toBe(1);
  });

  it.each([
    [{ guests: 61 }, "capacity"],
    [{ guests: 46, nights: 1 }, "bedrooms"],
    [{ breakoutRooms: 4 }, "breakouts"],
    [{ guests: 0 }, "input"],
  ])("rejects a request the venue cannot host: %o", (patch, code) => {
    const v = venue("lis-farol"); // capacity 60, 45 bedrooms, 3 breakouts
    const req = { venueId: v.id, guests: 40, nights: 2, startDate: "2027-05-10", breakoutRooms: 0, ...patch };
    try {
      priceQuote(v, req);
      throw new Error("expected a QuoteError");
    } catch (err) {
      expect(err).toBeInstanceOf(QuoteError);
      expect((err as QuoteError).code).toBe(code);
    }
  });

  it("rejects more guests than bedrooms when there are nights", () => {
    const v = venue("bb-seeblick"); // capacity 26, 20 bedrooms
    expect(() => priceQuote(v, { venueId: v.id, guests: 24, nights: 1, startDate: "2027-06-01", breakoutRooms: 0 })).toThrow(/bedrooms/);
  });

  it("gives the same id for the same request, a new one for a different request", () => {
    const req = { venueId: "x", guests: 10, nights: 1, startDate: "2027-01-01", breakoutRooms: 0 };
    expect(quoteIdFor(req)).toBe(quoteIdFor({ ...req }));
    expect(quoteIdFor(req)).not.toBe(quoteIdFor({ ...req, guests: 11 }));
    expect(quoteIdFor(req)).toMatch(/^Q-[0-9A-F]{8}$/);
  });
});

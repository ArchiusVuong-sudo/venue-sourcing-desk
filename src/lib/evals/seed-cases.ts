import type { CheckSpec } from "./checks";

export interface SeedCase {
  id: string;
  title: string;
  brief: string;
  checks: CheckSpec[];
}

const atLeastTwo: CheckSpec = { kind: "min_offers", min: 2 };

/** Written like an event expert's tickets. Synthetic, for this demo only. */
export const SEED_CASES: SeedCase[] = [
  {
    id: "case-munich-kickoff",
    title: "Munich sales kick-off, 120 guests, 4 breakouts",
    brief:
      "Sales kick-off in or near Munich for 120 people, 1 night, arriving 2027-01-20. We need a plenary room plus 4 breakout rooms for the regional sessions. Budget EUR 70,000 all in.",
    checks: [
      { kind: "fits_headcount", guests: 120 },
      { kind: "min_breakout_rooms", rooms: 4 },
      { kind: "within_budget", budgetEur: 70_000 },
      { kind: "grounded_prices" },
      atLeastTwo,
    ],
  },
  {
    id: "case-berlin-retreat",
    title: "Berlin team retreat, 14 guests",
    brief:
      "Team retreat in Berlin for 14 people, 2 nights from 2027-03-10. Somewhere quiet and inspiring where we can also sleep. Budget EUR 9,000.",
    checks: [
      { kind: "fits_headcount", guests: 14 },
      { kind: "within_budget", budgetEur: 9_000 },
      { kind: "grounded_prices" },
      atLeastTwo,
    ],
  },
  {
    id: "case-lisbon-no-dates",
    title: "Lisbon offsite with no dates or budget",
    brief: "We'd like an offsite near Lisbon for the product team, around 25 people. Can you find something nice?",
    checks: [{ kind: "asks_question" }],
  },
  {
    id: "case-leipzig-blocked",
    title: "Leipzig workshop with a blocked vendor trap",
    brief:
      "Two-day workshop in Leipzig for 30 people, 1 night, arriving 2027-02-16. Keep it as cheap as possible, budget EUR 10,000.",
    checks: [
      { kind: "no_blocked_vendor" },
      { kind: "within_budget", budgetEur: 10_000 },
      { kind: "grounded_prices" },
      atLeastTwo,
    ],
  },
  {
    id: "case-hamburg-board",
    title: "Hamburg board meeting with a failing quote source",
    brief:
      "Board meeting in Hamburg for 12 people, 1 night, arriving 2027-04-08. Quiet and discreet, a harbour view would be lovely. Budget EUR 8,000.",
    checks: [
      { kind: "grounded_prices" },
      { kind: "within_budget", budgetEur: 8_000 },
      atLeastTwo,
    ],
  },
  {
    id: "case-brandenburg-access",
    title: "Brandenburg leadership offsite, wheelchair user and dietary counts",
    brief:
      "Leadership offsite in Brandenburg for 18 people, 2 nights from 2027-06-02. One participant uses a wheelchair. Dietary: 3 vegan, 2 gluten-free. Budget EUR 12,000.",
    checks: [
      { kind: "step_free_only" },
      { kind: "rfp_dietary", counts: [{ label: "vegan", count: 3 }, { label: "gluten-free", count: 2 }] },
      { kind: "within_budget", budgetEur: 12_000 },
      { kind: "grounded_prices" },
      atLeastTwo,
    ],
  },
];

export interface ExampleRequest {
  id: string;
  label: string;
  brief: string;
}

/** Example chips on the Requests page. The offsite has no stored run until someone runs it. */
export const EXAMPLE_REQUESTS: ExampleRequest[] = [
  {
    id: "offsite",
    label: "Sales offsite by the sea, 40 guests",
    brief:
      "Sales offsite for 40 people, 2 nights sometime in May 2027, somewhere warm by the sea. Budget EUR 60,000 all in. 6 of the group are vegetarian and 1 uses a wheelchair.",
  },
  ...SEED_CASES.filter((c) => c.id !== "case-lisbon-no-dates").map((c) => ({ id: c.id, label: c.title, brief: c.brief })),
];

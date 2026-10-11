import type { Policy, Venue } from "./types";

/**
 * Synthetic venue catalog. Every venue, chain and description is invented for
 * this demo; CO2 figures are illustrative round numbers, not measurements.
 */
type VenueSeed = Omit<Venue, "dietary" | "blackouts" | "chain" | "quoteSource" | "coastal"> &
  Partial<Pick<Venue, "dietary" | "blackouts" | "chain" | "quoteSource" | "coastal">>;

const STANDARD_DIET = ["vegetarian", "vegan", "gluten-free"];

const v = (seed: VenueSeed): Venue => ({
  dietary: STANDARD_DIET,
  blackouts: [],
  chain: null,
  quoteSource: seed.chain ? "chain_api" : "direct",
  coastal: false,
  ...seed,
});

const BERLIN = { region: "Berlin", city: "Berlin", travelMode: "local", travelMinutes: 30, co2PerGuestKg: 2, travelCostPerGuestEur: 25, mayAvgHighC: 19 } as const;
const BRANDENBURG = { region: "Brandenburg", travelMode: "car", travelMinutes: 75, co2PerGuestKg: 9, travelCostPerGuestEur: 40, mayAvgHighC: 19 } as const;
const BALTIC = { region: "Baltic coast", travelMode: "train", travelMinutes: 200, co2PerGuestKg: 14, travelCostPerGuestEur: 95, mayAvgHighC: 15, coastal: true } as const;
const LEIPZIG = { region: "Leipzig", city: "Leipzig", travelMode: "train", travelMinutes: 75, co2PerGuestKg: 6, travelCostPerGuestEur: 60, mayAvgHighC: 19 } as const;
const HAMBURG = { region: "Hamburg", city: "Hamburg", travelMode: "train", travelMinutes: 110, co2PerGuestKg: 7, travelCostPerGuestEur: 75, mayAvgHighC: 17 } as const;
const MUNICH = { region: "Munich", travelMode: "train", travelMinutes: 240, co2PerGuestKg: 14, travelCostPerGuestEur: 150, mayAvgHighC: 18 } as const;
const LISBON = { region: "Lisbon coast", travelMode: "flight", travelMinutes: 290, co2PerGuestKg: 310, travelCostPerGuestEur: 290, mayAvgHighC: 23, coastal: true } as const;
const MALLORCA = { region: "Mallorca", travelMode: "flight", travelMinutes: 250, co2PerGuestKg: 280, travelCostPerGuestEur: 260, mayAvgHighC: 24, coastal: true } as const;

export const CHAIN = "Harbourline Hotels";

export const VENUES: Venue[] = [
  // Berlin
  v({ ...BERLIN, id: "brl-hofgarten", name: "Hofgarten Studios", description: "Converted courtyard workshop in Kreuzberg with daylight studios, a quiet garden and its own guest rooms. Calm, creative space for small team retreats and workshops.", capacity: 40, bedrooms: 30, breakoutRooms: 3, dayDelegateRateEur: 72, roomRateEur: 135, breakoutRateEur: 180, stepFree: true }),
  v({ ...BERLIN, id: "brl-lindenufer", name: "Lindenufer Lakehouse", description: "Wooden lakehouse on the western edge of the city with a jetty, sauna and fireplace lounge. Quiet and inspiring, but the upper floors are reached by stairs only.", capacity: 24, bedrooms: 16, breakoutRooms: 2, dayDelegateRateEur: 85, roomRateEur: 160, breakoutRateEur: 160, stepFree: false }),
  v({ ...BERLIN, id: "brl-panorama", name: "Panorama Forum Mitte", description: "Large city conference hotel with a 300-seat plenary hall, ten breakout rooms and a rooftop terrace. Built for big kick-offs and all-hands days.", capacity: 300, bedrooms: 180, breakoutRooms: 10, dayDelegateRateEur: 95, roomRateEur: 175, breakoutRateEur: 260, stepFree: true }),
  v({ ...BERLIN, id: "brl-ziegelwerk", name: "Ziegelwerk Loft", description: "Raw brick loft for day events, product launches and hackathons. No guest rooms on site.", capacity: 80, bedrooms: 0, breakoutRooms: 3, dayDelegateRateEur: 64, roomRateEur: 0, breakoutRateEur: 150, stepFree: true }),
  v({ ...BERLIN, id: "brl-kastanie", name: "Villa Kastanie", description: "Small villa in a leafy district with a library, garden and 14 calm guest rooms. Quiet, inspiring retreat close to the city for leadership and team days.", capacity: 20, bedrooms: 14, breakoutRooms: 2, dayDelegateRateEur: 78, roomRateEur: 145, breakoutRateEur: 140, stepFree: true }),

  // Brandenburg
  v({ ...BRANDENBURG, id: "bb-ahornfeld", city: "Ahornfeld", name: "Schloss Ahornfeld", description: "Restored manor house in a park with a ballroom and four salons. Historic building: most rooms are up stone stairs with no lift.", capacity: 50, bedrooms: 30, breakoutRooms: 4, dayDelegateRateEur: 88, roomRateEur: 150, breakoutRateEur: 170, stepFree: false }),
  v({ ...BRANDENBURG, id: "bb-heidekamp", city: "Heidekamp", name: "Gut Heidekamp", description: "Working farm estate with a barn hall, orchard and farm kitchen. Rustic and relaxed; uneven paths and stairs between buildings.", capacity: 30, bedrooms: 22, breakoutRooms: 3, dayDelegateRateEur: 70, roomRateEur: 120, breakoutRateEur: 120, stepFree: false, dietary: ["vegetarian", "vegan"] }),
  v({ ...BRANDENBURG, id: "bb-waldhaus", city: "Seewalde", name: "Waldhaus am See", description: "Modern forest lodge on a lake with level paths, lifts and accessible rooms. Kitchen cooks vegan and gluten-free as standard. Good for leadership offsites.", capacity: 40, bedrooms: 28, breakoutRooms: 4, dayDelegateRateEur: 76, roomRateEur: 128, breakoutRateEur: 140, stepFree: true }),
  v({ ...BRANDENBURG, id: "bb-seeblick", city: "Lindow", name: "Seeblick Lodge", description: "Lakeside seminar lodge with a glass plenary room, ground-floor rooms and a step-free boardwalk. Quiet setting for offsites of up to 26.", capacity: 26, bedrooms: 20, breakoutRooms: 3, dayDelegateRateEur: 82, roomRateEur: 135, breakoutRateEur: 130, stepFree: true }),

  // Baltic coast (reachable by train, cool in May)
  v({ ...BALTIC, id: "bal-duenenhof", city: "Seebad Heringsdorf", name: "Duenenhof Seebad", chain: CHAIN, description: "Seaside resort hotel behind the dunes with a beach terrace and spa. By the sea and reachable by direct train, but brisk in spring.", capacity: 60, bedrooms: 45, breakoutRooms: 4, dayDelegateRateEur: 84, roomRateEur: 158, breakoutRateEur: 160, stepFree: true }),
  v({ ...BALTIC, id: "bal-seebruecke", city: "Binz", name: "Seebruecke Hotel", description: "Classic white seaside hotel on the promenade next to the pier, sea-view meeting rooms and a beach club. By the sea; cool and windy in May.", capacity: 80, bedrooms: 60, breakoutRooms: 5, dayDelegateRateEur: 90, roomRateEur: 170, breakoutRateEur: 180, stepFree: true }),
  v({ ...BALTIC, id: "bal-kreideklippe", city: "Sassnitz", name: "Kreideklippe Retreat", description: "Clifftop retreat above the chalk coast with a sea-view plenary, sauna and forest walks. Reachable by train; spring is fresh rather than warm.", capacity: 45, bedrooms: 40, breakoutRooms: 3, dayDelegateRateEur: 92, roomRateEur: 175, breakoutRateEur: 150, stepFree: true }),
  v({ ...BALTIC, id: "bal-strandkate", city: "Prerow", name: "Strandkate Camp", description: "Beach cabins and a timber hall in the dunes. Simple and fun, sand paths only, not suitable for wheelchair users.", capacity: 30, bedrooms: 20, breakoutRooms: 2, dayDelegateRateEur: 62, roomRateEur: 110, breakoutRateEur: 90, stepFree: false, dietary: ["vegetarian", "vegan"] }),
  v({ ...BALTIC, id: "bal-hafenspeicher", city: "Warnemuende", name: "Hafenspeicher Warnemuende", description: "Converted harbour warehouse hotel by the sea with six meeting rooms and a lighthouse view. Direct trains from Berlin; cool sea breeze in May.", capacity: 100, bedrooms: 70, breakoutRooms: 6, dayDelegateRateEur: 80, roomRateEur: 150, breakoutRateEur: 170, stepFree: true, blackouts: [{ from: "2027-05-01", to: "2027-05-14" }] }),

  // Leipzig
  v({ ...LEIPZIG, id: "lej-kesselhalle", name: "Kesselhalle Plagwitz", description: "Former boiler hall in the canal district, cheapest workshop space in town with simple rooms upstairs.", capacity: 60, bedrooms: 40, breakoutRooms: 4, dayDelegateRateEur: 55, roomRateEur: 89, breakoutRateEur: 90, stepFree: true }),
  v({ ...LEIPZIG, id: "lej-druckerei", name: "Druckerei Forum", description: "Old print works turned seminar hotel with four workshop rooms, maker space and a canal-side cafe. Good for hands-on workshops.", capacity: 50, bedrooms: 35, breakoutRooms: 4, dayDelegateRateEur: 68, roomRateEur: 112, breakoutRateEur: 120, stepFree: true }),
  v({ ...LEIPZIG, id: "lej-auwald", name: "Auwald Seminarhotel", description: "Seminar hotel at the edge of the floodplain forest with bright workshop rooms and a garden. Calm and well run.", capacity: 40, bedrooms: 40, breakoutRooms: 3, dayDelegateRateEur: 72, roomRateEur: 118, breakoutRateEur: 110, stepFree: true }),

  // Hamburg
  v({ ...HAMBURG, id: "ham-elbblick", name: "Elbblick Boardrooms", quoteSource: "broken_api", description: "Private boardrooms with a harbour view, butler service and suites for board meetings and investor days. Discreet and quiet.", capacity: 20, bedrooms: 16, breakoutRooms: 2, dayDelegateRateEur: 110, roomRateEur: 210, breakoutRateEur: 200, stepFree: true }),
  v({ ...HAMBURG, id: "ham-kaispeicher", name: "Kaispeicher Hotel", chain: CHAIN, description: "Large harbour hotel in a former quay warehouse with six meeting rooms and a boardroom on the top floor. Good transport links.", capacity: 140, bedrooms: 100, breakoutRooms: 6, dayDelegateRateEur: 92, roomRateEur: 165, breakoutRateEur: 190, stepFree: true }),
  v({ ...HAMBURG, id: "ham-alstervilla", name: "Alstervilla Conference", description: "White villa on the lake with a wood-panelled boardroom, garden and 18 rooms. Quiet, discreet setting for board meetings.", capacity: 24, bedrooms: 18, breakoutRooms: 3, dayDelegateRateEur: 98, roomRateEur: 185, breakoutRateEur: 150, stepFree: true }),
  v({ ...HAMBURG, id: "ham-hafenkontor", name: "Hafenkontor Suites", description: "Former shipping office turned boutique hotel with a boardroom for 16, a library and 24 suites. Quiet and central.", capacity: 30, bedrooms: 24, breakoutRooms: 3, dayDelegateRateEur: 94, roomRateEur: 178, breakoutRateEur: 140, stepFree: true }),

  // Munich and the Alps
  v({ ...MUNICH, id: "muc-isarforum", city: "Munich", name: "Isarforum Conference Hotel", chain: CHAIN, description: "Conference hotel by the river with a 250-seat plenary, eight breakout rooms and a large foyer. Built for sales kick-offs.", capacity: 250, bedrooms: 180, breakoutRooms: 8, dayDelegateRateEur: 82, roomRateEur: 155, breakoutRateEur: 210, stepFree: true }),
  v({ ...MUNICH, id: "muc-maelzerei", city: "Munich", name: "Alte Maelzerei Events", description: "Former malt house with a 150-seat hall, five breakout rooms and a hotel next door. Lively venue for kick-offs and parties.", capacity: 150, bedrooms: 120, breakoutRooms: 5, dayDelegateRateEur: 78, roomRateEur: 142, breakoutRateEur: 180, stepFree: true }),
  v({ ...MUNICH, id: "muc-alpenblick", city: "Tegernheim", name: "Alpenblick Tagungshaus", travelMinutes: 300, description: "Conference house in the foothills with mountain views, a 130-seat hall, four breakout rooms and 130 rooms.", capacity: 130, bedrooms: 130, breakoutRooms: 4, dayDelegateRateEur: 88, roomRateEur: 160, breakoutRateEur: 170, stepFree: true }),
  v({ ...MUNICH, id: "muc-atelier", city: "Munich", name: "Schwabing Atelier", description: "Artist studio for day workshops of up to 40. No guest rooms.", capacity: 40, bedrooms: 0, breakoutRooms: 2, dayDelegateRateEur: 66, roomRateEur: 0, breakoutRateEur: 110, stepFree: false }),

  // Lisbon coast (flight, warm in May)
  v({ ...LISBON, id: "lis-farol", city: "Cascais", name: "Casa do Farol", description: "Seafront hotel by a lighthouse with a terrace over the Atlantic, warm and sunny in May, a 60-seat meeting room and accessible rooms.", capacity: 60, bedrooms: 45, breakoutRooms: 3, dayDelegateRateEur: 68, roomRateEur: 132, breakoutRateEur: 130, stepFree: true, blackouts: [{ from: "2027-05-03", to: "2027-05-09" }] }),
  v({ ...LISBON, id: "lis-baia", city: "Sesimbra", name: "Baia Azul Resort", chain: CHAIN, description: "Beach resort in a sunny bay with a large pool, warm sea air, five meeting rooms and step-free paths to the beach.", capacity: 120, bedrooms: 90, breakoutRooms: 5, dayDelegateRateEur: 74, roomRateEur: 140, breakoutRateEur: 150, stepFree: true }),
  v({ ...LISBON, id: "lis-ondas", city: "Ericeira", name: "Quinta das Ondas", description: "Surf estate on the cliffs, warm and relaxed, with a barn meeting room. Terraced site with many steps.", capacity: 35, bedrooms: 28, breakoutRooms: 2, dayDelegateRateEur: 64, roomRateEur: 118, breakoutRateEur: 100, stepFree: false }),

  // Mallorca (flight, warm in May)
  v({ ...MALLORCA, id: "pmi-serena", city: "Cala Serena", name: "Cala Serena Hotel", description: "Hotel above a turquoise cove, warm Mediterranean sun in May, sea-view plenary and four breakout rooms. Lifts and accessible rooms.", capacity: 80, bedrooms: 60, breakoutRooms: 4, dayDelegateRateEur: 70, roomRateEur: 138, breakoutRateEur: 140, stepFree: true, blackouts: [{ from: "2027-05-01", to: "2027-05-16" }] }),
  v({ ...MALLORCA, id: "pmi-olivera", city: "Soller", name: "Finca Olivera", description: "Restored olive estate between the mountains and the sea, warm and sunny, with a pool terrace, a 45-seat hall and ground-floor rooms.", capacity: 45, bedrooms: 40, breakoutRooms: 3, dayDelegateRateEur: 76, roomRateEur: 145, breakoutRateEur: 120, stepFree: true }),
  v({ ...MALLORCA, id: "pmi-llum", city: "Port Llum", name: "Port Llum Conference", chain: CHAIN, description: "Marina-side conference hotel by the sea with a 150-seat hall, six breakout rooms and warm evenings on the harbour.", capacity: 150, bedrooms: 110, breakoutRooms: 6, dayDelegateRateEur: 80, roomRateEur: 150, breakoutRateEur: 170, stepFree: true }),
];

export const DEFAULT_POLICY: Policy = {
  workspace: "Demo Co.",
  expertReviewRequired: true,
  signoffThresholdEur: 20_000,
  perGuestCapEur: 1_200,
  preferredVendorIds: ["brl-kastanie", "bb-waldhaus", "lej-auwald", "pmi-olivera"],
  blockedVendorIds: ["lej-kesselhalle"],
  noFlightsShortEvents: false,
  shortEventMaxDays: 3,
};

export const venueById = (id: string, venues: Venue[] = VENUES): Venue | undefined =>
  venues.find((venue) => venue.id === id);

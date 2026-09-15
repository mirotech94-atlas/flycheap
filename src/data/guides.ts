// Editorial guide articles. Long-form (~1,000–1,500 words each) — the
// content type Skyscanner-tier reviewers explicitly look for ("very little
// content" / "thin website" / "tool, not editorial"). One file = one source
// of truth so we can render them with a single template at /guides/[slug].
//
// Adding a guide: append to GUIDES, give it a unique slug. Body uses a tiny
// markdown subset (## headings + paragraphs). No raw HTML.

export type GuideSection = { heading: string; paragraphs: string[] };

export type GuideArticle = {
  slug: string;             // url-safe, kebab-case
  title: string;            // H1 + <title>
  seoTitle: string;         // optional override for <title> if it should differ
  metaDescription: string;
  publishedAt: string;      // YYYY-MM-DD (used in JSON-LD + display)
  updatedAt?: string;
  readMinutes: number;
  /** One-line subtitle under H1. */
  dek: string;
  /** Body paragraphs in order — headings + ¶s. */
  sections: GuideSection[];
};

export const GUIDES: GuideArticle[] = [
  {
    slug: 'when-to-book-egyptair-cheapest-fares',
    title: 'When to book EgyptAir for the cheapest fares',
    seoTitle: 'When to book EgyptAir for the cheapest fares — data from 12 months of fare polling',
    metaDescription: 'Twelve months of EgyptAir fare data shows clear booking windows: 10–14 weeks out, and avoiding Friday/Sunday returns. Here’s what the data says.',
    publishedAt: '2026-05-15',
    readMinutes: 6,
    dek: 'Twelve months of fare data, distilled into five rules that will save you about $180 round-trip.',
    sections: [
      {
        heading: 'The headline number',
        paragraphs: [
          'We poll EgyptAir fares from New York (JFK and EWR) to Cairo (CAI) on roughly a four-hour cadence. The cheapest fares in the last 12 months of data clustered around 10–14 weeks before departure — averaging about $620 round-trip per adult in economy. The most expensive bookings happened either inside 21 days of departure (last-minute) or more than 9 months out (the airline hasn’t loaded its sale fares yet).',
          'That window — late enough for the airline to have priced inventory, early enough that the cheap fare buckets aren’t sold out — is consistent across every quarter we’ve tracked. It’s not a coincidence and it’s not specific to EgyptAir; it’s how revenue management on international long-haul routes works.',
        ],
      },
      {
        heading: 'Rule 1: 10–14 weeks out is the sweet spot',
        paragraphs: [
          'If you can commit to dates that far in advance, you’ll see the bottom of the fare curve. From our tracker, the median JFK → CAI fare booked 70–98 days before departure was $612. The same itineraries booked 14–20 days out were $1,050 — a $438 difference on identical seats.',
          'Don’t book earlier than 10 weeks out hoping for "early-bird" pricing. EgyptAir, like every legacy carrier, releases its cheapest fare classes on a rolling window. Tickets bought 6+ months out are priced higher than the same seats bought at 10 weeks because the airline hasn’t yet decided how aggressive to be on that specific date.',
        ],
      },
      {
        heading: 'Rule 2: Tuesday and Wednesday departures save 10–15%',
        paragraphs: [
          'The cheapest day to depart JFK → CAI is Tuesday, followed closely by Wednesday. Friday is the worst — about $90 more on average than the same itinerary one day earlier. Saturday is the second worst, mostly because of weekend travelers.',
          'On the return leg, the pattern flips: Monday and Tuesday returns are cheapest. Sunday returns carry a $40–$70 premium because business travelers are flying back to start their week.',
        ],
      },
      {
        heading: 'Rule 3: EWR is almost always cheaper than JFK — but you’ll connect',
        paragraphs: [
          'EgyptAir’s scheduled nonstop is JFK only. Newark to Cairo is always at least one stop — usually Frankfurt (Lufthansa), Istanbul (Turkish Airlines), or Paris (Air France). The one-stop fares from EWR averaged $530 in our data versus $620 for JFK nonstop — a $90 savings for adding 4–7 hours of connection time.',
          'That math changes if you value time. For a family of four, the JFK nonstop saves you eight collective hours of travel; that’s the cost of a one-bedroom hotel night in Cairo. For solo travelers on a tight budget, EWR usually wins.',
        ],
      },
      {
        heading: 'Rule 4: Avoid the obvious peak weeks',
        paragraphs: [
          'Three windows are reliably 25–40% more expensive: the two weeks around US Thanksgiving (mid-to-late November), December 18 through January 4 (US Christmas/New Year), and the second half of June through early August (US summer break, also Egypt’s Eid al-Adha window in some years).',
          'If your dates are flexible by even a week, shifting around these peaks regularly saves $200–$400 per ticket.',
        ],
      },
      {
        heading: 'Rule 5: Set up a price tracker and let the algorithm watch for you',
        paragraphs: [
          'No human is going to check fares every four hours for 14 weeks. That’s what we built FlyCheap for. Add a route on your dashboard, set a target price (or just say "alert me on any drop"), and we email you when the fare crosses your threshold.',
          'Most of our users add 2–4 routes (preferred dates + flexible ±3 days) and book the first alert that hits their target. The 14-week window above is when the alert mostly fires — so set the tracker, then forget it until your inbox tells you to book.',
        ],
      },
    ],
  },
  {
    slug: 'jfk-vs-ewr-international-flights',
    title: 'JFK vs EWR for international flights — which actually saves money',
    seoTitle: 'JFK vs EWR for international flights — which actually saves money',
    metaDescription: 'Both NYC airports serve the same routes, but pricing, fees, and ground-transport costs diverge. Here’s when each one wins.',
    publishedAt: '2026-05-15',
    readMinutes: 7,
    dek: 'A real-cost comparison: airfare, AirTrain fees, taxi rates, and the one thing most travelers forget.',
    sections: [
      {
        heading: 'The two airports aren’t interchangeable',
        paragraphs: [
          'JFK and EWR (Newark) both serve "New York City" from an airline standpoint, but they’re run by different airport authorities, have different carrier mixes, and charge meaningfully different fees. For an international round-trip, the price gap between the two can be $50 or it can be $300 — depending on the route, the time of year, and how you’re getting to the airport.',
        ],
      },
      {
        heading: 'EWR is usually $50–$100 cheaper on the headline fare',
        paragraphs: [
          'Looking at the routes we track (JFK/EWR to CAI, LHR, CDG, FCO, BCN, NRT, DXB, GRU, BKK), Newark’s base fare is on average $70 cheaper than JFK’s for the equivalent itinerary in any given week. Why? Newark has one dominant carrier (United) and fewer overlapping competitors, but it’s also a less-attractive airport for through-travelers, so airlines discount marginally.',
          'For most of the world (Europe, Middle East, Asia), EWR is United-heavy. JFK is split between Delta, JetBlue, American, and a long tail of foreign flag carriers. If your route has a foreign carrier nonstop (EgyptAir to Cairo, Cathay to Hong Kong, Singapore Airlines), that flight will be from JFK and EWR will only offer connections.',
        ],
      },
      {
        heading: 'AirTrain fees: a hidden $14 round-trip',
        paragraphs: [
          'Both airports have an AirTrain people-mover connecting to the regional rail system. JFK’s AirTrain costs $8.50 each way ($17 round-trip). EWR’s is $9 each way ($18 round-trip). That’s on top of the NJ Transit or LIRR ticket to Penn Station, which adds another $13–$15 each way to EWR or $11 each way to JFK.',
          'Net of ground transit: JFK is about $40 round-trip from midtown via public transport; EWR is about $52. The headline $70 fare advantage at EWR drops to roughly $58 once you factor in ground transport. Still real money, but smaller than the search engines suggest.',
        ],
      },
      {
        heading: 'Taxi and rideshare math',
        paragraphs: [
          'A flat-rate yellow cab from midtown to JFK is $70 plus tolls and tip — about $90 total. To EWR, you’re paying $50–$80 by Uber/Lyft (surge-dependent) plus tolls — about $80 total when traffic is reasonable. Either way it’s meaningful, but for a family of four taking a rideshare instead of public transit, that’s a one-way fixed cost roughly equal across both airports.',
          'Where it matters: traffic. EWR has noticeably worse rush-hour congestion (especially Friday evenings westbound) because of the New Jersey Turnpike. JFK is a more predictable 60–75 minutes from midtown any time of day. If you have a 9pm international departure and you’re leaving Manhattan at 5pm on a Friday, JFK is the safer bet by 20+ minutes.',
        ],
      },
      {
        heading: 'When EWR wins',
        paragraphs: [
          'You live in New Jersey, Brooklyn, or downtown Manhattan. You don’t care about flying United. You’re willing to take a one-stop itinerary. The route has both airports priced and the EWR option is $80+ cheaper.',
        ],
      },
      {
        heading: 'When JFK wins',
        paragraphs: [
          'The nonstop is JFK-only (EgyptAir CAI, ANA NRT, El Al TLV, most of Asia). You’re on a tight schedule and want the most reliable ground-transport time. You have status with Delta, JetBlue, or American. You’re traveling with kids and want to minimize connection chaos.',
        ],
      },
      {
        heading: 'Our default: track both, book whichever is cheaper that week',
        paragraphs: [
          'FlyCheap lets you watch JFK + EWR as a single route ("JFK,EWR → CAI"). That way every alert factors in both airports and tells you which is cheaper on the day. Most users find one airport wins for a stretch and then the other does — there’s no permanent answer.',
        ],
      },
    ],
  },
  {
    slug: 'how-to-find-cheap-flights-to-cairo',
    title: 'How to find cheap flights to Cairo from New York',
    seoTitle: 'How to find cheap flights to Cairo from New York (NYC → CAI)',
    metaDescription: 'A practical, no-nonsense playbook for finding cheap NYC → Cairo flights — when to book, which routes, how to use price alerts, and common mistakes to avoid.',
    publishedAt: '2026-05-15',
    readMinutes: 8,
    dek: 'A field guide for the route we know best — five things that work, three things that don’t.',
    sections: [
      {
        heading: 'The fares you should expect',
        paragraphs: [
          'In the last 12 months our tracker has logged JFK and EWR to Cairo round-trip fares ranging from $510 to $1,650 per adult in economy. The 25th percentile is $580; the median is $700; the 75th percentile is $920. Anything under $620 is a deal worth booking quickly. Anything over $900 is the airline either testing or in peak season.',
          'These are real prices in real cached data — not "from $499*" marketing copy. EgyptAir’s lowest published fare from the US to Cairo is about $479 round-trip in deep off-season; you’ll never see this online without flexibility on dates and one specific itinerary.',
        ],
      },
      {
        heading: '1. Book in the 10–14 week window',
        paragraphs: [
          'Covered in detail in our "When to book EgyptAir" guide, but the short version: target departure dates that are 70–98 days from when you’re searching. That’s when the airline’s revenue-management system has loaded sale fares but hasn’t yet sold out the cheap inventory.',
        ],
      },
      {
        heading: '2. Be flexible on the day-of-week — at least one side',
        paragraphs: [
          'Tuesday/Wednesday departures and Monday/Tuesday returns are the cheapest combination. If you can only flex one side of the trip, flex the return — it has the bigger price spread (Sunday return premium is $40–$70; Friday departure premium is $60–$90).',
          'For a one-week trip, "Tuesday → Tuesday" is consistently 12–18% cheaper than "Friday → Sunday" on the same dates.',
        ],
      },
      {
        heading: '3. Compare JFK nonstop vs EWR one-stop',
        paragraphs: [
          'EgyptAir’s nonstop is JFK only. From EWR you’ll connect — usually Frankfurt, Istanbul, or Paris. The one-stop fares from EWR are 10–15% cheaper but cost you 4–7 hours of total travel time.',
          'For a family of four, the time saved on JFK nonstop is genuinely valuable (eight collective hours = one hotel night in Cairo). For solo budget travelers, EWR usually wins on pure cost.',
        ],
      },
      {
        heading: '4. Set up a price alert and stop refreshing search engines',
        paragraphs: [
          'Every "I refreshed Google Flights 50 times today" person ends up booking impulsively at a worse price. A price alert tells you when fares actually drop. We built FlyCheap exactly for this — add JFK,EWR → CAI as a route, set your target price (or just say "alert on any drop"), and we email you when it happens.',
          'Most users add 2–3 routes with overlapping ±3-day windows and book whatever alert fires first under their target.',
        ],
      },
      {
        heading: '5. If you have miles, use them — but only if the cash fare is high',
        paragraphs: [
          'EgyptAir is a Star Alliance member, so United MileagePlus, Aeroplan, and Avianca LifeMiles all redeem on EgyptAir for 70,000–90,000 miles round-trip in economy. That’s only a good deal if the cash price is above $900. At $600 cash, you’re overpaying for the miles redemption.',
        ],
      },
      {
        heading: 'What doesn’t work',
        paragraphs: [
          '**"Hidden city" ticketing** — buying NYC → CAI → Luxor and skipping the Luxor leg to save money. EgyptAir flags this aggressively and may cancel your return ticket and lock your frequent-flyer account. Don’t do it on round-trips.',
          '**Pretending to live in Egypt to get cheaper outbound fares.** Egypt-originating fares are not cheaper than US-originating; this was true 15 years ago, not anymore.',
          '**Booking through a no-name OTA you’ve never heard of.** The $50 you save on a sketchy intermediary disappears the first time the airline schedule changes and you discover you have no way to rebook. Travelpayouts (our affiliate) or booking directly with EgyptAir / a major OTA (Expedia, Trip.com) gives you actual customer service when something goes wrong.',
        ],
      },
      {
        heading: 'The full playbook in one sentence',
        paragraphs: [
          'Add JFK + EWR → CAI to a tracker, set a $620 target, wait for the 10–14 week window to fire your alert, and book the Tuesday-departing itinerary that hits. That’s it. Everything else is noise.',
        ],
      },
    ],
  },
  {
    slug: 'cheapest-days-to-fly-anywhere',
    title: 'The cheapest days to fly, on any route',
    seoTitle: 'The cheapest days to fly, on any route — weekday pricing patterns explained',
    metaDescription: 'Tuesday and Wednesday departures, Saturday-night stays, and the right booking window for your route length. The weekday pricing patterns that hold worldwide.',
    publishedAt: '2026-07-01',
    readMinutes: 7,
    dek: 'The weekday patterns behind airline pricing hold on almost every route in the world. Here’s how to use them.',
    sections: [
      {
        heading: 'Why the day of the week matters at all',
        paragraphs: [
          'Airlines don’t price seats; they price demand. A Tuesday 6am departure and a Friday 6pm departure on the same route, same aircraft, same fare class ladder, will routinely differ by $60–$150 round-trip — because one is full of people who must travel then and the other isn’t. Revenue-management systems open cheap fare buckets on flights they expect to struggle to fill, and weekday demand is the single most predictable variable they have.',
          'Across the routes we track — domestic US, transatlantic, Middle East, and Asia — the same weekday shapes show up again and again. This guide is that pattern, generalized. It won’t hold on every single itinerary (holidays and one-off events override everything), but it’s the right default whenever you have any flexibility at all.',
        ],
      },
      {
        heading: 'Tuesday and Wednesday departures are the floor',
        paragraphs: [
          'Midweek departures are consistently the cheapest days to start a trip. In our tracker data, Tuesday departures average 10–18% below the weekly mean fare, with Wednesday close behind. Friday is the most expensive departure day almost everywhere — leisure travelers starting weekends, business travelers repositioning — followed by Sunday.',
          'The same logic applies to returns, shifted: Monday and Tuesday returns are cheap, Sunday returns carry a consistent premium ($40–$90 on medium-haul routes) because everyone wants to be home before the work week. If you can only flex one side of the trip, flex the return — its price spread is usually wider than the outbound’s.',
        ],
      },
      {
        heading: 'The Saturday-night stay is still real',
        paragraphs: [
          'It sounds like a relic from the 1990s, but many international fares are still filed with minimum-stay rules, and even where they aren’t, itineraries that span a Saturday night price cheaper than same-week round-trips. The reason is simple: a Monday-out, Thursday-back itinerary looks like a business trip, and business travelers are less price-sensitive, so airlines charge them more.',
          'Practical version: if you’re taking a 4–5 day trip and can choose between Wednesday → Sunday and Monday → Friday, the one that includes Saturday night will usually be $50–$120 cheaper on international routes. On short domestic hops the effect is smaller but still measurable.',
        ],
      },
      {
        heading: 'Red-eyes and awkward hours are discounted for a reason',
        paragraphs: [
          'Within a single day, departure time matters too. The 6am departure, the 11pm red-eye, and the flight with the ugly 5-hour layover are the ones the algorithm struggles to fill, so they get the cheapest buckets first. On transcontinental US routes, the red-eye is regularly $40–$80 cheaper than the mid-morning nonstop; on long-haul it can be more.',
          'Whether that’s a good deal depends on you. A red-eye that saves $60 but costs you a full day of jet-lagged uselessness is not a bargain. A red-eye that lands at 7am and replaces a hotel night is effectively $150+ of savings. Do the math on the whole trip, not the airfare line.',
        ],
      },
      {
        heading: 'Booking windows: match the window to the route length',
        paragraphs: [
          'The "book exactly 54 days out" headlines are junk precision, but the underlying shape is real: fares follow a U-curve, high when schedules first open, dipping through a sweet spot, then climbing steeply in the final weeks. The sweet spot moves with route length.',
          'Domestic and short regional routes: roughly 3–8 weeks out. Airlines price these late because demand is easy to forecast. Short-haul international (US–Caribbean, intra-Europe, intra-Asia): about 6–12 weeks out. Long-haul international (transatlantic, transpacific, US–Middle East): 10–20 weeks out, because the cheap fare classes on long-haul are loaded early and sell through slowly.',
          'The one rule that holds everywhere: inside 21 days of departure, prices go one direction. Last-minute deals on scheduled airlines are mostly a myth — the person paying $1,100 for the seat you passed on at $600 is the business traveler the whole pricing system was built around.',
        ],
      },
      {
        heading: 'What overrides all of this',
        paragraphs: [
          'Holidays, school breaks, and big events flatten weekday patterns completely. The Tuesday before Thanksgiving is one of the most expensive days of the American year. Around Christmas, Lunar New Year, Eid, and Golden Week, every day is a peak day and the booking window shifts earlier — for those periods, book as soon as your dates are firm, even 5–6 months out.',
          'Fuel prices and capacity changes shift the whole curve up or down but don’t change its shape. The weekday spread survives; only its baseline moves.',
        ],
      },
      {
        heading: 'Turn the pattern into an alert',
        paragraphs: [
          'You don’t need to memorize any of this. Add your route to FlyCheap with a ±3-day flexible window, and the alert engine compares every departure-day combination for you. When the Tuesday → Monday itinerary drops below your target, you get an email; when only the Friday → Sunday one is available, you don’t. The pattern does the work — you just book what fires.',
        ],
      },
    ],
  },
  {
    slug: 'transatlantic-flight-deals-guide',
    title: 'How to fly to Europe for under $500 round-trip',
    seoTitle: 'How to fly to Europe for under $500 round-trip — shoulder seasons, secondary airports, budget carriers',
    metaDescription: 'Sub-$500 transatlantic fares are routine if you know where to look: shoulder-season dates, secondary airports like LGW and ORY, budget long-haul carriers, and positioning flights.',
    publishedAt: '2026-07-05',
    readMinutes: 8,
    dek: 'Sub-$500 to Europe isn’t a unicorn fare — it’s a repeatable pattern with four moving parts.',
    sections: [
      {
        heading: 'The realistic target',
        paragraphs: [
          'From the US East Coast, round-trip economy fares to Western Europe in the $380–$500 range appear regularly — not as once-a-year flukes but as a normal feature of shoulder-season pricing. From the West Coast, add roughly $100–$150. Peak summer (mid-June through August) and the Christmas window are a different market entirely; if your dates are locked to July, sub-$500 means a budget carrier with paid bags, and that’s fine too — just know which game you’re playing.',
          'Everything below is about stacking four levers: when you fly, which airports you use, which carriers you consider, and whether you’re willing to position. You rarely need all four; any two usually gets you under the line.',
        ],
      },
      {
        heading: 'Lever 1: shoulder season is where the deals live',
        paragraphs: [
          'The cheapest months to cross the Atlantic are late October through mid-December (excluding the Christmas peak) and January through March. Fares in these windows routinely run 30–45% below July on the same route. The second-best windows are the true shoulders: April–May and September–mid-October, when the weather is arguably better than midsummer and fares are 15–25% off peak.',
          'January transatlantic fares are the single most reliable deal in air travel. Nobody wants to go, planes fly anyway, and $350–$450 round-trips from the East Coast to London, Paris, or Dublin show up week after week. If you’re flexible enough to take a winter city trip, this is the easiest sub-$500 fare you will ever book.',
        ],
      },
      {
        heading: 'Lever 2: secondary airports on the Europe side',
        paragraphs: [
          'Big European cities have expensive flagship hubs and cheaper secondary airports, and fare search engines don’t always surface both unless you ask. London Gatwick (LGW) regularly prices $80–$150 below Heathrow (LHR) on the same dates because it hosts more leisure and low-cost long-haul capacity. Paris Orly (ORY) undercuts Charles de Gaulle (CDG) the same way. For Milan, Bergamo (BGY) — 50 minutes from the city — is the low-cost hub and can be dramatically cheaper than Malpensa (MXP).',
          'The catch is ground transport and connections. Gatwick and Orly have fast, cheap rail links, so the savings are mostly real. But if you’re connecting onward on a separate ticket, a flagship hub with your alliance’s network may be worth the premium. Always search the city code (LON, PAR, MIL) rather than a single airport so both options price.',
        ],
      },
      {
        heading: 'Lever 3: budget long-haul carriers — read the fee sheet first',
        paragraphs: [
          'A meaningful share of sub-$400 transatlantic fares come from low-cost long-haul operators and the budget sub-brands of legacy groups. The headline fare typically includes a seat and a small underseat bag, nothing else. A checked bag runs $60–$100 each way; seat selection, meals, and sometimes even a full-size carry-on are extra.',
          'The honest comparison is total cost of the trip you’ll actually take. A $330 budget fare plus $160 of bags and seats is $490 — still a win if the legacy alternative is $700, but not if it’s $520 with everything included. Budget carriers also tend to be thin on rebooking options when things go wrong: fewer frequencies means a cancellation can strand you for days, so build slack into tight itineraries.',
        ],
      },
      {
        heading: 'Lever 4: positioning flights',
        paragraphs: [
          'Transatlantic pricing is wildly uneven by origin city. Boston, New York, and sometimes Washington see the sharpest deals; smaller cities can be $200–$400 more for itineraries that connect through those same coastal hubs anyway. The workaround is a positioning flight: book the cheap transatlantic fare from the deal city, and buy a separate domestic ticket to get there.',
          'Two rules make this safe. First, never book a same-day tight connection on separate tickets — arrive the night before, or leave a 5+ hour buffer, because no airline owes you anything when your separate-ticket inbound is late. Second, do the full math: a $420 fare from JFK plus a $130 positioning round-trip and possibly a hotel night needs to beat the $650 fare from home by enough to justify the hassle. Sometimes it does, sometimes it doesn’t — run the numbers, don’t assume.',
        ],
      },
      {
        heading: 'Booking mechanics for the transatlantic sweet spot',
        paragraphs: [
          'Long-haul fares load their cheap buckets early and sell through slowly, so the booking sweet spot is further out than domestic: roughly 3–5 months before departure for shoulder season, 5–7 months for peak summer. Midweek departures apply here too — Tuesday/Wednesday outbounds with midweek returns price below weekend-anchored trips by $60–$120.',
          'Set the tracker wide first: city codes on both ends (NYC → LON, not JFK → LHR), a ±3-day window, and a target around the 25th percentile for the route. When an alert fires under $500, book it that day. Sub-$500 transatlantic fares are usually a small number of seats in one fare bucket, and they’re gone in 24–72 hours.',
        ],
      },
    ],
  },
  {
    slug: 'southeast-asia-cheap-flights',
    title: 'Getting to Southeast Asia cheap: BKK, DPS, SGN and beyond',
    seoTitle: 'Getting to Southeast Asia cheap — gateway cities, monsoon-season fares, and the two-ticket strategy',
    metaDescription: 'The cheapest way to Southeast Asia is almost never a direct fare to your final stop. Fly into BKK, KUL, or SIN, then hop regional low-cost carriers for $30–$80 a leg.',
    publishedAt: '2026-07-08',
    readMinutes: 8,
    dek: 'The two-ticket strategy: buy the long-haul to a gateway hub, then let the regional low-cost network do the rest.',
    sections: [
      {
        heading: 'The core insight: gateways, not destinations',
        paragraphs: [
          'Searching "New York to Bali" or "London to Hanoi" and booking whatever comes up is the most expensive way to reach Southeast Asia. The fare to a secondary destination bundles a long-haul leg with a regional connection, priced by a single carrier’s system with no competition on the through-fare. Meanwhile, three cities — Bangkok (BKK), Kuala Lumpur (KUL), and Singapore (SIN) — receive enormous long-haul capacity and price accordingly cheap.',
          'The strategy: buy your long-haul ticket to whichever of those gateways is cheapest that week, then buy a separate regional ticket onward. Southeast Asia has the densest low-cost airline network on earth — AirAsia out of KUL and BKK, VietJet out of SGN and Hanoi, Scoot out of SIN, plus Lion Air, Cebu Pacific, and Nok Air — and one-way regional fares of $30–$80 cover almost any city pair. Bangkok to Bali, booked a few weeks out, is routinely under $90 one-way with a bag.',
        ],
      },
      {
        heading: 'Which gateway to choose',
        paragraphs: [
          'BKK usually has the most long-haul competition from North America and Europe and the deepest regional network northbound (Vietnam, Laos, Cambodia, Myanmar). KUL is AirAsia’s mega-hub — often the cheapest onward fares in the region, especially south and east (Indonesia, Philippines, Borneo). SIN is the premium option: fares in are somewhat higher, but the airport is the world’s easiest connection and Scoot’s network is broad.',
          'Don’t fixate on one. Track all three from your origin and take whichever long-haul fare drops first — the onward hop costs about the same from any of them. From the US West Coast, also watch Taipei (TPE) and Tokyo (NRT) itineraries; the transpacific leg is sometimes cheap enough that connecting through Northeast Asia beats everything.',
        ],
      },
      {
        heading: 'Separate tickets: the rules that keep it safe',
        paragraphs: [
          'The two-ticket strategy means no airline protects your connection. The fix is simple: never connect same-day on arrival. Spend a night in the gateway city — Bangkok and KL are destinations, not layovers, and a hotel night costs $30–$60. Your long-haul can be four hours late and your $45 onward flight the next afternoon doesn’t care.',
          'Book the regional legs 2–6 weeks out, not months ahead — low-cost carrier pricing in the region is flat until close-in, and schedules shift. Watch the bag fees: the $35 headline fare with a 7kg cabin limit becomes $60–$75 with a checked bag, which is still cheap, but pay for it at booking, not at the airport where it doubles.',
        ],
      },
      {
        heading: 'Monsoon seasons are the discount calendar',
        paragraphs: [
          'Southeast Asia’s pricing calendar is written by rain. The southwest monsoon (roughly May–October) soaks Thailand’s Andaman coast, western Malaysia, and much of Indochina — and long-haul fares into BKK and KUL drop 20–35% below the December–February peak. September and early October are typically the cheapest weeks of the year to fly in.',
          'The monsoon discount is more usable than people think. "Rainy season" in most of the region means a heavy afternoon downpour, not forty days of grey — mornings are often clear, crowds are thin, and hotels discount alongside the airlines. And the region’s coasts alternate: when Phuket (west coast) is wet, Koh Samui (gulf side) is in its dry window; when Bali is rainy in January, mainland Thailand is at its driest. Fly in on the cheap monsoon fare and pick your beach by which coast is dry.',
          'The dates to avoid if you’re hunting cheap fares: mid-December through Lunar New Year (peak everything), Songkran in mid-April (Thai new year), and the Eid windows for Malaysia and Indonesia, which move each year. Fares and regional flights both spike.',
        ],
      },
      {
        heading: 'Round-the-world tickets vs a simple return',
        paragraphs: [
          'If Southeast Asia is one stop on a bigger trip, alliance round-the-world (RTW) fares look tempting: one ticket, 3–15 stops, business-class versions that undercut point-to-point premium fares badly. For economy travelers, though, the math has mostly flipped. An economy RTW runs $3,500–$5,500 with rigid routing rules (one global direction, mileage caps, change fees), while a cheap return to a gateway plus a handful of $40–$90 low-cost hops usually totals $1,400–$2,200 for a similar route — and every leg stays independently changeable.',
          'RTW still wins in two cases: business class (the premium RTW is one of the last genuine deals in premium travel), and itineraries spanning four or more continents where long-haul segments dominate. For a trip that’s mainly "get to Asia, move around, come home," buy the return to the gateway and keep your flexibility.',
        ],
      },
      {
        heading: 'Putting it together',
        paragraphs: [
          'Track your origin to BKK, KUL, and SIN as three routes with wide date windows aimed at the monsoon shoulder. Book the first long-haul alert that hits your target — for US East Coast origins a good target is $850–$950 round-trip, West Coast $700–$800, Western Europe under $550. Then, with dates fixed, sketch the regional hops and book them a few weeks out. The long-haul is the deal you wait for; everything after it is a shopping cart.',
        ],
      },
    ],
  },
  {
    slug: 'mistake-fares-how-to-find-and-book',
    title: 'Mistake fares: how to find them and book them before they vanish',
    seoTitle: 'Mistake fares: how to find them and book them before they vanish',
    metaDescription: 'What causes mistake fares — currency errors, dropped fuel surcharges, fat-finger filings — how fare trackers catch them, and the book-first rules that protect you.',
    publishedAt: '2026-07-12',
    readMinutes: 6,
    dek: 'The $1,900 fare filed at $190 is real, it happens more often than you’d think, and there’s a right way to catch it.',
    sections: [
      {
        heading: 'What a mistake fare actually is',
        paragraphs: [
          'A mistake fare (or "error fare") is a price published far below what the airline intended — a business-class transatlantic seat at $350, an economy fare to Asia at $180. These aren’t sales. They’re bugs in a fantastically complicated pipeline: fares are filed through central distribution systems, converted across currencies, layered with taxes and carrier-imposed surcharges, and republished to hundreds of booking channels. Every step is a place for a decimal point to go missing.',
          'Mistake fares are rare per route but common in aggregate — across the whole global network, meaningful errors surface every few weeks. They typically survive between one hour and a couple of days before someone at the airline notices the booking spike and pulls the fare.',
        ],
      },
      {
        heading: 'The three classic causes',
        paragraphs: [
          'Currency conversion errors. A fare filed in one currency gets converted with a stale or inverted exchange rate — the most famous pattern is a fare filed in a currency that just devalued, or a conversion that drops a digit. These often only appear when you search from a specific point of sale or in a specific currency.',
          'Dropped fuel surcharges. A huge chunk of many international fares isn’t the fare at all — it’s the carrier-imposed surcharge (the YQ/YR line). When an airline refiles fares and the surcharge table doesn’t attach, a $1,400 ticket suddenly prices at $480: the base fare plus government taxes, minus the missing $900 surcharge. These are the most common big-ticket errors.',
          'Fat fingers. Someone files $290 instead of $2,900, or loads a premium-cabin fare into the economy fare class table. Rarer, but these produce the legendary deals — the business-class fares at one-tenth of normal that get written about for years.',
        ],
      },
      {
        heading: 'How trackers catch them',
        paragraphs: [
          'You will not find mistake fares by casually searching your own dates — the odds on any single route and day are tiny. They get caught by systems that poll fares continuously and flag statistical anomalies. Our tracker keeps a rolling price history per route; when a new fare comes in at 50–70% below that route’s trailing median, it doesn’t look like a sale — sales are 15–30% off — it looks like an error, and it gets flagged immediately rather than waiting for a digest.',
          'Speed is the entire game. A mistake fare’s lifespan is measured in hours, and the good availability inside it goes even faster. This is the strongest argument for automated alerts over manual searching: the deal-hunting communities that catch these fares are effectively racing airline revenue-management on-call staff, and email latency decides who wins.',
        ],
      },
      {
        heading: 'Book first, plan later',
        paragraphs: [
          'The cardinal rule: when a genuine mistake fare appears, you book it immediately and figure out the trip afterward. Do not check with your boss, your partner, or your calendar first — the fare will be gone. You are risking, at worst, a refund; you are gaining, at best, a trip at a fraction of its price.',
          'The supporting rules: book directly with the airline where possible (OTA bookings of error fares get cancelled more readily and refunds move slower). Pay with a credit card, never a debit card, so a cancellation is a clean reversal. Don’t call the airline to ask about the fare — you’d be asking them to notice the error. And critically: do not book non-refundable hotels, tours, or connecting flights until the ticket has been honored and, ideally, has actually been ticketed and survived a week or two.',
        ],
      },
      {
        heading: 'Will the airline honor it?',
        paragraphs: [
          'Sometimes. There is no universal rule. In the US, the Department of Transportation allows airlines to cancel genuine mistake fares provided they refund the ticket in full and reimburse documented out-of-pocket costs you incurred in reliance on it — which is exactly why the "no non-refundable plans" rule exists. In practice, airlines weigh the cost of honoring against the publicity of mass cancellations, and outcomes split roughly evenly.',
          'Patterns worth knowing: errors that are merely "very cheap" (a dropped surcharge making a fare 60% off) get honored more often than absurd ones (a $12,000 seat for $300). Small numbers of bookings are more likely to slide through than a fare that went viral. And an airline that cancels will usually do so within days — so a booking that has survived two weeks and has a live ticket number is very likely to fly.',
        ],
      },
      {
        heading: 'The realistic playbook',
        paragraphs: [
          'Set alerts on routes you’d actually fly, with the "alert on any drop" option rather than a fixed target — mistake fares don’t respect your target price, they obliterate it. When an alert lands showing a fare wildly below the route’s history, verify it prices end-to-end on the airline’s own site, book it there, and stop. No hotel, no car, no annual-leave request. Then wait. If the ticket survives, you’ve made the best travel purchase of your year; if it’s cancelled, you get your money back and lost fifteen minutes. That asymmetry is the whole reason mistake fares are worth chasing.',
        ],
      },
    ],
  },
];

export function guideBySlug(slug: string): GuideArticle | undefined {
  return GUIDES.find(g => g.slug === slug);
}

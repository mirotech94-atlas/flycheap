// Hand-written destination guides. One entry per IATA code we expect to
// receive search traffic for. Used by /destinations/[slug] pages — pure
// editorial content that gives Google and affiliate-program reviewers a real
// "travel website" signal, not just a tool.
//
// Adding a new destination: append an entry. The /destinations/[slug] route
// looks up by lowercase IATA. If no entry exists, the page 404s — better
// than serving thin auto-generated boilerplate.

export type DestinationGuide = {
  iata: string;             // "CAI"
  city: string;             // "Cairo"
  country: string;
  /** SEO title — shown in <title>. Should be route-flavoured. */
  seoTitle: string;
  /** Meta description (~155 chars). */
  metaDescription: string;
  /** One-liner shown under the H1. */
  tagline: string;
  /** Body sections — rendered as <section><h2>…</h2><p>…</p></section>. */
  sections: { heading: string; body: string }[];
  /** Three short bullet "quick facts" — currency, language, best months. */
  quickFacts: { label: string; value: string }[];
};

export const DESTINATIONS: DestinationGuide[] = [
  {
    iata: 'CAI',
    city: 'Cairo',
    country: 'Egypt',
    seoTitle: 'Cheap flights to Cairo (CAI) — fare tracker & travel guide',
    metaDescription: 'Track cheap flights from New York (JFK/EWR) to Cairo. Best time to book EgyptAir, baggage rules, visa, currency, and what to do in Cairo.',
    tagline: 'Egypt’s capital — the gateway to the pyramids, the Nile, and the Sinai.',
    sections: [
      {
        heading: 'When to go',
        body: 'Cairo is hot and dry. The most comfortable months are October through April — daytime highs in the 70s and 80s Fahrenheit, almost no rain, and the desert nights are mild. May through September the city pushes well over 100°F most afternoons. If you’re visiting the pyramids or doing a Nile cruise, late October and March are the sweet spot: good weather, fewer crowds than the December peak, and cheaper hotel rates.',
      },
      {
        heading: 'Getting there',
        body: 'EgyptAir runs a nonstop New York JFK → Cairo flight roughly five days a week (typically a Boeing 777-300ER, 11 hours eastbound, 12 westbound). From Newark (EWR) the only realistic itineraries are one-stop — usually via Frankfurt (Lufthansa), Istanbul (Turkish), or Paris (Air France). One-stop fares are often $200–$400 cheaper than the nonstop, but you add 4–7 hours of connection time. JFK nonstop is by far the most comfortable; price the one-stops when budgets matter.',
      },
      {
        heading: 'Visa & entry',
        body: 'US, UK, EU, Australian, and Canadian passport holders can get a 30-day visa on arrival at Cairo airport for $25 USD (cash, exact change helps). Or buy the e-Visa online before you fly at visa2egypt.gov.eg for the same price — saves you the airport queue. Your passport must have at least six months’ validity remaining.',
      },
      {
        heading: 'Money',
        body: 'The Egyptian Pound (EGP) trades around 48–50 to the US dollar. Skip the airport currency-exchange counters — the rate is terrible. ATMs at Banque Misr and CIB inside Cairo give the official rate. Most mid-range hotels and restaurants take Visa/Mastercard; small shops, taxis, and the souks are cash-only. Tip in cash — 10% at restaurants, 50–100 EGP to porters and drivers.',
      },
      {
        heading: 'What to see',
        body: 'The Giza pyramids and Sphinx are 30 minutes from downtown — go at opening (8am) before the heat and crowds. The new Grand Egyptian Museum opened in late 2024 and is genuinely worth a full day. The Khan el-Khalili bazaar in Islamic Cairo, the Coptic quarter, and a felucca sunset sail on the Nile round out a 4–5 day trip. For a longer stay, fly south to Luxor or Aswan (1-hour EgyptAir domestic flight) for the temples and a Nile cruise.',
      },
    ],
    quickFacts: [
      { label: 'Currency', value: 'Egyptian Pound (EGP) — ~48 per USD' },
      { label: 'Language', value: 'Arabic; English widely spoken in tourist areas' },
      { label: 'Best months', value: 'October–April' },
    ],
  },
  {
    iata: 'NRT',
    city: 'Tokyo',
    country: 'Japan',
    seoTitle: 'Cheap flights to Tokyo (NRT) — fare tracker & travel guide',
    metaDescription: 'Track cheap flights from New York (JFK/EWR) to Tokyo Narita. Best time to book, JR Pass, visa rules, money, and what to do in Tokyo.',
    tagline: 'Modern Japan’s pulse — neon, ramen, shrines, and the world’s best public transit.',
    sections: [
      {
        heading: 'When to go',
        body: 'Spring (late March to mid-April) for cherry blossoms is the most beautiful — and the most expensive. Late October and November bring the autumn foliage and noticeably cheaper flights. Avoid Golden Week (late April / early May) and Obon (mid-August) — domestic travel doubles in price and hotels book solid. Winter is dry, sunny, and 30–50°F in the city; surprisingly pleasant if you don’t mind layers.',
      },
      {
        heading: 'Getting there',
        body: 'JFK has nonstops to both Narita (NRT) and Haneda (HND) on ANA, JAL, and United — 14 hours eastbound, 12.5 hours westbound. Haneda is much closer to central Tokyo (30 min) versus Narita (60–90 min by train), so HND is worth a $50–$100 premium if you can get it. From EWR you’ll usually connect through ICN, NRT, or LAX. EgyptAir does not serve Tokyo directly; routings via Cairo make no sense from the US.',
      },
      {
        heading: 'Visa & entry',
        body: 'US, UK, EU, Australian, and Canadian passports get 90 days visa-free. You’ll fill out an immigration form on the plane and a customs declaration. Japan launched Visit Japan Web — do the digital immigration + customs forms online before you land to skip both queues.',
      },
      {
        heading: 'Money',
        body: 'Japanese Yen (JPY) trades around 155–160 per USD. Japan was famously cash-only for decades but post-pandemic credit-card acceptance is much better. Convenience-store ATMs (7-Eleven, FamilyMart) accept foreign cards 24/7 and have English menus. IC cards (Suica or Pasmo) handle every train, bus, and vending machine — load 5,000 yen on arrival and refill as needed.',
      },
      {
        heading: 'What to see',
        body: 'A first trip wants 4–5 days in Tokyo (Shibuya, Shinjuku, Asakusa, Akihabara, day trip to Kamakura or Nikko) and 2–3 in Kyoto (Fushimi Inari, Arashiyama, the temple loop). The shinkansen Tokyo→Kyoto takes 2h15. If you’re staying mostly in Tokyo, skip the JR Pass — point-to-point tickets are cheaper. Spend on one good kaiseki dinner; eat ramen and conveyor sushi the rest of the trip.',
      },
    ],
    quickFacts: [
      { label: 'Currency', value: 'Japanese Yen (JPY) — ~155 per USD' },
      { label: 'Language', value: 'Japanese; some English in Tokyo and tourist areas' },
      { label: 'Best months', value: 'March–April, October–November' },
    ],
  },
  {
    iata: 'BKK',
    city: 'Bangkok',
    country: 'Thailand',
    seoTitle: 'Cheap flights to Bangkok (BKK) — fare tracker & travel guide',
    metaDescription: 'Track cheap flights from New York (JFK/EWR) to Bangkok Suvarnabhumi. Best time to book, visa rules, money, and what to do in Bangkok and beyond.',
    tagline: 'Southeast Asia’s buzziest hub — street food, temples, and a launchpad to the islands.',
    sections: [
      {
        heading: 'When to go',
        body: 'November to February is dry season — 80s Fahrenheit, low humidity, almost no rain. March to May is brutally hot (often 100°F+) and the worst air-quality period. June to October is the rainy season; afternoon downpours but the city is half-empty and prices drop hard. For beach trips, Phuket and Krabi are best Dec–Apr; Koh Samui on the east coast peaks Feb–Apr and Jul–Sep.',
      },
      {
        heading: 'Getting there',
        body: 'No US carrier flies nonstop to Bangkok. Best routings from JFK/EWR are one-stop via Doha (Qatar), Dubai (Emirates), Hong Kong (Cathay), or Tokyo Haneda (ANA/JAL). Total travel time runs 22–28 hours. Qatar via DOH usually has the cheapest fares; Cathay via HKG has the best on-board experience. The new Bangkok Suvarnabhumi airport (BKK) is 30 minutes from central Bangkok by Airport Rail Link (45 baht ≈ $1.30).',
      },
      {
        heading: 'Visa & entry',
        body: 'US, UK, EU, Australian, and Canadian passports get 60 days visa-free as of mid-2024 (up from the old 30-day rule). Your passport needs six months’ validity. Bring proof of onward travel — Thai immigration occasionally asks, and the airline at check-in almost always does.',
      },
      {
        heading: 'Money',
        body: 'Thai Baht (THB) trades around 35–37 per USD. Use 7-Eleven ATMs (220 THB foreign-card fee, mediocre but ubiquitous) or Bangkok Bank for the lowest fees. Credit cards work in hotels and malls; everything else is cash. Grab and Bolt rideshare apps are cheap and avoid taxi-meter games. Tipping is not customary — rounding up is plenty.',
      },
      {
        heading: 'What to see',
        body: 'A first trip: 3–4 days in Bangkok (Grand Palace, Wat Pho, Chatuchak weekend market, a Chao Phraya river cruise, street food on Sukhumvit Soi 38 or Yaowarat), then fly south for islands (1h flight to Phuket or Krabi, $30–$60). Don’t rent a scooter unless you’ve ridden one before — Thai roads are unforgiving. Long-distance buses and trains are dirt cheap if you have the time; the overnight train Bangkok→Chiang Mai is a classic.',
      },
    ],
    quickFacts: [
      { label: 'Currency', value: 'Thai Baht (THB) — ~36 per USD' },
      { label: 'Language', value: 'Thai; English in tourist areas and hotels' },
      { label: 'Best months', value: 'November–February' },
    ],
  },
  {
    iata: 'DXB',
    city: 'Dubai',
    country: 'United Arab Emirates',
    seoTitle: 'Cheap flights to Dubai (DXB) — fare tracker & travel guide',
    metaDescription: 'Track cheap flights from New York (JFK/EWR) to Dubai. Best time to book Emirates, visa, currency, and what to do in Dubai.',
    tagline: 'The Gulf’s glass-and-sand mega-hub — desert, beach, malls, and a stopover gateway to Asia and Africa.',
    sections: [
      {
        heading: 'When to go',
        body: 'November through March is the only sensible window. Highs in the 70s and 80s, low humidity, the beaches are usable, and the desert is comfortable for day trips and overnight camps. April through October the city is a furnace — frequently 105–115°F with brutal humidity, and most outdoor activity stops by 10am. If you must visit in summer, everything is air-conditioned to refrigerator levels and hotel rates are at their lowest.',
      },
      {
        heading: 'Getting there',
        body: 'Emirates flies JFK → DXB nonstop daily on an A380, plus EWR → DXB nonstop on a 777. About 12.5 hours eastbound, 14.5 westbound. United also runs a JFK nonstop. EgyptAir has one-stop routings via Cairo that occasionally come up cheaper but add 6–10 hours. Dubai’s DXB airport is enormous; allow 90+ min for international connections, longer if changing terminals.',
      },
      {
        heading: 'Visa & entry',
        body: 'US, UK, EU, Australian, and Canadian passports get a free 30-day visa on arrival, extendable to 60 days. Your passport needs six months’ validity. Customs is strict on alcohol (4-liter duty-free limit), prescription meds (bring the prescription), and any printed material that could be considered politically sensitive.',
      },
      {
        heading: 'Money',
        body: 'UAE Dirham (AED) is pegged at 3.67 per USD — never fluctuates. Cards work absolutely everywhere; you can go a full trip without cash. Tipping is appreciated but not expected — 10% at restaurants if service isn’t already added, a few dirhams to taxi drivers. Salik (road toll) is automatic on rental cars; don’t worry about it.',
      },
      {
        heading: 'What to see',
        body: '3–4 days is plenty for first-timers: Burj Khalifa observation deck (book "At The Top SKY" for the highest level), Dubai Mall, the Marina walk, a half-day at Jumeirah or Kite Beach, a desert safari with dune-bashing + Bedouin camp dinner, and the Old Dubai gold-and-spice souks. Skip the Palm monorail; the boardwalk views are better. If you’re stopping over en route to Asia or Africa, even a 30-hour layover is enough for a worthwhile taste.',
      },
    ],
    quickFacts: [
      { label: 'Currency', value: 'UAE Dirham (AED) — fixed at 3.67 per USD' },
      { label: 'Language', value: 'Arabic; English universally spoken' },
      { label: 'Best months', value: 'November–March' },
    ],
  },
  {
    iata: 'LHR',
    city: 'London',
    country: 'United Kingdom',
    seoTitle: 'Cheap flights to London (LHR) — fare tracker & travel guide',
    metaDescription: 'Track cheap flights from New York (JFK/EWR) to London Heathrow. Best time to book, visa, currency, and what to do on a first London trip.',
    tagline: 'The transatlantic standard — most flights, deepest competition, often the cheapest long-haul out of NYC.',
    sections: [
      {
        heading: 'When to go',
        body: 'May, June, and September are the sweet spot — long daylight, mild temperatures (60s–70s), and you’ve missed the peak July/August school-holiday crowds. November to February is cheap and lightly attended but the weather is grey and short-day. December has the Christmas markets and lights working in its favour.',
      },
      {
        heading: 'Getting there',
        body: 'London is the most competitive transatlantic market in the world — six US carriers and British Airways fly JFK and EWR daily, often with 8–10 nonstops per day on each. That competition keeps fares low: $400–$700 round-trip in shoulder season is normal. Most flights land at Heathrow (LHR); a few use Gatwick (LGW). Heathrow is 45 min into central London on the Elizabeth line (£12).',
      },
      {
        heading: 'Visa & entry',
        body: 'US, EU, Australian, and Canadian passports do not need a visa for stays under six months — but as of 2025 the UK requires an Electronic Travel Authorisation (ETA), £10, valid two years. Apply online at gov.uk/eta before you fly; approval is usually instant but allow 72 hours just in case.',
      },
      {
        heading: 'Money',
        body: 'British Pound (GBP) trades around 0.78 per USD ($1 = £0.78). Contactless cards work on every bus, tube, train, and most cabs — link a Visa or Mastercard to Apple Pay or Google Pay and you’re set. Cash is rarely needed. Tipping is light: 10% if not already added at restaurants, round up cabs.',
      },
      {
        heading: 'What to see',
        body: 'A first trip needs at least 5 days: a museum day (British Museum or V&A — both free), Westminster and the Tower of London, an evening at a West End show, a day trip to Oxford or Bath, and a Sunday roast in a proper pub. The London Pass is rarely worth it unless you’re cramming five paid attractions into one day.',
      },
    ],
    quickFacts: [
      { label: 'Currency', value: 'British Pound (GBP) — ~£0.78 per USD' },
      { label: 'Language', value: 'English' },
      { label: 'Best months', value: 'May–June, September' },
    ],
  },
  {
    iata: 'CDG',
    city: 'Paris',
    country: 'France',
    seoTitle: 'Cheap flights to Paris (CDG) — fare tracker & travel guide',
    metaDescription: 'Track cheap flights from New York (JFK/EWR) to Paris Charles de Gaulle. Best time to book, money, and what to do in Paris.',
    tagline: 'The original Grand Tour stop — 5 days, three museums, and a lot of walking.',
    sections: [
      {
        heading: 'When to go',
        body: 'Late April through June is the best window — leaves are out, café terraces are open, and you’ve missed the August "everyone’s on holiday" emptying-out and the July tourist peak. September is also lovely and slightly cheaper. December has the Christmas lights on the Champs-Élysées. January and February are cold, grey, and bargain season.',
      },
      {
        heading: 'Getting there',
        body: 'JFK and EWR each have multiple nonstops daily — Air France, Delta, United, La Compagnie (all-business). Flight time is 7 hours eastbound, 8 westbound — shortest long-haul out of the East Coast. CDG to central Paris is 35 minutes on RER B (€11.80) or 45 minutes by taxi (€56 flat rate to right bank, €65 left bank).',
      },
      {
        heading: 'Visa & entry',
        body: 'US, UK, Australian, and Canadian passports get 90 days visa-free in the Schengen zone (which includes France). Starting in late 2026, the EU is rolling out ETIAS — a $7 authorisation similar to the US ESTA. Until then, no pre-travel paperwork is required.',
      },
      {
        heading: 'Money',
        body: 'Euro (EUR) trades around 0.92 per USD. Cards work everywhere; cash is mostly for tipping (€2–€5 at restaurants where service is already included by law, round up cabs). The Paris Métro/RER is the cheapest way to get around — buy a Navigo Easy card (€2) and load it with carnet tickets (10 for €17.35).',
      },
      {
        heading: 'What to see',
        body: 'First trip: Louvre (book the 9am slot; budget 3 hours, see the 10 things you came for, leave), Orsay, the Tuileries / Rive Gauche walk, Notre-Dame exterior (interior reopened late 2024), a sunset Seine cruise, and a day trip to Versailles (book skip-the-line ahead). The Eiffel Tower is best seen from a distance — Trocadéro at golden hour or the Champ de Mars with a picnic.',
      },
    ],
    quickFacts: [
      { label: 'Currency', value: 'Euro (EUR) — ~€0.92 per USD' },
      { label: 'Language', value: 'French; English in tourist areas' },
      { label: 'Best months', value: 'April–June, September' },
    ],
  },
  {
    iata: 'IST',
    city: 'Istanbul',
    country: 'Turkey',
    seoTitle: 'Cheap flights to Istanbul (IST) — fare tracker & travel guide',
    metaDescription: 'Track cheap flights from New York (JFK/EWR) to Istanbul. Turkish Airlines nonstop, visa, lira, and what to do in old and new Istanbul.',
    tagline: 'Where Europe meets Asia — Byzantine churches, Ottoman mosques, and the best food bargain in the Mediterranean.',
    sections: [
      {
        heading: 'When to go',
        body: 'April through June and September through October are the sweet spots — 65–80°F, the tulips and Bosphorus weather both cooperate, and the cruise-ship crowds are lighter. July and August are hot, humid, and packed. November to March is mild but rainy; the upside is that hotel rates drop by half and the Grand Bazaar is finally walkable without elbows.',
      },
      {
        heading: 'Getting there',
        body: 'Turkish Airlines runs daily JFK and EWR nonstops on a Boeing 777-300ER — about 10 hours eastbound, 11 westbound. United also flies a JFK nonstop in summer. Istanbul Airport (IST) replaced the old Atatürk in 2019; it’s 45 km from Sultanahmet (90 min by Havaist bus, 45 by taxi, ~€30). The brand-new metro line opened in 2023 and runs into central Istanbul in about an hour.',
      },
      {
        heading: 'Visa & entry',
        body: 'US, UK, Canadian, and Australian passport holders need an e-Visa — $50, done online at evisa.gov.tr in about three minutes, valid 180 days. EU passport holders enter visa-free. Your passport needs six months’ validity past your return date. The e-Visa is single-entry; if you’re hopping to Greek islands and coming back, get a multi-entry.',
      },
      {
        heading: 'Money',
        body: 'Turkish Lira (TRY) is highly volatile — it’s traded anywhere from 25 to 40 per USD in the past two years and currently sits around 38. Inflation is wild; restaurant prices change every few months. Use ATMs (Garanti BBVA and Akbank are reliable, low fees) and avoid the currency-exchange booths near the Hagia Sophia which give terrible rates. Cards work in mid-range and up; the bazaar and street food are cash-only.',
      },
      {
        heading: 'What to see',
        body: 'Five days minimum for a proper first trip: Hagia Sophia and the Blue Mosque (free, dawn for the call to prayer is unforgettable), Topkapi Palace (half-day, get the harem ticket), the Basilica Cistern (newly reopened, atmospheric), Grand Bazaar and Spice Bazaar, a Bosphorus ferry to the Asian side (Kadıköy for dinner), and a hamam at Çemberlitaş. Skip the "Turkish Night" tourist-trap dinner shows; eat at a meyhane (tavern) in Nevizade alley instead.',
      },
    ],
    quickFacts: [
      { label: 'Currency', value: 'Turkish Lira (TRY) — ~38 per USD (volatile)' },
      { label: 'Language', value: 'Turkish; some English in tourist areas' },
      { label: 'Best months', value: 'April–June, September–October' },
    ],
  },
  {
    iata: 'FCO',
    city: 'Rome',
    country: 'Italy',
    seoTitle: 'Cheap flights to Rome (FCO) — fare tracker & travel guide',
    metaDescription: 'Track cheap flights from New York (JFK/EWR) to Rome Fiumicino. Best time to book, visa, what to do in Rome, and day trips.',
    tagline: '2,800 years of layered history — the Forum, the Vatican, the carbonara that ruins all other carbonara.',
    sections: [
      {
        heading: 'When to go',
        body: 'April, May, and October are ideal — 65–75°F, low rain, and the Roman sky takes on that warm gold the Renaissance painters made famous. June through August is hot (high 80s, occasionally 100°F) and the crowds at the Vatican and Colosseum are punishing. Late November through February is cheap, often surprisingly mild, and the city is finally calm; many trattorias close for two weeks at Christmas though, so plan around that.',
      },
      {
        heading: 'Getting there',
        body: 'Delta, ITA Airways (the post-Alitalia carrier), and United run daily JFK nonstops to Rome Fiumicino (FCO). Flight time is about 8.5 hours eastbound, 10 westbound. From FCO into central Rome, the Leonardo Express train is the move — 32 minutes, €14, leaves every 15. Taxi has a flat €55 rate to anywhere inside the Aurelian walls.',
      },
      {
        heading: 'Visa & entry',
        body: 'US, UK, Australian, and Canadian passports get 90 days visa-free in the Schengen zone (Italy is in). ETIAS (the EU’s ESTA equivalent, ~$7) is rolling out in late 2026. Passport needs three months’ validity beyond your departure date.',
      },
      {
        heading: 'Money',
        body: 'Euro (EUR) — same as Paris, ~€0.92 per USD. Cash is more useful in Rome than in northern Europe — many small osterie, espresso bars, and outdoor markets are cash-only or cash-preferred. The Metro is €1.50 a ride or €7 for a 24-hour pass; buy tickets in advance from tabacchi stands or risk a €50 fine on the bus.',
      },
      {
        heading: 'What to see',
        body: 'Five days minimum: Colosseum + Forum + Palatine combo (book the first 8:30am slot online), Vatican Museums + Sistine Chapel + St. Peter’s (a full day, book in advance — long lines without), Pantheon, Trastevere for dinner one night, the Borghese Gallery (timed tickets, two-hour window, museum is small but stunning). A day trip to Tivoli (Villa d’Este’s gardens) or to Naples for pizza and Pompeii is well worth a day. Eat trapizzino, drink negroni sbagliato, ignore anyone who tries to sell you a "scenic taxi tour."',
      },
    ],
    quickFacts: [
      { label: 'Currency', value: 'Euro (EUR) — ~€0.92 per USD' },
      { label: 'Language', value: 'Italian; English in tourist areas' },
      { label: 'Best months', value: 'April–May, October' },
    ],
  },
  {
    iata: 'GRU',
    city: 'São Paulo',
    country: 'Brazil',
    seoTitle: 'Cheap flights to São Paulo (GRU) — fare tracker & travel guide',
    metaDescription: 'Track cheap flights from New York (JFK/EWR) to São Paulo Guarulhos. Best time to book, visa, money, and what to do in Brazil’s biggest city.',
    tagline: 'Brazil’s economic engine — overlooked by tourists, beloved by food critics, and the gateway to the rest of South America.',
    sections: [
      {
        heading: 'When to go',
        body: 'São Paulo is south of the equator, so seasons flip. The mildest months are April through October — daytime highs 65–75°F, low humidity, almost no rain. Brazilian summer (December–February) is humid and frequently 90°F+. Carnaval (late February or early March) is fun in Rio but a non-event in São Paulo — the city empties out instead. Avoid if you wanted festival energy.',
      },
      {
        heading: 'Getting there',
        body: 'LATAM, Delta, American, and United all fly JFK → GRU nonstop daily — about 10 hours southbound, 9 northbound. From EWR, United runs nonstops; everyone else connects. GRU airport is 25 km from central São Paulo (45 min by airport bus, 60–90 min by Uber depending on traffic, which is famously bad). Most international travelers connect at GRU on to Rio (GIG), Buenos Aires (EZE), or the Amazon (MAO).',
      },
      {
        heading: 'Visa & entry',
        body: 'As of 2025 Brazil requires US, Canadian, and Australian passport holders to obtain an e-Visa before arrival — $80, done online at vfsglobal.com, takes 5 business days. EU and UK passports are visa-free. Six months’ passport validity required. The e-Visa is valid 10 years and multi-entry, so it’s worth the money if you’re visiting more than once.',
      },
      {
        heading: 'Money',
        body: 'Brazilian Real (BRL) trades around 5.5 per USD. Pix (the instant-payment system) is dominant — locals rarely use cash even for street food. ATMs from Bradesco, Itaú, and Banco do Brasil work with foreign cards, though daily withdrawal limits are low (~R$1,000 per transaction). Carry small cash for taxis and feiras (markets). Uber works flawlessly and is cheaper than taxis.',
      },
      {
        heading: 'What to see',
        body: 'São Paulo isn’t a "monuments" city — it’s a food, art, and nightlife city. Three days is enough: Avenida Paulista (Sunday morning, when it’s closed to cars), MASP (the floating art museum), Vila Madalena for street art and bars, Liberdade (the world’s largest Japanese diaspora neighborhood, great ramen), and one extraordinary churrascaria dinner. Day-trip to Paraty or the beach at Ubatuba if you want greenery. Then fly on to Rio or somewhere else — São Paulo is the start of the trip, not the whole trip.',
      },
    ],
    quickFacts: [
      { label: 'Currency', value: 'Brazilian Real (BRL) — ~R$5.5 per USD' },
      { label: 'Language', value: 'Portuguese; English limited outside hotels' },
      { label: 'Best months', value: 'April–October' },
    ],
  },
  {
    iata: 'BCN',
    city: 'Barcelona',
    country: 'Spain',
    seoTitle: 'Cheap flights to Barcelona (BCN) — fare tracker & travel guide',
    metaDescription: 'Track cheap flights from New York (JFK/EWR) to Barcelona. Best time to book, visa, money, and what to do in Gaudí’s city.',
    tagline: 'Gaudí, tapas, and a beach inside the city — the Mediterranean weekend that never disappoints.',
    sections: [
      {
        heading: 'When to go',
        body: 'May, June, September, and October are perfect — 70–80°F, the sea is warm enough to swim, and the city is in its element. July and August are crowded, humid, and a lot of locals leave for the countryside, taking the best restaurants with them. November to March is cool (50s) and quiet; you’ll have the Sagrada Família mostly to yourself, but the beach is over.',
      },
      {
        heading: 'Getting there',
        body: 'United, Delta, American, and Level (the long-haul low-cost carrier) all run JFK and EWR nonstops to Barcelona-El Prat (BCN). About 8 hours eastbound, 9.5 westbound. The Aerobús to Plaça de Catalunya is €7.25 and takes 35 minutes. Metro L9 Sud also connects the airport but takes longer (45–60 min) for €5.50.',
      },
      {
        heading: 'Visa & entry',
        body: 'Same Schengen rules as Paris and Rome — 90 days visa-free for US/UK/Australian/Canadian passports, ETIAS rolling out late 2026. Six months’ passport validity recommended.',
      },
      {
        heading: 'Money',
        body: 'Euro again, ~€0.92 per USD. Cards work nearly everywhere; cash mostly useful for small tapas bars and tipping (round up — 5–10% is generous in Spain). The Hola Barcelona transit pass is genuinely worth it: €18 for unlimited metro/bus over 72 hours, includes the airport.',
      },
      {
        heading: 'What to see',
        body: 'Five days: Sagrada Família (book online, get the upper-tower add-on), Park Güell (timed tickets), Casa Batlló and La Pedrera (pick one — they overlap), the Gothic Quarter and El Born walk, a tapas crawl in El Raval, a beach afternoon at Bogatell (avoid the more touristy Barceloneta), and a day trip to Montserrat or the Costa Brava. Don’t eat dinner before 9pm — restaurants are dead and you’ll look like a tourist.',
      },
    ],
    quickFacts: [
      { label: 'Currency', value: 'Euro (EUR) — ~€0.92 per USD' },
      { label: 'Language', value: 'Catalan + Spanish; English widely spoken' },
      { label: 'Best months', value: 'May–June, September–October' },
    ],
  },
  {
    iata: 'AMS',
    city: 'Amsterdam',
    country: 'Netherlands',
    seoTitle: 'Cheap flights to Amsterdam (AMS) — fare tracker & travel guide',
    metaDescription: 'Track cheap flights from New York (JFK/EWR) to Amsterdam Schiphol. Best time to book, visa, money, and what to do in the canal city.',
    tagline: 'Canals, museums, bicycles, and Europe’s best-connected airport for onward connections.',
    sections: [
      {
        heading: 'When to go',
        body: 'April to June and September are the sweet spots — long daylight, mild temperatures (60s–70s), and tulip season runs late March through mid-May (peak around April 20). July and August are warm and busy. November to February is dark and damp — daylight is gone by 4pm in December — but Christmas markets and ice skating on the canals (some years) make it atmospheric.',
      },
      {
        heading: 'Getting there',
        body: 'Delta, KLM, United, and JetBlue all run JFK and EWR nonstops to Amsterdam Schiphol — 7 hours eastbound, 8 westbound, the shortest long-haul out of NYC after Iceland. Schiphol is 15 minutes to Centraal Station on the direct train (€5.90). AMS is also Europe’s best connection hub, so even if you’re going elsewhere it’s often the cheapest way in.',
      },
      {
        heading: 'Visa & entry',
        body: 'Schengen rules — same as Paris/Rome/Barcelona. 90 days visa-free for US/UK/Australian/Canadian passports.',
      },
      {
        heading: 'Money',
        body: 'Euro, ~€0.92 per USD. The Netherlands is one of the most cashless countries in Europe — even some places refuse cash entirely. Bring a tap-to-pay card or phone wallet. The OV-chipkaart (transit card) is being replaced by direct contactless payment on trams, buses, and trains; just tap your card on entry and exit.',
      },
      {
        heading: 'What to see',
        body: 'Three or four days is plenty: Rijksmuseum (book a morning slot for Vermeer’s Milkmaid and Rembrandt’s Night Watch), Van Gogh Museum (separate building, also book ahead), Anne Frank House (book the moment tickets release 6 weeks ahead — they sell out fast), a canal cruise at dusk, the Jordaan neighborhood for cafés and antique shops. Day-trip to Haarlem (15 min by train) for the windmills and a more relaxed Dutch town.',
      },
    ],
    quickFacts: [
      { label: 'Currency', value: 'Euro (EUR) — ~€0.92 per USD' },
      { label: 'Language', value: 'Dutch; English near-universal (best in Europe)' },
      { label: 'Best months', value: 'April–June, September' },
    ],
  },
  {
    iata: 'FRA',
    city: 'Frankfurt',
    country: 'Germany',
    seoTitle: 'Cheap flights to Frankfurt (FRA) — fare tracker & travel guide',
    metaDescription: 'Track cheap flights from New York (JFK/EWR) to Frankfurt. Best time to book, money, what to do, and using FRA as a connection hub.',
    tagline: 'Germany’s financial capital and Europe’s busiest cargo airport — primarily a connection hub, but the city itself rewards a 2-day stop.',
    sections: [
      {
        heading: 'When to go',
        body: 'May, June, and September are the most pleasant — 65–75°F, long daylight, no rain. December has the famous Christmas market (Römerberg), one of the oldest in Germany — worth a trip on its own. July and August are warm but pleasant. Winter outside Christmas is cold and grey.',
      },
      {
        heading: 'Getting there',
        body: 'Lufthansa, United, Delta, Singapore, and Cathay all use FRA as a major hub, so JFK and EWR nonstops are frequent and competitively priced. About 7.5 hours eastbound, 9 westbound. FRA airport is 12 minutes from the city center on S-Bahn lines S8 and S9 — €5.80 per ride.',
      },
      {
        heading: 'Visa & entry',
        body: 'Schengen rules. 90 days visa-free for US/UK/Australian/Canadian passports.',
      },
      {
        heading: 'Money',
        body: 'Euro, ~€0.92 per USD. Germany still loves cash — many restaurants, smaller shops, and even some hotels refuse cards. Get euros at an ATM in the airport arrivals hall. Cards do work at chains, train stations, and most attractions.',
      },
      {
        heading: 'What to see',
        body: 'Frankfurt isn’t the postcard Germany — that’s Munich or the Romantic Road. Two days is honest: the Römerberg medieval square, the Städel Museum (one of Germany’s best), an Apfelwein in Sachsenhausen, the Main river embankment walk, and Goethe’s house. Then take a 90-minute ICE train to the Rhine wine country, Heidelberg, or onward to Cologne. Use FRA as a gateway, not a destination, unless you’re here on business.',
      },
    ],
    quickFacts: [
      { label: 'Currency', value: 'Euro (EUR) — ~€0.92 per USD' },
      { label: 'Language', value: 'German; English widely spoken' },
      { label: 'Best months', value: 'May–June, September, December (markets)' },
    ],
  },
  {
    iata: 'MAD',
    city: 'Madrid',
    country: 'Spain',
    seoTitle: 'Cheap flights to Madrid (MAD) — fare tracker & travel guide',
    metaDescription: 'Track cheap flights from New York (JFK/EWR) to Madrid. Best time to book, money, what to do in Madrid, and day trips.',
    tagline: 'Spain’s sunlit capital — world-class art, late-night life, and a working-class energy Barcelona doesn’t have.',
    sections: [
      {
        heading: 'When to go',
        body: 'April, May, June, and late September through October are ideal — 70–85°F, dry, and the sky is the Mediterranean’s most reliable blue. July and August are punishing (often 95–105°F), and locals leave for the coast. November to March is cool (40s–50s) but sunny; lower hotel prices and the city is alive with locals.',
      },
      {
        heading: 'Getting there',
        body: 'Iberia, American, Air Europa, and United run daily JFK nonstops to Madrid Barajas (MAD). About 8 hours eastbound, 9 westbound. Metro Line 8 from the airport to Nuevos Ministerios is €5 and 15 minutes. The Cercanías commuter rail from T4 to Atocha is €2.60. Taxis are flat-rate €33 from airport to city center.',
      },
      {
        heading: 'Visa & entry',
        body: 'Schengen — 90 days visa-free for US/UK/Australian/Canadian passports.',
      },
      {
        heading: 'Money',
        body: 'Euro, ~€0.92 per USD. Cards work most places; cash useful for tipping (round up; 5% is plenty), small tapas bars, and traditional markets. The Madrid Metro is the cheapest in Western Europe at €1.50–€2 a ride; a 10-trip card is €12.20.',
      },
      {
        heading: 'What to see',
        body: 'Four days: Prado (a half-day; Velázquez and Goya are the must-sees), Reina Sofía (Picasso’s Guernica), Thyssen-Bornemisza (the third of the "Golden Triangle"), Retiro Park, a Sunday walk through El Rastro flea market, and tapas hopping in La Latina or Lavapiés. Day-trip to Toledo (30 min on the AVE train) for medieval architecture, or Segovia for the aqueduct and a famous suckling-pig lunch. Eat dinner at 10pm like everyone else.',
      },
    ],
    quickFacts: [
      { label: 'Currency', value: 'Euro (EUR) — ~€0.92 per USD' },
      { label: 'Language', value: 'Spanish; English in tourist areas' },
      { label: 'Best months', value: 'April–June, late September–October' },
    ],
  },
  {
    iata: 'ATH',
    city: 'Athens',
    country: 'Greece',
    seoTitle: 'Cheap flights to Athens (ATH) — fare tracker & travel guide',
    metaDescription: 'Track cheap flights from New York (JFK/EWR) to Athens. Best time to book, visa, money, what to do, and using Athens as a gateway to the islands.',
    tagline: 'The Acropolis, fresh octopus, and your ferry to Santorini and Mykonos.',
    sections: [
      {
        heading: 'When to go',
        body: 'May, June, and September are ideal — 75–85°F, the sea is warm enough, and you’ve missed the worst of summer crowds. July and August are hot (90s+), the Acropolis is brutal by noon, and the islands are jammed. October is still warm and ferry schedules are running. Winter (November–March) is mild (50s) and dirt cheap, but most islands shut down and ferry frequency drops.',
      },
      {
        heading: 'Getting there',
        body: 'Emirates (via Newark), United (JFK), Delta (JFK seasonal), and American codeshares serve Athens. Nonstop is 9.5 hours eastbound, 10.5 westbound. From the airport (ATH), Metro Line 3 to Syntagma Square is €9 one-way and takes 40 minutes. Taxi flat-rate is €40 daytime, €55 night.',
      },
      {
        heading: 'Visa & entry',
        body: 'Schengen — 90 days visa-free for US/UK/Australian/Canadian passports. Many travelers fly into Athens, do 2–3 days, then ferry to Santorini/Mykonos/Crete (those are still inside Schengen — no extra paperwork).',
      },
      {
        heading: 'Money',
        body: 'Euro, ~€0.92 per USD. Cards work in hotels and bigger restaurants; cash needed for tavernas, kiosks, and some ferries. Tipping is light — round up or 5–10%. ATMs from Alpha Bank or Piraeus Bank are reliable; avoid the Euronet machines tourists flock to (terrible rates).',
      },
      {
        heading: 'What to see',
        body: 'Three days in Athens is plenty: Acropolis at opening (8am, before tour buses arrive), Acropolis Museum, the Plaka neighborhood for dinner, the National Archaeological Museum (under-visited, world-class), and a day at Cape Sounion for the Temple of Poseidon at sunset. Then ferry to an island for 4–6 days — Santorini and Mykonos are famous and expensive, Naxos and Milos are quieter and cheaper, Crete combines ruins and beach.',
      },
    ],
    quickFacts: [
      { label: 'Currency', value: 'Euro (EUR) — ~€0.92 per USD' },
      { label: 'Language', value: 'Greek; English widely spoken in tourist areas' },
      { label: 'Best months', value: 'May–June, September–October' },
    ],
  },
];

export function destinationBySlug(slug: string): DestinationGuide | undefined {
  const iata = slug.toUpperCase();
  return DESTINATIONS.find(d => d.iata === iata);
}

export function destinationByIata(iata: string): DestinationGuide | undefined {
  return DESTINATIONS.find(d => d.iata === iata.toUpperCase());
}

/** English source dictionary for /early-access. Other locales must match these keys. */
export const en = {
  nav: { why: 'Why FlyCheap', how: 'How it works', who: 'Who it’s for', signin: 'Log in', cta: 'Get early access →', demo: 'Demo' },
  hero: {
    pill: 'AI-native fare intelligence — founding-member access',
    h1a: 'Overpaying for flights', h1b: 'stops here.',
    sub: 'The cheap fare shows up at 2 AM and is gone by breakfast. FlyCheap watches 1,000+ airlines on every route you care about — and pings you the moment a price drops below your number, with a buy-or-wait verdict.',
    cta: 'Get early access', secondary: 'See how it works',
  },
  feed: { title: 'Live fare feed', live: 'LIVE', empty: 'Scanning routes…', typical: 'vs typical', at: 'at typical', foot: 'Cheapest round-trip found per route · refreshed every poll', lastPoll: 'last poll {n} min ago', tagLow: 'LOW', tagDrop: 'DROP' },
  logos: { data: 'Fare data straight from', book: 'Book through' },
  problem: {
    eyebrow: 'The problem', h2a: 'The cheapest fare never', h2b: 'looks like a deal when you see it.',
    sub: 'No sale banner. No countdown. Just a number that was $260 lower six hours ago.',
    quotes: ['“I looked Tuesday. It was $200 cheaper on Friday.”', '“Refreshed Google Flights at 2 AM. Again.”', '“Saw $412 in the morning, paid $689 that night.”', '“Booked, then watched it drop the next week.”'],
    closeA: 'Airlines reprice dozens of times a day. The good fares last hours.', closeB: 'Nobody can watch that by hand — a machine can.',
  },
  diff: {
    eyebrow: 'The FlyCheap difference', h2a: 'Search engines show today’s price.', h2b: 'FlyCheap knows the history.',
    sub: 'A search asks “what does it cost now?” FlyCheap asks “is this a good price for this route?” — reasoning over months of data:',
    cards: [
      ['Is this fare unusual?', 'Percentile against the route’s own 30-day range, not a generic average.'],
      ['Is the trend falling?', 'Least-squares slope over 14 days — is waiting likely to pay off?'],
      ['Is it a mistake fare?', 'Three standard deviations below the 30-day mean = a glitch worth grabbing.'],
      ['Is the trip length a sweet spot?', 'Seven-to-twenty-one-day round-trips price differently. We flag them.'],
      ['Which provider found it?', 'Four live sources polled in parallel; every snapshot is tagged with its origin.'],
      ['Will it last?', 'Anomalies get pulled fast. We alert within one polling cycle, not tomorrow.'],
    ],
    closeA: 'The airline can be real. The seat can be real. The date can be real.', closeB: 'The price can still be wrong.',
  },
  how: {
    eyebrow: 'How it works', h2: 'Watch. Catch. Book.', sub: 'One route. One target. Every drop caught.',
    steps: [
      ['Watch', 'Add a route, a date window and the per-adult price you’d love. Thirty seconds, no card. We start polling immediately.'],
      ['Catch', 'Four providers, polled every few minutes. Threshold crossings and anomalies are scored against the route’s own history.'],
      ['Book', 'Email, SMS, WhatsApp or Telegram — with a buy/wait verdict and one click to cross-shop every travel site or book direct.'],
    ],
  },
  metric: { eyebrow: 'The engine that matters', h2a: '{fares} fares recorded.', h2b: 'That’s the whole pitch.', sub: 'Every price we have ever seen on every tracked route — so “normal” is measured, not guessed. {routes} routes watched right now, {alerts} alerts delivered.' },
  wrong: {
    eyebrow: 'And when we get it wrong?', h2a: 'A wrong call costs a click.', h2b: 'Not a trip.',
    sub: 'Verdicts show their math — percentile, trend, confidence — so you can judge the call yourself. We never buy anything on your behalf.',
    cards: [['Confidence, in numbers', 'Every buy/wait verdict carries an explicit confidence percentage and the 30-day range it came from.'], ['You always book direct', 'Book buttons send you to the airline or a major travel site at their price. No booking fee, ever.'], ['One tap to stop', 'Pause a route, snooze alerts, or delete everything from Settings. Nothing is hidden behind a support ticket.']],
  },
  modes: {
    eyebrow: 'Engage on your terms', h2a: 'Digest first.', h2b: 'Instant when it matters.',
    sub: 'FlyCheap runs the way you choose — a calm daily summary, or a ping the second a fare crosses your line.',
    cards: [['Daily digest', 'One email a morning with every tracked route, the cheapest pairing found, and what moved overnight.'], ['Instant alerts', 'Threshold crossed or anomaly spotted? Email, SMS, WhatsApp or Telegram within one polling cycle.'], ['Family share', 'One read-only link gives the whole family the live board — no logins, no settings exposed. Rotate anytime.']],
    tags: ['Digest mode', 'Alert mode', 'Family reports'],
  },
  sovereign: {
    eyebrow: 'Yours by design', h2a: 'Your routes. Your targets.', h2b: 'Your data.',
    sub: 'No ads, no data brokers, no tracking pixels. The only outbound calls we make are to the fare providers the deals come from.',
    stats: [['0', 'booking fees — ever'], ['4', 'live data providers polled in parallel'], ['5 min', 'polling on Pro; 30 min on Free']],
  },
  coverage: { eyebrow: 'Coverage', h2a: 'Built for the fares', h2b: 'that don’t last', chips: [['Mistake fares', '3σ below the 30-day mean. Pulled within hours; caught within minutes.'], ['Threshold drops', 'Your number, per adult. The moment a fare crosses it.'], ['Anomalies', 'Ten percent or more under the 7-day median, even above your target.'], ['Flexible dates', '±3-day windows and month-wide scans find the pairing you’d have missed.'], ['Any route', 'Any IATA pair on Earth, low-cost carriers included.']] },
  why: {
    eyebrow: 'Why FlyCheap', h2a: 'Less refreshing.', h2b: 'More flying.',
    sub: 'The machine handles the watching. You handle the packing.',
    cards: [['Buy / wait verdict', 'One-line call with confidence % and where today’s price sits in the 30-day range.'], ['Fare calendar', 'Twelve-month heat-map of the cheapest price per day. Greener is cheaper.'], ['Explore anywhere', 'Cheapest fare to every reachable destination from your home airport, ranked and mapped.'], ['Cross-shop on book', 'Every Book button lists Aviasales, Google Flights, Kayak, Skyscanner, Momondo and the airline.'], ['AI concierge', 'Ask in plain English — “cheapest two weeks to Rome in October under $600” — get real numbers.'], ['Pin & compare', 'Pin up to three itineraries and see price, dates, party total and time-to-departure side by side.']],
  },
  fit: { eyebrow: "Where it shines", h2: "Built for whoever’s flying", sub: "Real people, real routes. Here is exactly what FlyCheap does for each of them.", cards: [["Families visiting relatives abroad", "Flying four or five people to Cairo, Lagos, Manila or Mumbai once or twice a year.", "One per-adult target; alerts fire on the party total you actually pay.", "Family share link — grandparents watch the same live board, no logins.", "±3-day flex finds the school-break pairing that saves hundreds on a group."], ["Students & expats flying home", "The same long-haul route every semester or holiday, on a budget.", "Track your home route year-round; the fare calendar shows the cheapest weeks at a glance.", "Mistake-fare radar catches the long-haul glitches that get pulled within hours.", "The Free plan covers one route plus a daily digest — enough to never overpay again."], ["Frequent & business travelers", "Ten-plus trips a year, often on short notice.", "Up to 100 routes on Pro, 5-minute polling, SMS / WhatsApp / Telegram alerts.", "Buy/wait verdicts with a confidence % settle the ‘book now or gamble’ question.", "Pin three itineraries side by side, then cross-shop every travel site in one click."], ["Deal hunters & flexible travelers", "Anywhere works, as long as it is cheap.", "Explore ranks every destination from your airport by price, by month and trip length.", "Anomaly alerts fire at 10% under the 7-day median — even before you set a target.", "Ask the concierge: “cheapest two weeks in Europe in October under $500”."], ["Travel agencies & desks", "Watching dozens of client routes at once.", "Enterprise: white-label branding, custom domain, REST API, Slack alerts, audit log.", "Unlimited routes with 1-minute polling for time-sensitive bookings.", "Client share links keep travelers informed without handing out logins."]] },
  cta: {
    h2a: 'Don’t refresh the fare.', h2b: 'Track it.',
    sub: 'Request a founding-member seat. Early members get a 3-month free trial of the basic capabilities — no card — and can upgrade to Pro or Enterprise whenever they want more.',
    placeholder: 'you@email.com', airport: 'Home airport (JFK)', button: 'Request access', busy: 'Saving…',
    chips: ["No credit card", "3-month free trial", "Upgrade only if you want", "Cancel anytime"],
    consent: 'By requesting access you agree to receive one email when your seat opens and the alerts you set up. No marketing lists, no third parties — unsubscribe anytime.',
    fine: 'One email when your seat opens. Nothing else.', invited: 'Invited by a friend ✓', err: 'Something went wrong — try again.', netErr: 'Network error — please try again.',
    doneA: 'You’re on the list', doneExisting: 'You’re already on the list', doneOf: 'of {total} founding members · check your inbox', share: 'Every friend who joins with your link moves you up 5 spots', joined: '{n} joined so far', copy: 'Copy link', copied: 'Copied ✓', shareX: 'Share on X', shareWa: 'WhatsApp', shareMail: 'Email',
    notYou: "Not you? Join with a different email", shareText: 'I just joined the FlyCheap early-access list — it watches 1,000+ airlines and pings you the moment a fare drops. Grab a spot:',
  },
  footer: { tag: 'Fare intelligence that watches every route you care about — and tells you the moment to book.', sovereign: 'Founding members get in first.', cols: [['Platform', [['Why FlyCheap', '#why'], ['How it works', '#how'], ['Live demo', '/demo'], ['Pricing', '/welcome#pricing'], ['Early access', '#join']]], ['Resources', [['About & docs', '/about'], ['Guides', '/guides'], ['Status', '/status'], ['Trial terms', '/trial-terms']]], ['Company', [['Log in', '/login'], ['Contact', '/contact'], ['Contact sales', 'mailto:sales@flycheap.18dn.com']]], ['Legal', [['Terms of service', '/terms'], ['Privacy policy', '/privacy'], ['Refunds', '/terms#refunds']]]], copyright: '© 2026 FlyCheap · Operated by Myron Mekhael, New York · All rights reserved', language: 'Language' },
};
export type EarlyAccessDict = typeof en;

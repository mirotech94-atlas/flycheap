/**
 * English source dictionary for the core app (sidebar/nav, login, welcome,
 * settings headings, dashboard section titles). Other locales must match
 * these keys — they are typed against `AppDict`.
 *
 * `Rich` = alternating plain/emphasised segments: odd indexes render inside
 * <em>. Render with <Em r={...} /> from '@/lib/i18n/rich'. Variables use the
 * {name} syntax and are filled with fill() from '@/lib/i18n/early-access'.
 */
export type Rich = string[];

export const en = {
  common: { language: 'Language', live: 'LIVE' },

  nav: {
    dashboard: 'Dashboard', explore: 'Explore', hotels: 'Hotels', rentals: 'Airbnbs', offers: 'Offers',
    integrations: 'Integrations', pricing: 'Pricing', guides: 'Guides', routes: 'Routes',
    searches: 'Searches', settings: 'Settings',
    groupFlights: 'Flights', groupServices: 'Services', groupHelp: 'Help',
    home: 'Home', flights: 'Flights', profile: 'Profile',
    tagline: 'Fare intelligence', toggle: 'Toggle navigation',
    signIn: 'Log in', signInArrow: 'Log in →', signOut: 'Sign out', adminPortal: 'Admin portal →',
    guestA: 'FlyCheap watches ', guestStrong: 'airline fares worldwide', guestB: ' around the clock and alerts you the moment a fare drops below your threshold.',
    whatIs: 'What is FlyCheap?', exploreDeals: 'Explore deals',
  },

  login: {
    brandMeta: 'Fare Intelligence Platform',
    pill: 'Live from the fare engine',
    h1: [['Stop ', 'refreshing', '.'], ['Start ', 'saving', '.']] as Rich[],
    lede: 'The numbers below are live production data — what the engine is tracking at this moment, refreshed on every check.',
    statSnapshots: 'Fare snapshots recorded', statRoutes: 'Route pairs monitored', statAlerts: 'Alerts delivered', statCheapest: 'Cheapest now',
    dealsHead: 'Best round-trips right now', thRoute: 'Route', thDates: 'Dates', thPerAdult: 'Per adult',
    dealsFoot: 'Sign in to set thresholds and get alerted the moment these drop further.',
    welcomeBack: 'Welcome back',
    h2: ['Log in or ', 'sign up', ''] as Rich,
    sub: 'Returning users are recognized automatically. New here? You’re 30 seconds from your first tracked route — one 6-digit email code, no password.',
    legalA: 'By continuing you agree to our ', privacy: 'privacy policy', legalB: ' and, for the free trial, the ', trialTerms: 'trial terms', legalC: '. We never sell your data.',
    form: {
      tabLogin: 'Log in', tabSignup: 'Sign up',
      rememberedA: 'Welcome back, ', rememberedB: '.', notYou: 'Not you?',
      labelIdentifier: 'Username or email', phIdentifier: 'mirotech94 or you@email.com',
      sending: 'Sending…', sendCode: 'Send sign-in code →', noPassword: 'We email you a 6-digit code — no password to remember.',
      labelEmail: 'Email', labelUsername: 'Choose a username', usernameHint: '3–30 chars · letters, numbers, . _ - · you’ll log in with this next time',
      createAccount: 'Create account →',
      sentA: 'We sent a 6-digit code', sentTo: ' to ', sentB: '. Enter it below.',
      verifying: 'Verifying…', verify: 'Verify & continue →', back: '← Back', resend: 'Resend code',
      errExpired: 'That sign-in link expired or was already used. Sign in with a code below.',
      errMissing: 'Sign-in link was missing its token. Use a code instead.',
      errSend: 'Could not send the code.', errVerify: 'Could not verify the code.',
    },
  },

  welcome: {
    brandMeta: 'Fare Intelligence Platform',
    nav: { how: 'How it works', features: 'Features', pricing: 'Pricing', faq: 'FAQ', signIn: 'Log in', earlyAccess: 'Get early access →' },
    hero: {
      pill: 'Live · {providers} data providers · {fares} fares recorded',
      h1: [['The ', 'cheapest', ' fares,'], ['monitored ', 'for you', '.']] as Rich[],
      lede: 'FlyCheap watches every route you care about across airlines worldwide, 24/7. We tell you the moment a fare drops below your threshold — or significantly under its 7-day median. Stop refreshing flight sites.',
      ctaEarly: 'Get early access →', ctaDemo: '▶ Watch the live demo',
      statSnapshots: 'Fare snapshots recorded', live: 'live', statCadence: 'Polling cadence', min: 'min',
      statFree: 'Free forever', noCard: 'no card', statProviders: 'Data providers polled',
      globeTl: 'LIVE NETWORK', globeBr: '{n} ROUTES MONITORED',
      ticker: 'BEST FARES · LIVE', tickerDown: '▼ ${n} vs typical', tickerFlat: 'at typical',
      trust: 'Live data providers · {n} connected',
    },
    how: {
      eyebrow: 'How it works · 3 steps to a cheaper flight',
      title: ['Set it. Forget it. ', 'Save big.', ''] as Rich,
      sub: 'Most people refresh flight sites for hours and still book at the wrong time. FlyCheap watches forever and tells you exactly when to buy.',
      steps: [
        { tag: 'Add a route · 30 seconds', title: ['Tell us ', 'where', ', ', 'when', ', and your ', 'target', '.'] as Rich, desc: 'Pick origin and destination, optional date windows, party size, and the per-adult price you’d love. That’s it — no credit card, no onboarding wizard.' },
        { tag: 'We watch · Continuously', title: ['We watch ', 'airline fares', ' while you sleep.'] as Rich, desc: 'Our engine fans each search out to Travelpayouts, Duffel, and Google Flights (via SerpAPI and SearchAPI) in parallel — picking the cheapest valid offer every cycle and writing it to your fare history.' },
        { tag: 'You buy · The right moment', title: ['The instant a fare drops, you get a ', 'ping', '.'] as Rich, desc: 'Two triggers: threshold-cross (below your target) and anomaly (≥ 10% under 7-day median). Email by default; SMS and Telegram one toggle away on Pro. Click through to book direct.' },
      ],
      screen1: { route: 'route:', depart: 'depart:', ret: 'return:', party: 'party:', target: 'target:', retVal: '+14 days', partyVal: '4 ad + 1 inf', targetVal: '$800/adult' },
      screen3: { to: 'to:', subject: 'subject:', subjectVal: 'JFK→CAI just dropped', line1: '$589/adult · Aug 12 → 30', line2: 'MS986 · nonstop · Travelpayouts', line3: '→ book direct or cross-shop' },
    },
    preview: {
      eyebrow: 'A peek inside · Executive dashboard',
      title: ['Not just alerts. A full ', 'intelligence layer', '.'] as Rich,
      sub: 'Live fare feeds, mistake-fare radar, route DNA cards, fare-calendar heatmaps, a Claude-powered concierge — and clean tabular data fit for an executive briefing.',
      open: 'Open live dashboard →', tag: 'LIVE PRODUCTION DATA · CONTINUOUSLY REFRESHED', dashboard: 'dashboard',
      kpiRoutes: 'Routes monitored', kpiRoutesSub: '{n} pairs in 12-month scan',
      kpiSnapshots: 'Fare snapshots', lastPoll: 'Last poll {n} min ago', polling: 'Polling continuously',
      kpiCheapest: 'Cheapest pairing', perAdult: 'per adult',
      kpiAlerts: 'Alerts delivered', kpiAlertsSub: 'Threshold + anomaly, all time',
      pollingProviders: 'Polling {n} providers',
      feedThreshold: 'Threshold cross', feedAnomaly: 'Anomaly · 7-day median', feedBest: 'Best fare · 12-month scan',
    },
    features: {
      eyebrow: 'Built like an executive dashboard',
      title: ['Everything you’d want, ', 'nothing', ' you wouldn’t.'] as Rich,
      sub: 'Trend analysis, recommendations, heatmaps, comparison, family share, OTA cross-shop, an AI concierge. Designed for travelers who actually book — not browsers.',
      label: 'Feature',
      items: [
        { title: ['Buy / wait ', 'recommendations', ''] as Rich, desc: 'Hopper-style verdict engine. 30-day trend + percentile analysis tells you to lock in or hold — with a confidence score.' },
        { title: ['World ', 'map', ' exploration'] as Rich, desc: 'See the cheapest fares to every reachable destination from your home city, color-coded on an interactive map.' },
        { title: ['Fare-calendar ', 'heatmap', ''] as Rich, desc: '12-month grid of cheapest day-by-day prices. Click a green cell to filter; spot patterns at a glance.' },
        { title: ['Pin & ', 'compare', ''] as Rich, desc: 'Pin up to 3 itineraries, see side-by-side delta of price, dates, party total, and time-to-departure.' },
        { title: ['Smart ', 'alerts', ''] as Rich, desc: 'Two triggers: threshold-cross (below your target) and price-drop (under the 7-day median). Email on every plan; SMS and Telegram one toggle away on Pro.' },
        { title: ['Family ', 'share link', ''] as Rich, desc: 'One read-only URL gives the whole family live access — no logins, no settings exposure. Rotate anytime.' },
        { title: ['Cross-shop ', 'OTAs', ''] as Rich, desc: 'Every Book button is a dropdown: Aviasales, Google Flights, Kayak, Skyscanner, Momondo, direct airline.' },
        { title: ['AI ', 'concierge', ''] as Rich, desc: 'Tool-equipped Claude assistant. Ask "find the cheapest weekend trip from NYC under $400" and it answers with real data.' },
        { title: ['Command ', 'palette', ' · ⌘K'] as Rich, desc: 'Power-user shortcuts: refresh, poll, send digest, export CSV, toggle theme, jump anywhere — all one keystroke away.' },
      ],
    },
    pricing: {
      eyebrow: 'Pricing · No credit card on free tier',
      title: ['Free for one. ', 'Priced per seat', ' for teams.'] as Rich,
      sub: 'Cancel anytime from the billing portal. Upgrade or downgrade in one click — your routes and history are never deleted.',
      tiers: [
        { name: 'Free', price: '$0', unit: 'forever', pitch: 'For the family booker who watches a few routes.', cta: 'Sign up free →', note: 'No credit card required', badge: '', features: ['Up to 5 tracked routes', 'Checked most often when it matters', 'Email alerts + daily digest', 'Worldwide explore map', 'Family share link'] },
        { name: 'Pro', price: '$9', unit: '/ month', pitch: 'For the frequent traveler — speed and reach.', cta: 'Get Pro →', note: 'Billed monthly · cancel anytime', badge: 'Most popular', features: ['Up to 100 tracked routes', 'Checked most often when it matters', 'SMS and Telegram alerts', 'Buy/wait predictions + confidence', 'Mistake-fare radar'] },
        { name: 'Enterprise', price: '$39', unit: '/ month', pitch: 'For agencies, family offices, and travel desks.', cta: 'Continue to Enterprise →', note: 'Billed monthly · cancel anytime', badge: '', features: ['Unlimited routes', 'White-label branding + custom domain', 'REST API (/api/v1)', 'Audit log', 'Audit log'] },
      ],
    },
    faq: {
      eyebrow: 'Frequently asked',
      title: ['Questions, ', 'answered', '.'] as Rich,
      items: [
        { q: 'Where does the pricing data come from?', a: 'We aggregate from Travelpayouts (the Aviasales metasearch network), Duffel, and Google Flights via SerpAPI and SearchAPI. Every fare snapshot is tagged with its source so you can see exactly where a price came from.' },
        { q: 'How fresh is the data?', a: 'We check your tracked routes continuously, and check the ones that matter most — close to departure, close to your target, or moving fast — most often. The 12-month best-deals scan refreshes on its own schedule. The Explore page hits live caches on each request.' },
        { q: 'Which routes and airlines can I track?', a: 'Any airport pair in the world — enter two IATA codes (JFK → LHR, LAX → BKK, EWR → DXB…) and we watch every airline our providers cover, low-cost carriers included. You can also group nearby origins (JFK + EWR) into one route.' },
        { q: 'Do you charge a booking fee?', a: 'Never. We are not a travel agency. Booking links route you to Aviasales, Kayak, Google Flights, or the airline directly — you complete the purchase there.' },
        { q: 'Is the family share link secure?', a: 'Yes. It uses a cryptographically-random token unique to your account. You can rotate or revoke it instantly from Settings — anyone holding the old URL loses access immediately.' },
        { q: 'Can I white-label this for my team?', a: 'Yes — Enterprise plans include a custom domain, custom logo, brand color, and sender email. Talk to sales for setup; provisioning takes one business day.' },
        { q: 'How does the 3-month free trial work?', a: 'Every new account starts with 3 months of the full product free — every Free, Pro and Enterprise feature, no card. Near the end, reach out to keep going; otherwise your account simply rolls to the Free plan (nothing paused or billed).' },
        { q: 'How do I cancel my subscription?', a: 'From Settings → Billing, one click opens the secure Stripe customer portal where you can cancel instantly — no emails, no retention calls. Your plan stays active until the end of the paid period, then drops to Free without deleting any of your routes or history.' },
        { q: 'How accurate are the buy/wait recommendations?', a: 'Each verdict combines a z-score against your route’s 30-day price history with a 14-day trend slope, and ships with an explicit confidence percentage. We show you the math — percentile, median, trend — so you can judge the call yourself.' },
        { q: 'What is a mistake fare and will I really catch one?', a: 'A mistake fare is a pricing glitch — a fat-fingered fare filing or currency error — typically 40-80% below normal. They usually survive 30-90 minutes before airlines pull them. Our radar flags any fare ≥ 3 standard deviations below the 30-day mean and alerts Pro users on the next check.' },
        { q: 'Which alert channels are supported?', a: 'Email on every plan. Pro adds SMS and Telegram — each is a single toggle in Settings, no bot setup required. Enterprise adds custom webhooks for routing alerts into your own systems.' },
        { q: 'Do I need to know the exact travel dates?', a: 'No. You can track a whole departure window (e.g. "any two weeks between August and October") and FlyCheap finds the cheapest date pairing inside it. Every tracked search also shows the cheapest ±3-day flex option, which often saves hundreds.' },
        { q: 'Is there a mobile app?', a: 'A native iOS and Android app with push notifications is in active development. Until it ships, the web dashboard is fully responsive and installable as a PWA — Add to Home Screen gives you an app-like experience today.' },
        { q: 'What happens to my data if I stop using FlyCheap?', a: 'Your account and fare history stay put on the Free tier. If you want out entirely, Settings → Danger Zone deletes your account and every row of your data immediately and irreversibly. We never sell or share personal data — see the Privacy page.' },
      ],
    },
    final: {
      eyebrow: 'Open invitation',
      title: ['Stop refreshing flight sites. ', 'Set it once.', ' We watch forever.'] as Rich,
      sub: 'Free tier, no credit card. Add your first route in 30 seconds — we’ll start checking it immediately and email you the moment a fare drops below your threshold.',
      tryFree: 'Try it free →', docs: 'Read the docs',
    },
    footer: {
      blurb: 'A flight intelligence platform built on Travelpayouts (Aviasales), Duffel, and Google Flights data. Some Book links are affiliate links — we may earn a commission at no extra cost to you. ',
      disclosure: 'Disclosure →',
      product: 'Product', dashboard: 'Dashboard', explore: 'Explore', watchlist: 'Watchlist', liveDemo: 'Live demo', pricing: 'Pricing', status: 'Status',
      company: 'Company', about: 'About & docs', signIn: 'Log in', contactSales: 'Contact sales',
      legal: 'Legal', terms: 'Terms of service', refunds: 'Refunds & cancellation', privacy: 'Privacy', trialTerms: 'Trial terms',
      copyright: '© 2026 FlyCheap · Operated by Myron Mekhael, New York · All rights reserved',
    },
  },

  settings: {
    eyebrow: 'Configuration', title: 'Settings', sub: 'Thresholds, alerts, branding, providers, and digest preview.',
    account: 'Account',
    tierFree: 'Free tier — limited to 5 active routes and email alerts only.',
    tierPro: 'Pro — unlimited routes, multi-channel alerts, white-label branding.',
    tierEnterprise: 'Enterprise — everything plus REST API, white-label branding and a custom domain.',
    activeRoutes: 'Active routes', upgrade: 'Upgrade to Pro · $5/mo →',
    manualPoll: 'Manual poll', manualPollSub: 'Force a poll of every active search right now.', pollAll: 'Poll all searches now',
    apiUsage: 'Amadeus API usage this month (cap {n})', used: 'Used ({n})', remaining: 'Remaining ({n})', calls: 'Calls',
    recentAlerts: 'Recent alerts sent (last 20)', exportCsv: '⬇ Export CSV', exportTitle: 'Download full alert history as CSV', noAlerts: 'No alerts sent yet.',
    thSent: 'Sent', thSearch: 'Search', thDepart: 'Depart', thReturn: 'Return', thPerAdult: 'Per adult',
  },

  dashboard: {
    eyebrow: 'Executive Brief · Live',
    pollerTitle: 'The background poller scans every active watch every ~30 minutes; on-demand polls fire immediately when you load an uncached route.',
    pollerPill: '🤖 Background poller active — checking your routes continuously.',
    // Rendered as: pre <em>{n}</em> mid <strike>strike</strike> post <em>em</em> end
    h1: { pre: 'We’ve found ', mid: ' sub-{price} round-trips ', strike: 'your travel agent', post: ' ', em: 'missed', end: '.' },
    lede: 'FlyCheap watches airline fares around the clock — and tells you the moment a fare on your route drops below threshold. No more refreshing Google Flights at 2 AM.',
    bookCheapest: 'Book cheapest → {price}', addFirst: 'Add your first route →', addWatch: 'Add a new watch',
    cheapestNow: 'Cheapest right now', median: 'Median across cache', destinations: 'Destinations live', cities: 'cities',
    rankedTitle: 'Where each route sits in its 30-day range', bookArrow: 'Book →',
    globeTl: 'LIVE NETWORK · {n} ROUTES', globeBr: '{a} ACTIVE ARCS · {t} TRACKED',
    ticker: 'LIVE FARES', polling: 'Polling…',
    quickEyebrow: 'Quick search', quickSub: 'Search flights or browse deals from any city', fullExplore: 'Full explore →',
    kpiTracked: 'Tracked routes', kpiTrackedSub: 'Active across {n} origins',
    kpiSavings: 'Best-vs-typical savings', kpiSavingsSub: 'Cheapest beats route median',
    kpiCheapest: 'Cheapest pairing', perAdult: 'per adult', noDeals: 'No deals cached',
    kpiBelow: 'Below threshold', kpiBelowSub: 'of {n} matches',
    dealsEyebrow: '12-month opportunity scan',
    dealsTitle: ['Best deals & ', 'live', ' feed'] as Rich,
    dealsSub: 'Every fare below your threshold, ranked by sweetspot timing (Tue/Sat 1–5 AM) — plus a live feed of every poll we run.',
    pollAll: 'Poll all now', pollingProviders: 'Polling {n} providers',
    intelEyebrow: 'Pattern + Calendar + Footprint',
    intelTitle: ['Route ', 'intelligence', ''] as Rich,
    intelSub: 'The pattern card tells you when this route is cheapest. The calendar shows every cheap window. The carbon ledger keeps the trip honest.',
    footerTag: 'FlyCheap · Polling airline fares · ', status: 'Status', privacy: 'Privacy', about: 'About',
  },
};
export type AppDict = typeof en;
export type AppNavDict = AppDict['nav'];
export type LoginFormDict = AppDict['login']['form'];

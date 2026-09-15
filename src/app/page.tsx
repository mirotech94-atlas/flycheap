import Link from 'next/link';
import { APP_VERSION_SHORT } from '@/lib/version';
import { redirect } from 'next/navigation';
import { loadDashboard } from '@/lib/dashboard-data';
import { queries } from '@/lib/db';
import { getCachedBestDeals } from '@/lib/bestDeals';
import { fmtUSD, fmtDate, fmtRelative, bookingLink } from '@/lib/utils';
import { PollNowButton } from '@/components/PollNowButton';
import { RefreshDealsButton } from '@/components/RefreshDealsButton';
import { Sparkline } from '@/components/Sparkline';
import { getCurrentUser } from '@/lib/auth';
import { FoundingBanner } from '@/components/FoundingBanner';
import { OnboardingWizard } from '@/components/OnboardingWizard';
import { OnboardingTour } from '@/components/OnboardingTour';
import { EmptyState } from '@/components/EmptyState';

import { FlightSearchForm } from '@/components/FlightSearchForm';
import { FcGlobe } from '@/components/FcGlobe';
import { FcKpiStrip } from '@/components/FcKpiStrip';
import { FcBestDealsTable, type FcDealRow } from '@/components/FcBestDealsTable';
import { FcLiveFeed } from '@/components/FcLiveFeed';
import { providerStatuses } from '@/lib/providers';
import { FcMistakeRadar } from '@/components/FcMistakeRadar';
import { FcRouteDna } from '@/components/FcRouteDna';
import { computeVerdict, routeKey, type Verdict, type VerdictPoint } from '@/lib/verdict';
import { FcFareCalendar } from '@/components/FcFareCalendar';
import { FcCarbonLedger } from '@/components/FcCarbonLedger';
import { HotelUpsell } from '@/components/HotelUpsell';
import { buildLiveFeed } from '@/lib/liveFeed';
import { partyCo2Kg } from '@/lib/carbon';
import { getRequestLocale } from '@/lib/i18n/server';
import { getAppDict, fill } from '@/lib/i18n/app';
import { Em } from '@/lib/i18n/rich';
import { MARKETING_HOST } from '@/lib/hosts';

import type { Metadata } from 'next';

/**
 * Wrap an outbound affiliate URL in our /go redirector so the click is logged
 * to affiliate_clicks. Without this wrapper the Book button bypasses our
 * commission tracking entirely. See src/app/go/route.ts for the contract.
 */
function trackedBook(opts: {
  origin: string;
  destination: string;
  departDate: string;
  returnDate: string;
  adults: number;
  infants: number;
  perAdultUsd: number;
  surface: string; // see AFFILIATE_SURFACES in lib/affiliate.ts
}): string {
  const dest = bookingLink({
    origin: opts.origin, destination: opts.destination,
    departDate: opts.departDate, returnDate: opts.returnDate,
    adults: opts.adults, infants: opts.infants,
  });
  const q = new URLSearchParams({
    to: dest,
    origin: opts.origin,
    destination: opts.destination,
    dep: opts.departDate,
    ret: opts.returnDate,
    per: String(Math.round(opts.perAdultUsd)),
    provider: 'aviasales',
    surface: opts.surface,
  });
  return `/go?${q.toString()}`;
}

export const metadata: Metadata = {
  title: 'FlyCheap — Executive Dashboard',
  description: 'Cheap flights, monitored for you. Track 1,000+ airlines, get email alerts when fares drop.',
};

export const dynamic = 'force-dynamic';

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const DEAL_LIMIT_OPTIONS = [10, 20, 30, 50, 100];
type StopFilter = 'all' | 'nonstop' | 'one-stop';
type AboveCapFilter = 'no' | 'yes';
type DowFilter = 'all' | '0' | '1' | '2' | '3' | '4' | '5' | '6' | 'tue-sat';
type TimeFilter = 'all' | 'redeye' | 'early' | 'midday' | 'evening' | 'night' | '3am-window';
type SortFilter = 'cheapest' | 'sweetspot';

const DOW_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sa'];
const DOW_SHORT = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
const HOMEPAGE_DEAL_LIMIT = 800;
const PUBLIC_DASHBOARD_ROUTE_LIMIT = 12;

function isSweetSpotLeg(dow: number, hour: number): boolean {
  return (dow === 2 || dow === 6) && hour >= 1 && hour <= 5;
}
function isSweetSpotTrip(d: { outbound_dow: number; outbound_hour: number; return_dow: number; return_hour: number }): boolean {
  return isSweetSpotLeg(d.outbound_dow, d.outbound_hour) && isSweetSpotLeg(d.return_dow, d.return_hour);
}
function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
function parseDealLimit(value: string | undefined, availableCount: number): number {
  if (value === undefined || value === '' || value === 'all') {
    return Math.max(availableCount, DEAL_LIMIT_OPTIONS[0]);
  }
  const parsed = Number(value);
  return DEAL_LIMIT_OPTIONS.includes(parsed) ? parsed : Math.max(availableCount, DEAL_LIMIT_OPTIONS[0]);
}
function parsePositiveInt(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
function parseStopFilter(value: string | undefined): StopFilter {
  return value === 'nonstop' || value === 'one-stop' ? value : 'all';
}
function parseAboveCapFilter(value: string | undefined): AboveCapFilter {
  return value === 'yes' ? 'yes' : 'no';
}
function parseDowFilter(value: string | undefined): DowFilter {
  if (value === 'tue-sat' || value === '0' || value === '1' || value === '2' ||
      value === '3' || value === '4' || value === '5' || value === '6') return value;
  return 'all';
}
function parseTimeFilter(value: string | undefined): TimeFilter {
  if (['redeye', 'early', 'midday', 'evening', 'night', '3am-window'].includes(value ?? '')) return value as TimeFilter;
  return 'all';
}
function parseSortFilter(value: string | undefined): SortFilter {
  return value === 'sweetspot' ? 'sweetspot' : 'cheapest';
}
function dowMatches(dow: number, filter: DowFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'tue-sat') return dow === 2 || dow === 6;
  return dow === Number(filter);
}
function timeMatches(hour: number, filter: TimeFilter): boolean {
  switch (filter) {
    case 'all': return true;
    case 'redeye': return hour < 5;
    case 'early': return hour >= 5 && hour < 9;
    case 'midday': return hour >= 9 && hour < 17;
    case 'evening': return hour >= 17 && hour < 22;
    case 'night': return hour >= 22;
    case '3am-window': return hour >= 1 && hour <= 5;
  }
}
function isStopMatch(outboundTransfers: number, returnTransfers: number, filter: StopFilter): boolean {
  const maxTransfers = Math.max(outboundTransfers, returnTransfers);
  if (filter === 'nonstop') return maxTransfers === 0;
  if (filter === 'one-stop') return maxTransfers === 1;
  return true;
}
function monthLabel(value: string): string {
  const [year, month] = value.split('-').map(Number);
  if (!year || !month) return value;
  return new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, 1)));
}
function formatStopCount(transfers: number): string {
  if (transfers <= 0) return 'Nonstop';
  if (transfers === 1) return '1 stop';
  return `${transfers} stops`;
}
function formatRoundTripStops(outboundTransfers: number, returnTransfers: number): string {
  const outbound = formatStopCount(outboundTransfers);
  const inbound = formatStopCount(returnTransfers);
  return outbound === inbound ? outbound : `${outbound} / ${inbound}`;
}
function fareStopLabel(rawJson: string | null | undefined, origin: string): string {
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson) as {
        outbound?: { transfers?: number };
        inbound?: { transfers?: number };
      };
      const outbound = parsed.outbound?.transfers;
      const inbound = parsed.inbound?.transfers;
      if (typeof outbound === 'number' && typeof inbound === 'number') {
        return formatRoundTripStops(outbound, inbound);
      }
    } catch {}
  }
  return origin === 'EWR' ? '1 stop' : 'Nonstop';
}
function shortMonthDay(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(d);
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const sessionUser = await getCurrentUser();
  // Signed-out visitors get the marketing landing, not the operational
  // dashboard — the cockpit is a signed-in surface. With a marketing host
  // configured, the landing lives there — send visitors straight to /login
  // instead of rendering /welcome a second time on the client host.
  if (!sessionUser) redirect(MARKETING_HOST ? '/login' : '/welcome');
  const t = getAppDict(await getRequestLocale()).dashboard;
  const allRows = loadDashboard(sessionUser
    ? { userId: sessionUser.id }
    : { limit: PUBLIC_DASHBOARD_ROUTE_LIMIT, includeHistory: false }
  );
  const threshold = parseFloat(
    (sessionUser && queries.getUserSetting(sessionUser.id, 'alert_threshold_per_adult_usd')) ||
    queries.getSetting('alert_threshold_per_adult_usd') || '900'
  );
  const maxDisplay = parseFloat(
    (sessionUser && queries.getUserSetting(sessionUser.id, 'max_display_per_adult_usd')) ||
    queries.getSetting('max_display_per_adult_usd') || '1200'
  );
  const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
  function parseDay(value: string | undefined): string | null {
    return value && ISO_DAY.test(value) ? value : null;
  }
  const selectedOrigin = firstParam(params?.origin) ?? 'all';
  const selectedOutbound = firstParam(params?.outbound) ?? 'all';
  const selectedReturn = firstParam(params?.return_) ?? 'all';
  const selectedOutboundDay = parseDay(firstParam(params?.outDay));
  const selectedReturnDay = parseDay(firstParam(params?.retDay));
  const selectedStopFilter = parseStopFilter(firstParam(params?.stops));
  const selectedMinTrip = parsePositiveInt(firstParam(params?.tripMin));
  const selectedMaxTrip = parsePositiveInt(firstParam(params?.tripMax));
  const selectedAboveCap = parseAboveCapFilter(firstParam(params?.above));
  const selectedOutboundDow = parseDowFilter(firstParam(params?.outDow));
  const selectedReturnDow = parseDowFilter(firstParam(params?.retDow));
  const selectedOutboundTime = parseTimeFilter(firstParam(params?.outTime));
  const selectedReturnTime = parseTimeFilter(firstParam(params?.retTime));
  const selectedSort = parseSortFilter(firstParam(params?.sort));

  const { deals: allDeals, refreshed_at } = getCachedBestDeals(HOMEPAGE_DEAL_LIMIT);
  // User's tracked routes drive Route DNA switcher + party-size fallback.
  const trackedRoutes = sessionUser
    ? queries.distinctTrackedRoutesForUser(sessionUser.id)
    : queries.distinctTrackedRoutes();
  const userParty = (() => {
    const firstActive = allRows.find(r => r.search.active === 1)?.search;
    return {
      adults: firstActive?.adults ?? 1,
      infants: firstActive?.infants ?? 0,
    };
  })();
  const affordableDeals = allDeals.filter(d => d.per_adult_usd <= maxDisplay);
  const candidateDeals = selectedAboveCap === 'yes' ? allDeals : affordableDeals;
  const origins = Array.from(new Set(allDeals.map(d => d.origin))).sort();
  const next12Months = (() => {
    const out: string[] = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const m = now.getUTCMonth() + 1 + i;
      const y = now.getUTCFullYear() + Math.floor((m - 1) / 12);
      const mm = ((m - 1) % 12) + 1;
      out.push(`${y}-${String(mm).padStart(2, '0')}`);
    }
    return out;
  })();
  const outboundMonths = Array.from(new Set([
    ...next12Months,
    ...allDeals.map(d => d.outbound_date.slice(0, 7)),
  ])).sort();
  const returnMonths = Array.from(new Set([
    ...next12Months,
    ...allDeals.map(d => d.return_date.slice(0, 7)),
  ])).sort();
  const returnMonthHasAnyDeals = selectedReturn === 'all'
    ? true
    : allDeals.some(d => d.return_date.slice(0, 7) === selectedReturn);

  type Relaxable = {
    drop_outbound_time?: boolean;
    drop_return_time?: boolean;
    drop_trip_min?: boolean;
    drop_trip_max?: boolean;
    drop_outbound_dow?: boolean;
    drop_return_dow?: boolean;
    drop_return_month?: boolean;
    drop_outbound_month?: boolean;
    drop_outbound_day?: boolean;
    drop_return_day?: boolean;
  };

  function applyFilters(d: typeof allDeals[number], r: Relaxable): boolean {
    if (selectedOrigin !== 'all' && d.origin !== selectedOrigin) return false;
    if (!r.drop_outbound_day && selectedOutboundDay && d.outbound_date.slice(0, 10) !== selectedOutboundDay) return false;
    if (!r.drop_return_day && selectedReturnDay && d.return_date.slice(0, 10) !== selectedReturnDay) return false;
    if (!selectedOutboundDay && !r.drop_outbound_month && selectedOutbound !== 'all' && d.outbound_date.slice(0, 7) !== selectedOutbound) return false;
    if (!selectedReturnDay && !r.drop_return_month && selectedReturn !== 'all' && d.return_date.slice(0, 7) !== selectedReturn) return false;
    if (!isStopMatch(d.outbound_transfers, d.return_transfers, selectedStopFilter)) return false;
    if (!r.drop_trip_min && selectedMinTrip !== null && d.trip_length_days < selectedMinTrip) return false;
    if (!r.drop_trip_max && selectedMaxTrip !== null && d.trip_length_days > selectedMaxTrip) return false;
    if (!r.drop_outbound_dow && !dowMatches(d.outbound_dow, selectedOutboundDow)) return false;
    if (!r.drop_return_dow && !dowMatches(d.return_dow, selectedReturnDow)) return false;
    if (!r.drop_outbound_time && !timeMatches(d.outbound_hour, selectedOutboundTime)) return false;
    if (!r.drop_return_time && !timeMatches(d.return_hour, selectedReturnTime)) return false;
    return true;
  }

  const relaxationSteps: Array<{ label: string; relax: Relaxable }> = [
    { label: '', relax: {} },
    { label: 'Outbound time', relax: { drop_outbound_time: true } },
    { label: 'Outbound time + Return time', relax: { drop_outbound_time: true, drop_return_time: true } },
    { label: 'Outbound time + Return time + Trip length', relax: { drop_outbound_time: true, drop_return_time: true, drop_trip_min: true, drop_trip_max: true } },
    { label: 'Outbound time + Return time + Trip length + Return day', relax: { drop_outbound_time: true, drop_return_time: true, drop_trip_min: true, drop_trip_max: true, drop_return_dow: true } },
    { label: 'all day/time/trip filters (months & origin kept)', relax: { drop_outbound_time: true, drop_return_time: true, drop_trip_min: true, drop_trip_max: true, drop_outbound_dow: true, drop_return_dow: true } },
    { label: 'all day/time/trip filters + Return month', relax: { drop_outbound_time: true, drop_return_time: true, drop_trip_min: true, drop_trip_max: true, drop_outbound_dow: true, drop_return_dow: true, drop_return_month: true } },
    { label: 'all date/time filters (only origin & cap kept)', relax: { drop_outbound_time: true, drop_return_time: true, drop_trip_min: true, drop_trip_max: true, drop_outbound_dow: true, drop_return_dow: true, drop_return_month: true, drop_outbound_month: true } },
    { label: 'exact-day filters + all other filters', relax: { drop_outbound_time: true, drop_return_time: true, drop_trip_min: true, drop_trip_max: true, drop_outbound_dow: true, drop_return_dow: true, drop_return_month: true, drop_outbound_month: true, drop_outbound_day: true, drop_return_day: true } },
  ];

  let filteredDeals: typeof allDeals = [];
  let relaxedLabel = '';
  for (const step of relaxationSteps) {
    filteredDeals = candidateDeals.filter(d => applyFilters(d, step.relax));
    if (filteredDeals.length > 0) {
      relaxedLabel = step.label;
      break;
    }
  }
  const sortedDeals = selectedSort === 'sweetspot'
    ? [...filteredDeals].sort((a, b) => {
        const aSweet = isSweetSpotTrip(a) ? 0 : 1;
        const bSweet = isSweetSpotTrip(b) ? 0 : 1;
        if (aSweet !== bSweet) return aSweet - bSweet;
        return a.per_adult_usd - b.per_adult_usd;
      })
    : filteredDeals;
  const selectedDealLimit = parseDealLimit(firstParam(params?.deals), sortedDeals.length);
  const deals = sortedDeals.slice(0, selectedDealLimit);
  const hiddenDealCount = selectedAboveCap === 'yes' ? 0 : (allDeals.length - affordableDeals.length);
  const hiddenFilteredDealCount = Math.max(0, affordableDeals.length - filteredDeals.length);
  const hiddenDisplayedDealCount = Math.max(0, filteredDeals.length - deals.length);
  const rows = allRows;

  const dealsByOriginPie = (() => {
    const counts: Record<string, number> = {};
    for (const d of deals) counts[d.origin] = (counts[d.origin] ?? 0) + 1;
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  })();

  const byOrigin: Record<string, number> = {};
  for (const r of rows) {
    if (r.fare) byOrigin[r.search.origin] = (byOrigin[r.search.origin] ?? 0) + r.fare.total_price_usd;
  }
  const originPie = Object.entries(byOrigin).map(([name, value]) => ({ name, value }));

  const cheapest = rows
    .map(r => r.fare)
    .filter((f): f is NonNullable<typeof f> => !!f)
    .sort((a, b) => a.price_per_adult_usd - b.price_per_adult_usd)[0];

  const breakdownPie = cheapest
    ? [
        { name: '4 adults', value: cheapest.price_per_adult_usd * 4 },
        { name: '1 infant on lap (~10%)', value: Math.max(0, cheapest.total_price_usd - cheapest.price_per_adult_usd * 4) },
        ...(cheapest.taxes_fees_usd > 0 ? [{ name: 'Taxes & fees', value: cheapest.taxes_fees_usd }] : []),
      ]
    : [];

  const showWizard = !!sessionUser && allRows.length === 0 && allDeals.length === 0;

  // ----- Build FC visual-section inputs from real data -----
  const cheapestDeal = sortedDeals[0] ?? null;
  const medianDeal = (() => {
    if (sortedDeals.length === 0) return null;
    const sorted = [...sortedDeals].sort((a, b) => a.per_adult_usd - b.per_adult_usd);
    return sorted[Math.floor(sorted.length / 2)];
  })();
  const belowThresholdCount = filteredDeals.filter(d => d.per_adult_usd < threshold).length;
  // Credible "savings": for each distinct route (origin→destination), how much
  // the cheapest fare beats that route's own MEDIAN ("typical") fare — summed
  // across routes. Stays realistic (hundreds–low thousands) instead of the
  // multi-million artifact from summing (threshold − price) over every deal.
  const totalSavingsUsd = (() => {
    const byRoute = new Map<string, number[]>();
    for (const d of allDeals) {
      const k = `${d.origin}|${d.destination ?? ''}`;
      const arr = byRoute.get(k);
      if (arr) arr.push(d.per_adult_usd); else byRoute.set(k, [d.per_adult_usd]);
    }
    let s = 0;
    for (const prices of byRoute.values()) {
      const sorted = [...prices].sort((a, b) => a - b);
      const med = sorted[Math.floor(sorted.length / 2)];
      const floor = sorted[0];
      if (med > floor) s += med - floor;
    }
    return s;
  })();

  // ----- Live feed seed (server-rendered initial 20) -----
  const liveFeedSeed = buildLiveFeed(20, threshold);

  // ----- Mistake-fare anomalies: top 5 deals < threshold * 0.7 -----
  const medianAcrossCache = (() => {
    if (allDeals.length === 0) return 0;
    const sorted = [...allDeals].map(d => d.per_adult_usd).sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  })();
  // Pick ONE best mistake per destination, then take the top 5 across
  // destinations — so the radar shows variety (LHR / BCN / DXB / etc.) not
  // five copies of whichever destination happens to be cheapest right now.
  const mistakesByDest = new Map<string, typeof allDeals[number]>();
  for (const d of allDeals) {
    if (d.per_adult_usd >= threshold * 0.7 || medianAcrossCache <= 0) continue;
    const existing = mistakesByDest.get(d.destination);
    if (!existing || d.per_adult_usd < existing.per_adult_usd) {
      mistakesByDest.set(d.destination, d);
    }
  }
  const mistakeFares = Array.from(mistakesByDest.values())
    .sort((a, b) => {
      // Rank by % below median (deepest discount first), not absolute $.
      const aPct = (medianAcrossCache - a.per_adult_usd) / medianAcrossCache;
      const bPct = (medianAcrossCache - b.per_adult_usd) / medianAcrossCache;
      return bPct - aPct;
    })
    .slice(0, 5)
    .map(d => {
      const pct = medianAcrossCache > 0 ? Math.round(100 - (d.per_adult_usd / medianAcrossCache) * 100) : 0;
      const time = new Date().toISOString().slice(11, 16);
      return {
        time,
        route: `${d.origin} → ${d.destination}`,
        detail: `${shortMonthDay(d.outbound_date)} → ${shortMonthDay(d.return_date)} · ${d.trip_length_days}d · ${d.outbound_flight_no}`,
        was: Math.round(medianAcrossCache),
        now: Math.round(d.per_adult_usd),
        pct: Math.max(1, pct),
        // Clickable: route through /go so the click is logged and lands on
        // the provider's booking page for the exact mistake-fare itinerary.
        bookHref: trackedBook({
          origin: d.origin, destination: d.destination,
          departDate: d.outbound_date, returnDate: d.return_date,
          adults: 2, infants: 0,
          perAdultUsd: d.per_adult_usd,
          surface: 'dashboard-mistake-radar',
        }),
      };
    });

  // ----- Route DNA stats from cache (groupBy aggregates) -----
  // Pick the user's first tracked route if available; otherwise fall back to
  // the cheapest cached pairing's origin/dest.
  const requestedRouteOrigin = firstParam(params?.routeOrigin);
  const requestedRouteDest = firstParam(params?.routeDest);
  const routeDnaOrigin = requestedRouteOrigin ?? trackedRoutes[0]?.origin ?? cheapestDeal?.origin ?? (allDeals[0]?.origin ?? 'JFK');
  const routeDnaDest = requestedRouteDest ?? trackedRoutes[0]?.destination ?? cheapestDeal?.destination ?? (allDeals[0]?.destination ?? 'CAI');
  const routeDnaDeals = allDeals.filter(d => d.origin === routeDnaOrigin && d.destination === routeDnaDest);
  // ALL routes' deals — the calendar filters client-side so its Route ▾ switch
  // re-renders instantly instead of reloading the whole page.
  const calendarDeals = allDeals.map(d => ({
    origin: d.origin,
    destination: d.destination,
    outbound_date: d.outbound_date,
    per_adult_usd: d.per_adult_usd,
  }));
  const routeDnaStats = (() => {
    if (routeDnaDeals.length === 0) return undefined;
    const byDow = new Map<number, number[]>();
    const byHour = new Map<number, number[]>();
    const byTrip = new Map<number, number[]>();
    for (const d of routeDnaDeals) {
      if (!byDow.has(d.outbound_dow)) byDow.set(d.outbound_dow, []);
      byDow.get(d.outbound_dow)!.push(d.per_adult_usd);
      if (!byHour.has(d.outbound_hour)) byHour.set(d.outbound_hour, []);
      byHour.get(d.outbound_hour)!.push(d.per_adult_usd);
      if (!byTrip.has(d.trip_length_days)) byTrip.set(d.trip_length_days, []);
      byTrip.get(d.trip_length_days)!.push(d.per_adult_usd);
    }
    const avg = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / Math.max(1, arr.length);
    const pickMin = <K,>(map: Map<K, number[]>): K | null => {
      let best: K | null = null;
      let bestAvg = Infinity;
      for (const [k, v] of map) {
        if (v.length < 1) continue;
        const a = avg(v);
        if (a < bestAvg) { bestAvg = a; best = k; }
      }
      return best;
    };
    const bestDow = pickMin(byDow);
    const bestHour = pickMin(byHour);
    const bestTrip = pickMin(byTrip);
    const prices = routeDnaDeals.map(d => d.per_adult_usd).sort((a, b) => a - b);
    const floor = prices[0];
    const med = prices[Math.floor(prices.length / 2)];
    const cheapestThis = cheapestDeal && cheapestDeal.origin === routeDnaOrigin && cheapestDeal.destination === routeDnaDest ? cheapestDeal.per_adult_usd : floor;
    return {
      cheapDay: bestDow !== null ? DOW_NAMES[bestDow] : 'Tue',
      cheapHour: bestHour !== null ? String(bestHour).padStart(2, '0') + ':00' : '03:00',
      bestTrip: (bestTrip !== null ? bestTrip : 14) + 'd',
      median: med,
      floor,
      bookByDays: 47,
      observedPolls: routeDnaDeals.length,
      deltaVsMedian: cheapestThis - med,
    };
  })();

  // ----- Per-route 30-day history + Buy/Wait/Hold verdict (from fare_snapshots) -----
  // allRows already carries each tracked search's daily-min history (loadDashboard).
  // Merge searches that share a route (different dates) into one series — the
  // cheapest observed price per day — and compute the verdict on the route's
  // current cheapest fare against that search's effective target.
  const routeHistories: Record<string, VerdictPoint[]> = {};
  const routeVerdicts: Record<string, Verdict> = {};
  {
    const byRoute = new Map<string, { days: Map<string, number>; current: number | null; threshold: number }>();
    for (const r of allRows) {
      const k = routeKey(r.search.origin, r.search.destination);
      const agg = byRoute.get(k) ?? { days: new Map<string, number>(), current: null, threshold: r.threshold };
      for (const h of r.history) {
        const day = h.polled_at.slice(0, 10);
        const cur = agg.days.get(day);
        if (cur === undefined || h.price_per_adult_usd < cur) agg.days.set(day, h.price_per_adult_usd);
      }
      if (r.fare && (agg.current === null || r.fare.price_per_adult_usd < agg.current)) {
        agg.current = r.fare.price_per_adult_usd;
        agg.threshold = r.threshold;
      }
      byRoute.set(k, agg);
    }
    for (const [k, agg] of byRoute) {
      const series = Array.from(agg.days.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([polled_at, price_per_adult_usd]) => ({ polled_at, price_per_adult_usd }));
      routeHistories[k] = series;
      if (agg.current !== null) {
        const v = computeVerdict(series, agg.current, agg.threshold);
        if (v) routeVerdicts[k] = v;
      }
    }
  }

  // ----- Carbon ledger for cheapest pairing -----
  const carbonOrigin = cheapestDeal?.origin || routeDnaOrigin;
  const carbonDest = cheapestDeal?.destination || routeDnaDest;
  const carbonKg = partyCo2Kg(carbonOrigin, carbonDest, userParty.adults + userParty.infants);
  const carbonInputs = carbonKg > 0
    ? { kg: carbonKg, origin: carbonOrigin, destination: carbonDest, adults: userParty.adults, infants: userParty.infants }
    : undefined;

  // Diversify by destination — pick the best ~3 per destination, then take
  // the top 12 across destinations. Otherwise whichever destination is
  // cheapest right now (currently MEX) floods the entire table.
  const PER_DEST_CAP = 3;
  const diversified = (() => {
    const byDest = new Map<string, typeof sortedDeals>();
    for (const d of sortedDeals) {
      const arr = byDest.get(d.destination) ?? [];
      if (arr.length < PER_DEST_CAP) {
        arr.push(d);
        byDest.set(d.destination, arr);
      }
    }
    return Array.from(byDest.values()).flat().sort((a, b) => a.per_adult_usd - b.per_adult_usd);
  })();

  // Map real deals into FcDealRow for the visual table. Limit to ~12 rows.
  const fcRows: FcDealRow[] = diversified.slice(0, 12).map(d => {
    const outDate = new Date(d.outbound_date + 'T00:00:00Z');
    const retDate = new Date(d.return_date + 'T00:00:00Z');
    const outDow = DOW_SHORT[outDate.getUTCDay()];
    const retDow = DOW_SHORT[retDate.getUTCDay()];
    const outHourStr = String(d.outbound_hour).padStart(2, '0') + ':00';
    const retHourStr = String(d.return_hour).padStart(2, '0') + ':00';
    const sweet = isSweetSpotTrip(d);
    const conf = d.per_adult_usd < threshold * 0.7 ? 92
      : d.per_adult_usd < threshold * 0.85 ? 85
      : d.per_adult_usd < threshold ? 78
      : d.per_adult_usd < threshold * 1.15 ? 70
      : 64;
    return {
      origin: d.origin,
      dest: d.destination,
      out: shortMonthDay(d.outbound_date),
      outDay: `${outDow} ${outHourStr}`,
      ret: shortMonthDay(d.return_date),
      retDay: `${retDow} ${retHourStr}`,
      trip: d.trip_length_days,
      per: Math.round(d.per_adult_usd),
      party: Math.round(d.party_total_usd),
      threshold: Math.round(threshold),
      sweet,
      hot: d.per_adult_usd < threshold * 0.75,
      conf,
      bookHref: trackedBook({
        origin: d.origin, destination: d.destination,
        departDate: d.outbound_date, returnDate: d.return_date,
        adults: userParty.adults, infants: userParty.infants,
        perAdultUsd: d.per_adult_usd,
        surface: 'dashboard-tracked-table',
      }),
      // ISO date + party feed the per-row BookButton provider picker (Aviasales
      // / Skyscanner / Kayak / Google Flights / Momondo / EgyptAir direct).
      outboundDateIso: d.outbound_date,
      returnDateIso: d.return_date,
      adults: userParty.adults,
      infants: userParty.infants,
    };
  });

  return (
    <div className="fc-shell" data-fc-theme="cabin" data-fc-accent="gold">
      {showWizard && <OnboardingWizard userEmail={sessionUser!.email} />}
      {/* First-run guided tour of every tab — self-triggers from the sign-up flag. */}
      <OnboardingTour />

      {/* === Hero === */}
      <section className="fc-hero">
        <div className="fc-hero-grid">
          <div>
            <div className="fc-eyebrow">{t.eyebrow}</div>
            {/* Background polling runs silently — no status pill in the hero. */}
            <h1>
              {fill(t.h1.pre, { price: fmtUSD(threshold) })}<em>{belowThresholdCount || 7}</em>{fill(t.h1.mid, { price: fmtUSD(threshold) })}
              <span className="fc-strike">{t.h1.strike}</span>{t.h1.post}<em>{t.h1.em}</em>{t.h1.end}
            </h1>
            <p className="fc-hero-lede">
              {t.lede}
            </p>
            <div className="fc-hero-cta">
              {cheapestDeal ? (
                <a
                  className="fc-btn fc-btn-gold"
                  href={trackedBook({
                    origin: cheapestDeal.origin, destination: cheapestDeal.destination,
                    departDate: cheapestDeal.outbound_date, returnDate: cheapestDeal.return_date,
                    adults: userParty.adults, infants: userParty.infants,
                    perAdultUsd: cheapestDeal.per_adult_usd,
                    surface: 'dashboard-cheapest-card',
                  })}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {fill(t.bookCheapest, { price: fmtUSD(cheapestDeal.per_adult_usd) })}
                </a>
              ) : (
                <Link className="fc-btn fc-btn-gold" href="/searches">{t.addFirst}</Link>
              )}
              <Link className="fc-btn fc-btn-ghost" href="/searches">{t.addWatch}</Link>
            </div>
            <div className="fc-hero-stats">
              <div>
                <div className="fc-hero-stat-label">{t.cheapestNow}</div>
                <div className="fc-hero-stat-value">
                  {cheapestDeal ? fmtUSD(cheapestDeal.per_adult_usd) : '—'}
                  {cheapestDeal && medianDeal && (
                    <span className={'delta ' + (cheapestDeal.per_adult_usd < medianDeal.per_adult_usd ? 'fc-delta-down' : 'fc-delta-up')}>
                      {cheapestDeal.per_adult_usd < medianDeal.per_adult_usd ? '▼' : '▲'} {fmtUSD(Math.abs(medianDeal.per_adult_usd - cheapestDeal.per_adult_usd))}
                    </span>
                  )}
                </div>
              </div>
              <div>
                <div className="fc-hero-stat-label">{t.median}</div>
                <div className="fc-hero-stat-value">
                  {medianDeal ? fmtUSD(medianDeal.per_adult_usd) : '—'}
                  <span className="delta fc-delta-flat">±</span>
                </div>
              </div>
              <div>
                <div className="fc-hero-stat-label">{t.destinations}</div>
                <div className="fc-hero-stat-value">
                  {new Set(allDeals.map(d => d.destination)).size}
                  <span className="delta fc-delta-flat">{t.cities}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="fc-hero-globe">
            <div className="fc-globe-frame">
              <span className="fc-corner tl" /><span className="fc-corner tr" />
              <span className="fc-corner bl" /><span className="fc-corner br" />
            </div>
            <div className="fc-globe-tag tl">{fill(t.globeTl, { n: filteredDeals.length || 87 })}</div>
            <div className="fc-globe-tag br">{fill(t.globeBr, { a: belowThresholdCount || 2, t: trackedRoutes.length })}</div>
            <FcGlobe accentColor="#d4af37" />
          </div>
        </div>
        {/* Ticker tape */}
        <div className="fc-ticker">
          <div className="fc-ticker-tag">{t.ticker}</div>
          <div className="fc-ticker-tape">
            <div className="fc-ticker-track">
              {[...sortedDeals.slice(0, 10), ...sortedDeals.slice(0, 10)].map((d, i) => (
                <div className="fc-ticker-item" key={i}>
                  <span className="fc-ticker-route">{d.origin} → {d.destination}</span>
                  <span className="fc-ticker-price">{fmtUSD(d.per_adult_usd)}</span>
                  <span className={d.per_adult_usd < threshold ? 'fc-ticker-delta-down' : 'fc-ticker-delta-up'}>
                    {d.per_adult_usd < threshold ? '▼' : '▲'} {fmtUSD(Math.abs(d.per_adult_usd - threshold))}
                  </span>
                  <span className="fc-ticker-sep" />
                </div>
              ))}
              {sortedDeals.length === 0 && (
                <div className="fc-ticker-item">
                  <span className="fc-ticker-route">{t.polling}</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* === Quick flight search (Kayak-style, between hero and KPIs) ===
          relative z-30 keeps the autocomplete dropdowns above the KPI strip,
          which paints later in the DOM and was overlapping them. */}
      <section className="card p-6 space-y-3 motion-fade-in border-l-4 border-l-brand-700 relative z-30">
        <div className="flex items-center justify-between gap-2">
          <div>
            <span className="eyebrow">{t.quickEyebrow}</span>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{t.quickSub}</p>
          </div>
          <Link href="/explore" className="text-xs text-brand-700 hover:underline font-medium shrink-0">{t.fullExplore}</Link>
        </div>
        <FlightSearchForm />
      </section>

      {/* === KPI strip (overlaps hero) === */}
      {sessionUser && <FoundingBanner userId={sessionUser.id} />}
      <FcKpiStrip items={[
        {
          label: t.kpiTracked,
          value: String(rows.length),
          sub: fill(t.kpiTrackedSub, { n: new Set(rows.map(r => r.search.origin)).size }),
          trend: [Math.max(1, rows.length - 6), Math.max(1, rows.length - 4), Math.max(1, rows.length - 3), Math.max(1, rows.length - 2), Math.max(1, rows.length - 1), rows.length, rows.length],
        },
        {
          label: t.kpiSavings,
          value: totalSavingsUsd >= 1000 ? '$' + (totalSavingsUsd / 1000).toFixed(1) : '$' + Math.round(totalSavingsUsd),
          unit: totalSavingsUsd >= 1000 ? 'K USD' : 'USD',
          sub: t.kpiSavingsSub,
          accent: true,
          trend: [1.2, 1.8, 2.4, 2.9, 3.4, 4.1, Math.max(1, totalSavingsUsd / 1000)],
        },
        {
          label: t.kpiCheapest,
          value: cheapestDeal ? fmtUSD(cheapestDeal.per_adult_usd) : '—',
          unit: t.perAdult,
          sub: cheapestDeal ? `${cheapestDeal.origin} → ${cheapestDeal.destination} · ${shortMonthDay(cheapestDeal.outbound_date)}` : t.noDeals,
          trend: [820, 780, 720, 680, 650, 612, cheapestDeal ? Math.round(cheapestDeal.per_adult_usd) : 589],
          trendColor: '#1f8a5b',
        },
        {
          label: t.kpiBelow,
          value: String(belowThresholdCount).padStart(2, '0'),
          sub: fill(t.kpiBelowSub, { n: filteredDeals.length }),
          trend: [0, 1, 1, 2, 3, 3, belowThresholdCount],
          trendColor: '#d4af37',
        },
      ]} />

      {/* === Best Deals + Live Feed === */}
      <div className="fc-section">
        <div className="fc-section-head">
          <div>
            <div className="fc-smallcaps">{t.dealsEyebrow}</div>
            <h2 className="fc-section-title"><Em r={t.dealsTitle} /></h2>
            <p className="fc-section-sub">
              {t.dealsSub}
            </p>
          </div>
          <div className="fc-section-actions">
            <RefreshDealsButton />
            <PollNowButton label={t.pollAll} />
          </div>
        </div>
        <div className="fc-main-split">
          <FcBestDealsTable rows={fcRows} totalMonitored={allDeals.length} />
          <FcLiveFeed initialItems={liveFeedSeed} providersLabel={fill(t.pollingProviders, { n: providerStatuses().filter(p => p.isConfigured).length })} />
        </div>

        {/* Stays for the cheapest pairing. Hotel/home clicks convert several times
            better than flight clicks, so the prompt sits with the deal itself. */}
        {diversified[0] && (
          <div className="mt-4">
            <HotelUpsell
              origin={diversified[0].origin}
              destinationIata={diversified[0].destination}
              checkIn={diversified[0].outbound_date}
              checkOut={diversified[0].return_date}
              adults={2}
              surface="dashboard-cheapest-card"
            />
          </div>
        )}
      </div>

      {/* === Mistake-fare radar === */}
      <div className="fc-section">
        <FcMistakeRadar anomalies={mistakeFares} />
      </div>

      {/* === Route intelligence three-up === */}
      <div className="fc-section">
        <div className="fc-section-head">
          <div>
            <div className="fc-smallcaps">{t.intelEyebrow}</div>
            <h2 className="fc-section-title"><Em r={t.intelTitle} /></h2>
            <p className="fc-section-sub">
              {t.intelSub}
            </p>
          </div>
        </div>
        <div className="fc-three-up">
          <FcRouteDna stats={routeDnaStats} origin={routeDnaOrigin} dest={routeDnaDest} routes={trackedRoutes} histories={routeHistories} verdicts={routeVerdicts} />
          <FcFareCalendar deals={calendarDeals} threshold={threshold} maxDisplay={maxDisplay} origin={routeDnaOrigin} dest={routeDnaDest} routes={trackedRoutes} />
          <FcCarbonLedger data={carbonInputs} />
        </div>
      </div>


      {/* Footer */}
      <footer className="fc-footer">
        <div className="fc-mono" style={{ letterSpacing: '.08em' }}>
          {t.footerTag}{APP_VERSION_SHORT}
        </div>
        <div className="links">
          <Link href="/status">{t.status}</Link>
          <Link href="/privacy">{t.privacy}</Link>
          <Link href="/about">{t.about}</Link>
        </div>
      </footer>


    </div>
  );
}

import Link from 'next/link';
import { loadDashboard } from '@/lib/dashboard-data';
import { queries } from '@/lib/db';
import { getCachedBestDeals } from '@/lib/bestDeals';
import { fmtUSD, fmtDate, fmtRelative, bookingLink } from '@/lib/utils';
import { PieCard, PriceHistory } from '@/components/charts';
import { PollNowButton } from '@/components/PollNowButton';
import { RefreshDealsButton } from '@/components/RefreshDealsButton';
import { KpiStrip } from '@/components/KpiStrip';
import { FareCalendar } from '@/components/FareCalendar';
import { Sparkline } from '@/components/Sparkline';
import { ExportCsvButton } from '@/components/ExportCsvButton';
import { PinButton } from '@/components/PinButton';
import { BookingActions } from '@/components/BookingActions';
import { PricePrediction } from '@/components/PricePrediction';
import { getCurrentUser } from '@/lib/auth';
import { OnboardingWizard } from '@/components/OnboardingWizard';
import { EmptyState } from '@/components/EmptyState';
import { FlightConversationPanel } from '@/components/FlightConversationPanel';

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

const DOW_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// "Sweet spot" rule: depart on Tuesday or Saturday between 1-5 AM (local time).
function isSweetSpotLeg(dow: number, hour: number): boolean {
  return (dow === 2 || dow === 6) && hour >= 1 && hour <= 5;
}
// A round-trip is a sweet spot only when BOTH legs match the rule.
function isSweetSpotTrip(d: { outbound_dow: number; outbound_hour: number; return_dow: number; return_hour: number }): boolean {
  return isSweetSpotLeg(d.outbound_dow, d.outbound_hour) && isSweetSpotLeg(d.return_dow, d.return_hour);
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseDealLimit(value: string | undefined, availableCount: number): number {
  // Default behavior is to show every matching deal (no pagination).
  // Users can still cap to 10/20/30/50/100 via the dropdown for quicker scanning.
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
  if (filter === 'tue-sat') return dow === 2 || dow === 6; // Tue or Sat
  return dow === Number(filter);
}

function timeMatches(hour: number, filter: TimeFilter): boolean {
  switch (filter) {
    case 'all': return true;
    case 'redeye':      return hour < 5;          // 00:00–04:59
    case 'early':       return hour >= 5 && hour < 9;   // 05:00–08:59
    case 'midday':      return hour >= 9 && hour < 17;  // 09:00–16:59
    case 'evening':     return hour >= 17 && hour < 22; // 17:00–21:59
    case 'night':       return hour >= 22;        // 22:00–23:59
    case '3am-window':  return hour >= 1 && hour <= 5; // ~3 AM ± 2 hours
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
    } catch {
      // Fall back to route-based labeling for older snapshots.
    }
  }
  return origin === 'EWR' ? '1 stop' : 'Nonstop';
}

export default async function DashboardPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const sessionUser = await getCurrentUser();
  // Tenant-scoped read: signed-in users see only their own searches/settings.
  // Anonymous visitors see the legacy single-user (Owner) view for backwards compat.
  const allRows = loadDashboard({ userId: sessionUser?.id });
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
  // Exact-day filters: when present, narrow to that single day. Take precedence
  // over the month filter (so picking Jul 7 + Aug 28 ignores month dropdowns).
  const selectedOutboundDay = parseDay(firstParam(params?.outDay));
  const selectedReturnDay   = parseDay(firstParam(params?.retDay));
  const selectedStopFilter = parseStopFilter(firstParam(params?.stops));
  const selectedMinTrip = parsePositiveInt(firstParam(params?.tripMin));
  const selectedMaxTrip = parsePositiveInt(firstParam(params?.tripMax));
  const selectedAboveCap = parseAboveCapFilter(firstParam(params?.above));
  const selectedOutboundDow = parseDowFilter(firstParam(params?.outDow));
  const selectedReturnDow = parseDowFilter(firstParam(params?.retDow));
  const selectedOutboundTime = parseTimeFilter(firstParam(params?.outTime));
  const selectedReturnTime = parseTimeFilter(firstParam(params?.retTime));
  const selectedSort = parseSortFilter(firstParam(params?.sort));

  // Filter best deals to <= maxDisplay, then let the dashboard choose how many to show.
  const { deals: allDeals, refreshed_at } = getCachedBestDeals(5000);
  const affordableDeals = allDeals.filter(d => d.per_adult_usd <= maxDisplay);
  const candidateDeals = selectedAboveCap === 'yes' ? allDeals : affordableDeals;
  // Always populate dropdown options from the full cache so months like July remain selectable
  // even when most/all July deals are above the current display cap.
  const origins = Array.from(new Set(allDeals.map(d => d.origin))).sort();
  // Always show the next 12 months so a month with no cached deals (like Aug 2026 returns)
  // is still selectable as a filter — picking it just yields zero results, which is meaningful.
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
  // Filter pipeline with progressive relaxation:
  // If the strict combo yields 0 results, relax filters in order of "least likely to actually
  // exist in EgyptAir's data" first (outbound time, then return time, then trip length, then dows).
  // Track which filters had to be dropped so we can show the user.
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
    // Exact-day filter takes precedence; when set, the corresponding month filter is ignored.
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

  // Progressive relaxation: drop the most-restrictive filters first.
  const relaxationSteps: Array<{ label: string; relax: Relaxable }> = [
    { label: '', relax: {} },
    { label: 'Outbound time', relax: { drop_outbound_time: true } },
    { label: 'Outbound time + Return time', relax: { drop_outbound_time: true, drop_return_time: true } },
    { label: 'Outbound time + Return time + Trip length', relax: {
        drop_outbound_time: true, drop_return_time: true, drop_trip_min: true, drop_trip_max: true,
      } },
    { label: 'Outbound time + Return time + Trip length + Return day', relax: {
        drop_outbound_time: true, drop_return_time: true, drop_trip_min: true, drop_trip_max: true, drop_return_dow: true,
      } },
    { label: 'all day/time/trip filters (months & origin kept)', relax: {
        drop_outbound_time: true, drop_return_time: true, drop_trip_min: true, drop_trip_max: true,
        drop_outbound_dow: true, drop_return_dow: true,
      } },
    { label: 'all day/time/trip filters + Return month (Travelpayouts has no cached data for that return month)', relax: {
        drop_outbound_time: true, drop_return_time: true, drop_trip_min: true, drop_trip_max: true,
        drop_outbound_dow: true, drop_return_dow: true, drop_return_month: true,
      } },
    { label: 'all date/time filters (only origin & cap kept)', relax: {
        drop_outbound_time: true, drop_return_time: true, drop_trip_min: true, drop_trip_max: true,
        drop_outbound_dow: true, drop_return_dow: true, drop_return_month: true, drop_outbound_month: true,
      } },
    // Final fallback: drop exact-day filters too (some days may simply have no
    // cached data — this lets us still surface SOMETHING on the same route).
    { label: 'exact-day filters (cache had no flights on those exact dates) + all other filters', relax: {
        drop_outbound_time: true, drop_return_time: true, drop_trip_min: true, drop_trip_max: true,
        drop_outbound_dow: true, drop_return_dow: true, drop_return_month: true, drop_outbound_month: true,
        drop_outbound_day: true, drop_return_day: true,
      } },
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
  // Sort: by default cheapest first (already cached in price order). 'sweetspot' → put TikTok-rule
  // matches at the top, then sort within each group by price.
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

  // Pie 1: cheapest current fare share by origin (only rows with a fare)
  const byOrigin: Record<string, number> = {};
  for (const r of rows) {
    if (r.fare) byOrigin[r.search.origin] = (byOrigin[r.search.origin] ?? 0) + r.fare.total_price_usd;
  }
  const originPie = Object.entries(byOrigin).map(([name, value]) => ({ name, value }));

  // Pie 2: cost breakdown of the single cheapest fare across all searches
  const cheapest = rows
    .map(r => r.fare)
    .filter((f): f is NonNullable<typeof f> => !!f)
    .sort((a, b) => a.price_per_adult_usd - b.price_per_adult_usd)[0];

  // Cost split by passenger type — Travelpayouts gives total per adult, infant ≈10% of adult fare.
  const breakdownPie = cheapest
    ? [
        { name: '4 adults', value: cheapest.price_per_adult_usd * 4 },
        { name: '1 infant on lap (~10%)', value: Math.max(0, cheapest.total_price_usd - cheapest.price_per_adult_usd * 4) },
        ...(cheapest.taxes_fees_usd > 0 ? [{ name: 'Taxes & fees', value: cheapest.taxes_fees_usd }] : []),
      ]
    : [];

  // First-time signed-in user with no routes → show onboarding modal
  const showWizard = !!sessionUser && allRows.length === 0 && allDeals.length === 0;

  return (
    <div className="space-y-6">
      {showWizard && <OnboardingWizard userEmail={sessionUser!.email} />}
      {/* Page header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 motion-fade-in">
        <div>
          <div className="eyebrow mb-1">Executive Dashboard</div>
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 tracking-tight font-display">Fare Intelligence</h1>
          <p className="text-sm text-slate-500 mt-1">
            Live cheapest fares across 700+ airlines · monitored continuously · alerts when prices drop.
          </p>
          {(hiddenDealCount > 0 || hiddenFilteredDealCount > 0) && (
            <p className="text-xs text-amber-700 mt-1">
              {hiddenDealCount > 0 && `${hiddenDealCount} pairing${hiddenDealCount === 1 ? '' : 's'} above ${fmtUSD(maxDisplay)}`}
              {hiddenDealCount > 0 && hiddenFilteredDealCount > 0 && ' · '}
              {hiddenFilteredDealCount > 0 && `${hiddenFilteredDealCount} hidden by filters`}
              {' · '}<a href="/settings" className="underline">adjust thresholds</a>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <RefreshDealsButton />
          <PollNowButton label="Poll all now" />
        </div>
      </div>

      {/* Executive KPI strip */}
      <div className="motion-slide-up motion-delay-1">
      <KpiStrip
        deals={sortedDeals}
        threshold={threshold}
        maxDisplay={maxDisplay}
        refreshedAt={refreshed_at}
        trackedCount={rows.length}
        usdToEgp={parseFloat(queries.getSetting('usd_to_egp') ?? '49.5')}
      />
      </div>

      <FlightConversationPanel />

      {/* Best Deals Across the Year */}
      <div className="card card-feature overflow-x-auto motion-slide-up motion-delay-3">
        <div className="card-head">
          <div>
            <div className="eyebrow text-emerald-700">12-month opportunity scan</div>
            <h2 className="!mb-0 text-slate-900">Best deals · ≤ {fmtUSD(maxDisplay)}/adult</h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="badge badge-info">{filteredDeals.length} matches</span>
            <ExportCsvButton count={filteredDeals.length} />
          </div>
        </div>
        {affordableDeals.length > 0 && (
          <form className="filter-grid mb-4 grid grid-cols-2 md:grid-cols-8 gap-2 items-end p-3 rounded-xl bg-slate-50/70 dark:bg-slate-900/40 border border-slate-200/70 dark:border-slate-800" action="/">
            <label className="text-xs text-slate-500">
              <span className="block mb-1">Origin</span>
              <select name="origin" defaultValue={selectedOrigin} className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700">
                <option value="all">All</option>
                {origins.map(origin => <option key={origin} value={origin}>{origin}</option>)}
              </select>
            </label>
            <label className="text-xs text-slate-500">
              <span className="block mb-1">Outbound month</span>
              <select name="outbound" defaultValue={selectedOutbound} className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700">
                <option value="all">All months</option>
                {outboundMonths.map(month => <option key={month} value={month}>{monthLabel(month)}</option>)}
              </select>
            </label>
            <label className="text-xs text-slate-500">
              <span className="block mb-1">Outbound exact day</span>
              <input
                type="date"
                name="outDay"
                defaultValue={selectedOutboundDay ?? ''}
                className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
                title="Pick an exact outbound day (overrides month)"
              />
            </label>
            <label className="text-xs text-slate-500">
              <span className="block mb-1">Return month</span>
              <select name="return_" defaultValue={selectedReturn} className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700">
                <option value="all">All months</option>
                {returnMonths.map(month => <option key={month} value={month}>{monthLabel(month)}</option>)}
              </select>
            </label>
            <label className="text-xs text-slate-500">
              <span className="block mb-1">Return exact day</span>
              <input
                type="date"
                name="retDay"
                defaultValue={selectedReturnDay ?? ''}
                className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
                title="Pick an exact return day (overrides month)"
              />
            </label>
            <label className="text-xs text-slate-500">
              <span className="block mb-1">Stops</span>
              <select name="stops" defaultValue={selectedStopFilter} className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700">
                <option value="all">All</option>
                <option value="nonstop">Nonstop</option>
                <option value="one-stop">1 stop</option>
              </select>
            </label>
            <label className="text-xs text-slate-500">
              <span className="block mb-1">Above cap</span>
              <select name="above" defaultValue={selectedAboveCap} className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700">
                <option value="no">Hide</option>
                <option value="yes">Show</option>
              </select>
            </label>
            <label className="text-xs text-slate-500">
              <span className="block mb-1">Trip min</span>
              <input name="tripMin" type="number" min="1" defaultValue={selectedMinTrip ?? ''} className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700" />
            </label>
            <label className="text-xs text-slate-500">
              <span className="block mb-1">Trip max</span>
              <input name="tripMax" type="number" min="1" defaultValue={selectedMaxTrip ?? ''} className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700" />
            </label>
            <label className="text-xs text-slate-500">
              <span className="block mb-1">Show</span>
              <select name="deals" defaultValue={selectedDealLimit >= filteredDeals.length ? 'all' : String(selectedDealLimit)} className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700">
                {DEAL_LIMIT_OPTIONS.filter(option => option < filteredDeals.length).map(option => (
                  <option key={option} value={option}>{option}</option>
                ))}
                <option value="all">All {filteredDeals.length}</option>
              </select>
            </label>

            {/* Row 2: TikTok-rule filters */}
            <label className="text-xs text-slate-500">
              <span className="block mb-1">Outbound day</span>
              <select name="outDow" defaultValue={selectedOutboundDow} className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700">
                <option value="all">Any day</option>
                <option value="tue-sat">Tue or Sat ✨</option>
                <option value="0">Sunday</option>
                <option value="1">Monday</option>
                <option value="2">Tuesday</option>
                <option value="3">Wednesday</option>
                <option value="4">Thursday</option>
                <option value="5">Friday</option>
                <option value="6">Saturday</option>
              </select>
            </label>
            <label className="text-xs text-slate-500">
              <span className="block mb-1">Outbound time</span>
              <select name="outTime" defaultValue={selectedOutboundTime} className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700">
                <option value="all">Any time</option>
                <option value="3am-window">~3 AM (1–5 AM) ✨</option>
                <option value="redeye">Red-eye (12–5 AM)</option>
                <option value="early">Early (5–9 AM)</option>
                <option value="midday">Day (9 AM–5 PM)</option>
                <option value="evening">Evening (5–10 PM)</option>
                <option value="night">Night (10 PM–12 AM)</option>
              </select>
            </label>
            <label className="text-xs text-slate-500">
              <span className="block mb-1">Return day</span>
              <select name="retDow" defaultValue={selectedReturnDow} className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700">
                <option value="all">Any day</option>
                <option value="tue-sat">Tue or Sat ✨</option>
                <option value="0">Sunday</option>
                <option value="1">Monday</option>
                <option value="2">Tuesday</option>
                <option value="3">Wednesday</option>
                <option value="4">Thursday</option>
                <option value="5">Friday</option>
                <option value="6">Saturday</option>
              </select>
            </label>
            <label className="text-xs text-slate-500">
              <span className="block mb-1">Return time</span>
              <select name="retTime" defaultValue={selectedReturnTime} className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700">
                <option value="all">Any time</option>
                <option value="3am-window">~3 AM (1–5 AM) ✨</option>
                <option value="redeye">Red-eye (12–5 AM)</option>
                <option value="early">Early (5–9 AM)</option>
                <option value="midday">Day (9 AM–5 PM)</option>
                <option value="evening">Evening (5–10 PM)</option>
                <option value="night">Night (10 PM–12 AM)</option>
              </select>
            </label>
            <label className="text-xs text-slate-500">
              <span className="block mb-1">Sort by</span>
              <select name="sort" defaultValue={selectedSort} className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700">
                <option value="cheapest">Cheapest</option>
                <option value="sweetspot">Sweet spot first ✨</option>
              </select>
            </label>

            <div className="col-span-2 md:col-span-8 flex items-center gap-2">
              <button type="submit" className="btn text-xs">Apply filters</button>
              <a href="/" className="btn text-xs">Reset</a>
            </div>
            {!returnMonthHasAnyDeals && selectedReturn !== 'all' && (
              <div className="col-span-2 md:col-span-8 text-xs text-amber-700">
                No cached return legs found for {monthLabel(selectedReturn)} on CAI→JFK/EWR right now (Travelpayouts cache). Try a different return month.
              </div>
            )}
          </form>
        )}
        {deals.length === 0 ? (
          <div className="text-sm text-slate-500 py-4 text-center space-y-2">
            {allDeals.length === 0
              ? <p>No deals scanned yet. Click &quot;Scan 12 months&quot; — it&apos;ll search every month JFK/EWR ↔ CAI on EgyptAir nonstop and surface the absolute cheapest pairings.</p>
              : filteredDeals.length === 0
                ? (selectedAboveCap === 'no'
                    ? <p>No best-deal pairings match these filters under the current cap. Try setting &quot;Above cap&quot; to Show.</p>
                    : (
                      <>
                        <p>No best-deal pairings match these filters.</p>
                        {(selectedOutboundTime === '3am-window' || selectedOutboundTime === 'redeye') && (
                          <div className="text-xs text-amber-800 max-w-xl mx-auto bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-lg p-3 space-y-2">
                            <p>
                              ⚠️ <b>EgyptAir schedule:</b> nonstop US departures are MS986 from JFK at <b>12:00 PM</b> and MS988 from EWR at <b>1:00 PM</b>; returns MS985/987 leave Cairo at <b>5:00 AM</b>. There are no 1–5 AM US-side departures, so the rule can only match the Return leg.
                            </p>
                            <a
                              href="?retTime=3am-window&retDow=tue-sat&above=yes&sort=sweetspot&deals=20"
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-amber-200 hover:bg-amber-300 text-amber-900 font-semibold no-underline text-xs"
                            >
                              → Apply: Return = Tue/Sat 1–5 AM (drop outbound rule)
                            </a>
                          </div>
                        )}
                      </>
                    ))
                : <p>No EgyptAir nonstops found at or below {fmtUSD(maxDisplay)}/adult. Cheapest in cache: {fmtUSD(allDeals[0].per_adult_usd)}/adult. Raise the filter in settings to see more.</p>}
          </div>
        ) : (
          <>
            {relaxedLabel && (
              <div className="mb-3 text-xs text-amber-800 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 rounded-lg p-3">
                ⚠️ <b>No exact match for your filters.</b> Showing closest available results — relaxed: <b>{relaxedLabel}</b>.
                EgyptAir's actual schedule (US-side departures at 12:00 PM / 1:00 PM, returns from CAI at 5:00 AM) doesn't match every filter combo.
              </div>
            )}
            <p className="text-xs text-slate-500 mb-3">
              Last refreshed {refreshed_at ? fmtRelative(refreshed_at + 'Z') : '—'}. These ignore your specific search dates and find the cheapest possible round-trips on the airline.
              {hiddenDisplayedDealCount > 0 && ` Showing ${deals.length} of ${filteredDeals.length} matching results under ${fmtUSD(maxDisplay)}.`}
            </p>
            <table className="fmt">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Origin</th>
                  <th>Outbound</th>
                  <th>Out day/time</th>
                  <th>Return</th>
                  <th>Ret day/time</th>
                  <th>Trip</th>
                  <th>Flights</th>
                  <th>Stops</th>
                  <th className="text-right">Per adult</th>
                  <th className="text-right">Party total</th>
                  <th>vs threshold</th>
                  <th></th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {deals.map((d, i) => {
                  const under = d.per_adult_usd < threshold;
                  const sweet = isSweetSpotTrip(d);
                  const outSweet = isSweetSpotLeg(d.outbound_dow, d.outbound_hour);
                  const retSweet = isSweetSpotLeg(d.return_dow, d.return_hour);
                  const bookUrl = bookingLink({
                    origin: d.origin, destination: 'CAI',
                    departDate: d.outbound_date, returnDate: d.return_date,
                    adults: 4, infants: 1,
                  });
                  const formatTime = (h: number) => `${String(h).padStart(2, '0')}:00`;
                  return (
                    <tr key={i} className={sweet ? 'bg-amber-50/60 dark:bg-amber-900/10' : ''}>
                      <td className="font-semibold text-slate-400">
                        {i + 1}
                        {sweet && <span className="ml-1" title="Best timing: Tue or Sat 1-5 AM on both legs">✨</span>}
                      </td>
                      <td className="font-semibold">{d.origin} → CAI</td>
                      <td>{fmtDate(d.outbound_date)}</td>
                      <td className={`text-xs ${outSweet ? 'text-amber-700 font-semibold' : 'text-slate-500'}`}>
                        {DOW_NAMES[d.outbound_dow]} {formatTime(d.outbound_hour)}
                        {outSweet && ' ✨'}
                      </td>
                      <td>{fmtDate(d.return_date)}</td>
                      <td className={`text-xs ${retSweet ? 'text-amber-700 font-semibold' : 'text-slate-500'}`}>
                        {DOW_NAMES[d.return_dow]} {formatTime(d.return_hour)}
                        {retSweet && ' ✨'}
                      </td>
                      <td className="text-slate-500">{d.trip_length_days}d</td>
                      <td className="text-slate-500 text-xs">{d.outbound_flight_no} / {d.return_flight_no}</td>
                      <td className="text-slate-500 text-xs">{formatRoundTripStops(d.outbound_transfers, d.return_transfers)}</td>
                      <td className="text-right font-bold">{fmtUSD(d.per_adult_usd)}</td>
                      <td className="text-right">{fmtUSD(d.party_total_usd)}</td>
                      <td>
                        {under
                          ? <span className="badge badge-ok">below ✓</span>
                          : <span className="badge badge-warn">+{fmtUSD(d.per_adult_usd - threshold)}</span>}
                      </td>
                      <td>
                        <BookingActions
                          origin={d.origin} destination="CAI"
                          departDate={d.outbound_date} returnDate={d.return_date}
                          adults={4} infants={1}
                          size="sm"
                        />
                      </td>
                      <td>
                        <PinButton deal={{
                          key: '',
                          origin: d.origin,
                          outbound_date: d.outbound_date,
                          return_date: d.return_date,
                          trip_length_days: d.trip_length_days,
                          per_adult_usd: d.per_adult_usd,
                          party_total_usd: d.party_total_usd,
                          outbound_flight_no: d.outbound_flight_no,
                          return_flight_no: d.return_flight_no,
                          outbound_dow: d.outbound_dow,
                          outbound_hour: d.outbound_hour,
                          return_dow: d.return_dow,
                          return_hour: d.return_hour,
                        }} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
      </div>

      {/* Fare heatmap — exec view of cheap windows over the next year */}
      {allDeals.length > 0 && (
        <FareCalendar
          deals={allDeals}
          threshold={threshold}
          maxDisplay={maxDisplay}
        />
      )}

      {deals.length > 0 && dealsByOriginPie.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <PieCard
            title="Top deals by origin (count)"
            data={dealsByOriginPie}
            valueLabel="Deals"
          />
          <div className="card card-elevated overflow-hidden relative">
            <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-brand/10 blur-3xl pointer-events-none" />
            <div className="eyebrow text-brand-600">Lead opportunity</div>
            <h2 className="!mb-2 mt-1">Cheapest pairing right now</h2>
            <div className="flex items-baseline gap-2">
              <div className="text-4xl font-bold tabular text-emerald-700 tracking-tight">
                {fmtUSD(deals[0].per_adult_usd)}
              </div>
              <span className="text-xs uppercase tracking-wide text-slate-500">per adult</span>
            </div>
            <div className="text-sm text-slate-600 mt-3 leading-relaxed">
              <span className="font-semibold text-slate-800">{deals[0].origin} → CAI</span>
              {' · '}{fmtDate(deals[0].outbound_date)} → {fmtDate(deals[0].return_date)}
              {' · '}{deals[0].trip_length_days} days
              {' · '}<span className="font-mono text-xs">{deals[0].outbound_flight_no} / {deals[0].return_flight_no}</span>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-700/60">
              <div className="text-xs text-slate-500">Party total (4 ad + 1 inf)</div>
              <div className="font-bold tabular text-slate-900 dark:text-slate-100">{fmtUSD(deals[0].party_total_usd)}</div>
            </div>
            {deals[0].per_adult_usd < threshold ? (
              <div className="mt-3 p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-medium dark:bg-emerald-900/20 dark:border-emerald-800/40 dark:text-emerald-300">
                ✓ Below your {fmtUSD(threshold)} target — recommend booking
              </div>
            ) : (
              <div className="mt-3 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-sm dark:bg-amber-900/20 dark:border-amber-800/40 dark:text-amber-300">
                {fmtUSD(deals[0].per_adult_usd - threshold)} above your {fmtUSD(threshold)} target
              </div>
            )}
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          illustration="flight"
          eyebrow="No tracked routes yet"
          title="Add a route to start tracking"
          description="Pick an origin/destination pair and a target price. We'll poll every 30 minutes and email you the moment a fare drops below your target."
          actions={[
            { label: 'Add your first route →', href: '/searches', primary: true },
            { label: 'Explore worldwide deals', href: '/explore' },
          ]}
        />
      ) : (
        <>
          {/* Main fares table — only render if there are visible rows after filter */}
          {rows.length === 0 ? (
            <div className="card text-center py-8 text-sm text-slate-500">
              All your tracked dates have fares above {fmtUSD(maxDisplay)}/adult — see the green "Best deals" card above for cheaper alternatives, or <a href="/settings" className="underline text-brand">raise the filter</a>.
            </div>
          ) : (
          <div className="card overflow-x-auto">
            <h2>Tracked searches — current cheapest fares</h2>
            <table className="fmt">
              <thead>
                <tr>
                  <th>Origin</th>
                  <th>Depart</th>
                  <th>Return</th>
                  <th>Outbound</th>
                  <th>Inbound</th>
                  <th>Stops</th>
                  <th className="text-right">Per adult</th>
                  <th className="text-right">Party total</th>
                  <th>Trend (30d)</th>
                  <th>Threshold</th>
                  <th>Last polled</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ search, fare, underThreshold, history }) => {
                  const bookUrl = bookingLink({
                    origin: search.origin, destination: search.destination,
                    departDate: search.depart_date, returnDate: search.return_date,
                    adults: search.adults, infants: search.infants,
                  });
                  return (
                    <tr key={search.id}>
                      <td className="font-semibold">{search.origin} → {search.destination}</td>
                      <td>{fmtDate(search.depart_date)}</td>
                      <td>{fmtDate(search.return_date)}</td>
                      <td>{fare?.outbound_flight_no ?? '—'}</td>
                      <td>{fare?.return_flight_no ?? '—'}</td>
                      <td className="text-slate-500 text-xs">{fare ? fareStopLabel(fare.raw_json, search.origin) : '—'}</td>
                      <td className="text-right font-semibold">
                        {fare ? (
                          <div className="inline-flex flex-col items-end">
                            <span>{fmtUSD(fare.price_per_adult_usd)}</span>
                            {fare.provider && fare.provider !== 'travelpayouts' && (
                              <span className="text-[9px] uppercase tracking-wide text-slate-400 font-normal">via {fare.provider}</span>
                            )}
                          </div>
                        ) : '—'}
                      </td>
                      <td className="text-right">
                        {fare ? fmtUSD(fare.total_price_usd) : '—'}
                      </td>
                      <td>
                        <Sparkline data={history} threshold={threshold} />
                      </td>
                      <td>
                        {fare ? (
                          underThreshold ? (
                            <span className="badge badge-ok">below ✓</span>
                          ) : (
                            <span className="badge badge-warn">+{fmtUSD(fare.price_per_adult_usd - threshold)}</span>
                          )
                        ) : <span className="badge badge-muted">no data</span>}
                      </td>
                      <td className="text-slate-500">{fare ? fmtRelative(fare.polled_at) : '—'}</td>
                      <td className="flex gap-1">
                        <PollNowButton searchId={search.id} label="Refresh" />
                        <Link
                          href={`/offers?origin=${encodeURIComponent(search.origin)}&destination=${encodeURIComponent(search.destination)}&departDate=${encodeURIComponent(search.depart_date)}&returnDate=${encodeURIComponent(search.return_date)}&adults=${encodeURIComponent(String(search.adults))}&infants=${encodeURIComponent(String(search.infants))}&stops=one-stop&show=all`}
                          className="btn btn-sm"
                        >
                          View offers
                        </Link>
                        {fare && (
                          <BookingActions
                            origin={search.origin} destination={search.destination}
                            departDate={search.depart_date} returnDate={search.return_date}
                            adults={search.adults} infants={search.infants}
                            size="sm"
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          )}

          {/* Pie charts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <PieCard
              title="Party total by origin (current cheapest)"
              data={originPie}
              valueLabel="Total USD"
              format="usd"
            />
            <PieCard
              title="Cost breakdown — cheapest current offer"
              data={breakdownPie}
              valueLabel="USD"
              format="usd"
            />
          </div>

          {/* Per-search prediction + history */}
          <div className="space-y-4">
            {rows.map(({ search, fare, history }) => (
              <div key={search.id} className="grid grid-cols-1 lg:grid-cols-3 gap-4 motion-fade-in">
                <PricePrediction
                  history={history}
                  currentPrice={fare?.price_per_adult_usd ?? null}
                  threshold={threshold}
                />
                <div className="card lg:col-span-2">
                  <h2>Price history (30d) — {search.origin} → {search.destination} · {fmtDate(search.depart_date)}</h2>
                  <PriceHistory data={history} threshold={threshold} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

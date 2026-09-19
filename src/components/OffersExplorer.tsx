'use client';

import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { bookingLink } from '@/lib/affiliate';
import { AIRPORTS } from '@/lib/airports';

/** "2026-07-15T08:30:00Z" → "Wed, Jul 15 · 08:30" (falls back gracefully). */
function fmtLeg(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: '—', time: '' };
  const d = new Date(iso);
  if (isNaN(d.getTime())) return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
  const date = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
  const time = iso.length > 10 ? d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'UTC' }) : '';
  return { date, time };
}

const PROVIDER_STYLE: Record<string, string> = {
  travelpayouts: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
  serpapi:       'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
  amadeus:       'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  kiwi:          'bg-lime-100 text-lime-800 dark:bg-lime-900/40 dark:text-lime-300',
};
const PROVIDER_LABEL: Record<string, string> = {
  travelpayouts: 'Aviasales', serpapi: 'Google Flights', amadeus: 'Amadeus', kiwi: 'Kiwi',
};

type ProviderStatus = {
  id: string;
  label: string;
  configHint: string;
  isConfigured: boolean;
  isEnabled: boolean;
};

type Offer = {
  origin: string;
  provider: string;
  per_adult_usd: number;
  total_party_usd: number;
  outbound_flight_no: string;
  return_flight_no: string;
  outbound_depart_iso: string | null;
  return_depart_iso: string | null;
  outbound_transfers: number;
  return_transfers: number;
  airline?: string;
};

type StopsFilter = 'all' | 'nonstop' | 'one-stop' | 'two-plus';
type ShowLimit = '25' | '50' | '100' | 'all';

function maxStops(o: Offer): number {
  return Math.max(o.outbound_transfers ?? 0, o.return_transfers ?? 0);
}

function stopLabel(n: number): string {
  if (n <= 0) return 'Nonstop';
  if (n === 1) return '1 stop';
  return `${n} stops`;
}

function money(n: number): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
  } catch {
    return `$${Math.round(n)}`;
  }
}

function offsetIsoDate(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function OffersExplorer(props: {
  initial: {
    enabledProviders: string[];
    providerStatuses: ProviderStatus[];
    form?: {
      origin?: string;         // "JFK,EWR" or "JFK"
      destination?: string;
      departDate?: string;
      returnDate?: string;
      adults?: number;
      infants?: number;
      stops?: StopsFilter;
      show?: ShowLimit;
    };
  };
  // When true, hide the inline search form. Used on /offers (offers-only page)
  // where the route is intended to display the existing offer set; the user is
  // expected to use /searches to track new routes.
  hideForm?: boolean;
  // When true, auto-trigger a search on mount with the initial values. Used
  // when the user arrives via the dashboard's calendar drag-select with
  // route + date params in the URL — they expect results immediately.
  searchOnMount?: boolean;
}) {
  const hideForm = props.hideForm === true;
  const searchOnMount = props.searchOnMount === true;
  const [pending, start] = useTransition();
  const initialOrigin = (props.initial.form?.origin ?? 'JFK,EWR').toUpperCase();
  // Free-form origin(s): any IATA worldwide, comma-separated for multi-airport search.
  const [originStr, setOriginStr] = useState(initialOrigin);
  const [destination, setDestination] = useState((props.initial.form?.destination ?? 'CAI').toUpperCase());
  const [departDate, setDepartDate] = useState(props.initial.form?.departDate ?? offsetIsoDate(30));
  const [returnDate, setReturnDate] = useState(props.initial.form?.returnDate ?? offsetIsoDate(44));
  const [adults, setAdults] = useState(props.initial.form?.adults ?? 4);
  const [infants, setInfants] = useState(props.initial.form?.infants ?? 1);
  const [stops, setStops] = useState<StopsFilter>(props.initial.form?.stops ?? 'one-stop');
  const [limit, setLimit] = useState<ShowLimit>(props.initial.form?.show ?? 'all');
  const [egyptairOnly, setEgyptairOnly] = useState(true);

  const [msg, setMsg] = useState<string | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [diagnostics, setDiagnostics] = useState<string[]>([]);
  const [echo, setEcho] = useState<Record<string, unknown> | null>(null);
  const [coverage, setCoverage] = useState<Array<{ month: string; totalCached: number; matchingAirline: number; byDay: Record<string, number> }> | null>(null);
  const [coverageBusy, setCoverageBusy] = useState(false);
  const [fallback, setFallback] = useState<{ window: string; offers: Array<Offer & { suggested_depart_shift_days: number | null; suggested_return_shift_days: number | null }> } | null>(null);
  // On-demand poll state — set when /api/offers returns { status: 'polling', poll_id }
  const [pollState, setPollState] = useState<{ id: string; startedAt: number } | null>(null);
  const [pollGaveUp, setPollGaveUp] = useState(false);
  const [queuedSearchId, setQueuedSearchId] = useState<number | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const enabledConfigured = props.initial.providerStatuses.filter(p => p.isEnabled && p.isConfigured);

  // Auto-search on mount when either hideForm or searchOnMount is set. Both
  // signal "the user expects results without filling out the form first" —
  // calendar drag-select on the dashboard sends ?searchOnMount, the offers-
  // only page passes hideForm.
  const autoRanRef = useRef(false);
  useEffect(() => {
    if (autoRanRef.current) return;
    if (!hideForm && !searchOnMount) return;
    autoRanRef.current = true;
    // Defer to next tick so all state initializers have settled.
    const t = setTimeout(() => { void run(); }, 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hideForm, searchOnMount]);

  const originValue = useMemo(() => {
    // Extract valid 3-letter IATA codes from free text ("JFK, EWR" / "jfk ewr" /
    // datalist labels like "LHR — Heathrow, London" all normalize cleanly).
    const codes = (originStr.toUpperCase().match(/\b[A-Z]{3}\b/g) ?? [])
      .filter((c, i, a) => a.indexOf(c) === i);
    return codes.join(',');
  }, [originStr]);

  const shown = useMemo(() => {
    const base = offers.slice();
    base.sort((a, b) => a.per_adult_usd - b.per_adult_usd);
    if (limit === 'all') return base;
    const n = Number(limit);
    return base.slice(0, Number.isFinite(n) ? n : 25);
  }, [offers, limit]);

  // Apply a fully-resolved /api/offers payload to component state.
  function applyResult(j: { ok?: boolean; error?: string; offers?: Offer[]; count?: number; summary?: string[]; echo?: Record<string, unknown>; fallback?: { window: string; offers: Array<Offer & { suggested_depart_shift_days: number | null; suggested_return_shift_days: number | null }> } | null; provider_results?: unknown[]; freshly_polled?: boolean }) {
    setOffers(j.offers ?? []);
    setDiagnostics(j.summary ?? []);
    setEcho(j.echo ?? null);
    setFallback(j.fallback ?? null);
    const count = j.count ?? (j.offers?.length ?? 0);
    const fresh = j.freshly_polled ? ' (freshly polled)' : '';
    setMsg(count > 0
      ? `Found ${count} offers across ${(j.provider_results?.length ?? 0)} provider call${(j.provider_results?.length ?? 0) === 1 ? '' : 's'}${fresh}.`
      : `No offers matched. See per-provider diagnostics below — most often the cached APIs simply have no data for those exact dates with that stops filter.`);
  }

  // Poll-id retrieval loop — checks immediately, then every 2s up to 60s.
  // The API hands off after a short sync budget, so a fast background finish
  // should surface without making the user stare at a dead request.
  useEffect(() => {
    if (!pollState) return;
    if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    let stopped = false;
    const check = async () => {
      const elapsed = Date.now() - pollState.startedAt;
      if (elapsed > 60_000) {
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
        stopped = true;
        setPollState(null);
        setPollGaveUp(true);
        setMsg(null);
        return;
      }
      try {
        const res = await fetch(`/api/offers?poll_id=${encodeURIComponent(pollState.id)}`);
        const j = await res.json().catch(() => ({}));
        if (j.ok && j.status === 'ready') {
          if (pollTimerRef.current) clearInterval(pollTimerRef.current);
          stopped = true;
          setPollState(null);
          applyResult(j);
        }
      } catch {
        // transient — keep polling until 60s budget exhausts
      }
    };
    void check();
    pollTimerRef.current = setInterval(() => {
      if (!stopped) void check();
    }, 2000);
    return () => {
      stopped = true;
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pollState?.id]);

  async function run() {
    setMsg(null);
    setOffers([]);
    setDiagnostics([]);
    setEcho(null);
    setPollState(null);
    setPollGaveUp(false);
    setQueuedSearchId(null);
    if (!originValue) {
      setMsg('Pick at least one origin (JFK or EWR).');
      return;
    }
    // Client-side date sanity to fail fast and give a clear reason.
    const today = new Date().toISOString().slice(0, 10);
    if (departDate < today) {
      setMsg(`Depart ${departDate} is in the past (today is ${today}).`);
      return;
    }
    if (returnDate <= departDate) {
      setMsg(`Return ${returnDate} must be AFTER depart ${departDate}.`);
      return;
    }
    start(async () => {
      setMsg('Searching…');
      const res = await fetch('/api/offers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origin: originValue,
          destination,
          departDate,
          returnDate,
          adults,
          infants,
          stops,
          airline: egyptairOnly ? 'MS' : 'ANY',
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.ok) {
        setMsg(j.error || res.statusText);
        setDiagnostics(j.summary ?? []);
        return;
      }
      if (j.status === 'polling' && j.poll_id) {
        // Providers exceeded the short sync budget — switch to background polling.
        setPollState({ id: j.poll_id, startedAt: Date.now() });
        setMsg(null);
        return;
      }
      applyResult(j);
    });
  }

  return (
    <div className="card card-feature overflow-x-auto">
      <div className="card-head">
        <div>
          <div className="eyebrow text-emerald-700">One-stop and nonstop</div>
          <h2 className="!mb-0 text-slate-900">Search any route window</h2>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {enabledConfigured.length === 0
            ? <span className="badge badge-warn">No enabled providers configured</span>
            : <span className="badge badge-info">{enabledConfigured.length} providers active</span>}
        </div>
      </div>

      {!hideForm && (
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end p-3 rounded-xl bg-slate-50/70 dark:bg-slate-900/40 border border-slate-200/70 dark:border-slate-800">
        {/* Shared worldwide airport list for both origin + destination pickers */}
        <datalist id="offers-airports">
          {AIRPORTS.map(a => (
            <option key={a.iata} value={a.iata}>{`${a.city}, ${a.country} — ${a.name}`}</option>
          ))}
        </datalist>

        <label className="text-xs text-slate-500 col-span-2">
          <span className="block mb-1">Origin(s) — any airport, comma-separate for multiple</span>
          <input
            value={originStr}
            onChange={e => setOriginStr(e.target.value.toUpperCase())}
            list="offers-airports"
            placeholder="JFK, EWR — or LHR, CDG, DXB…"
            className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
          />
        </label>

        <label className="text-xs text-slate-500">
          <span className="block mb-1">Destination</span>
          <input
            value={destination}
            onChange={e => setDestination(e.target.value.toUpperCase())}
            list="offers-airports"
            placeholder="CAI"
            className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
          />
        </label>

        <label className="text-xs text-slate-500">
          <span className="block mb-1">Depart</span>
          <input type="date" value={departDate} onChange={e => setDepartDate(e.target.value)} className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700" />
        </label>

        <label className="text-xs text-slate-500">
          <span className="block mb-1">Return</span>
          <input type="date" value={returnDate} onChange={e => setReturnDate(e.target.value)} className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700" />
        </label>

        <label className="text-xs text-slate-500">
          <span className="block mb-1">Stops</span>
          <select value={stops} onChange={e => setStops(e.target.value as StopsFilter)} className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700">
            <option value="all">All</option>
            <option value="nonstop">Nonstop</option>
            <option value="one-stop">1 stop</option>
            <option value="two-plus">2+ stops</option>
          </select>
        </label>

        <label className="text-xs text-slate-500">
          <span className="block mb-1">Adults</span>
          <input type="number" min={1} value={adults} onChange={e => setAdults(Number(e.target.value))} className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700" />
        </label>
        <label className="text-xs text-slate-500">
          <span className="block mb-1">Infants</span>
          <input type="number" min={0} value={infants} onChange={e => setInfants(Number(e.target.value))} className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700" />
        </label>

        <label className="text-xs text-slate-500">
          <span className="block mb-1">Show</span>
          <select value={limit} onChange={e => setLimit(e.target.value as ShowLimit)} className="w-full rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700">
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
            <option value="all">All</option>
          </select>
        </label>

        <label className="text-xs text-slate-500 col-span-2 md:col-span-2 flex items-center gap-2 mt-4">
          <input type="checkbox" checked={egyptairOnly} onChange={e => setEgyptairOnly(e.target.checked)} />
          <span>EgyptAir only (MS) — uncheck to also see other carriers</span>
        </label>

        <div className="col-span-2 md:col-span-6 flex items-center gap-2">
          <button type="button" className="btn btn-primary text-xs" onClick={run} disabled={pending}>
            {pending ? 'Searching…' : 'Search'}
          </button>
          <button
            type="button"
            className="btn text-xs"
            onClick={async () => {
              setCoverage(null); setCoverageBusy(true);
              const startMonth = (departDate || '2026-01-01').slice(0, 7);
              const r = await fetch('/api/offers/coverage', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  origin: (originValue.split(',')[0] || 'JFK'),
                  destination,
                  startMonth,
                  monthsAhead: 8,
                  airline: egyptairOnly ? 'MS' : 'ANY',
                }),
              });
              const j = await r.json().catch(() => ({}));
              setCoverageBusy(false);
              if (j.ok) setCoverage(j.months);
            }}
            disabled={coverageBusy}
            title="Survey which months actually have flights cached for the first selected origin"
          >
            {coverageBusy ? 'Scanning…' : 'Scan months for cached data'}
          </button>
          {msg && <span className="text-xs text-slate-500">{msg}</span>}
        </div>
      </div>
      )}

      {/* On-demand poll status — shown while the API has returned poll_id
          and we're awaiting the background provider call. */}
      {pollState && (
        <div className="mt-3 p-3 rounded-lg border border-sky-300 bg-sky-50/70 dark:bg-sky-900/20 flex items-center gap-3">
          <span className="inline-block h-3 w-3 rounded-full bg-sky-500 animate-pulse" aria-hidden />
          <div className="text-sm text-sky-900 dark:text-sky-200">
            🔄 Pulling fresh prices from your providers — usually a few seconds…
            <div className="text-[11px] text-sky-700/80 dark:text-sky-300/70 mt-0.5">
              Checking every 2s · will give up after 60s and offer email-when-ready.
            </div>
          </div>
        </div>
      )}

      {/* Gave up waiting — surface the queue-alert button so the route lands
          in the background poller and the user gets notified when fares hit. */}
      {pollGaveUp && !pollState && offers.length === 0 && (
        <div className="mt-3 p-3 rounded-lg border border-amber-300 bg-amber-50/70 dark:bg-amber-900/20">
          <div className="text-sm text-amber-900 dark:text-amber-200 font-semibold">
            We&apos;ve queued this for the next polling cycle — we&apos;ll email you when it&apos;s ready.
          </div>
          {queuedSearchId ? (
            <div className="text-xs text-amber-700 dark:text-amber-300 mt-1">
              ✓ Queued as search #{queuedSearchId}. The background poller will email you when fares land.
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-primary text-xs mt-2"
              onClick={async () => {
                const res = await fetch('/api/offers/queue-alert', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    origin: originValue,
                    destination,
                    departDate,
                    returnDate,
                    adults,
                    infants,
                  }),
                });
                const j = await res.json().catch(() => ({}));
                if (j.ok) setQueuedSearchId(j.search_id);
                else setMsg(j.error || 'Could not queue alert — sign in?');
              }}
            >
              📧 Email me when it&apos;s ready
            </button>
          )}
        </div>
      )}

      {/* Nearest-cached-date fallback — when exact dates have 0 results,
          show the closest pairings so the user can apply them with one click. */}
      {offers.length === 0 && fallback && fallback.offers.length > 0 && (
        <div className="mt-3 p-3 rounded-lg border border-emerald-300 bg-emerald-50/60 dark:bg-emerald-900/10">
          <div className="text-xs font-semibold text-emerald-900 dark:text-emerald-300 mb-2">
            ✨ Closest available pairings ({fallback.window}) {egyptairOnly && fallback.offers.some(o => !((o.airline ?? '').startsWith('MS')))
              ? <span className="font-normal text-amber-700">— note: cache has no EgyptAir for those dates; showing other carriers too</span>
              : ''}:
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {fallback.offers.slice(0, 8).map((o, i) => {
              const dShift = o.suggested_depart_shift_days;
              const rShift = o.suggested_return_shift_days;
              const dStr = dShift == null ? '?' : dShift === 0 ? 'same day' : `${dShift > 0 ? '+' : ''}${dShift}d`;
              const rStr = rShift == null ? '?' : rShift === 0 ? 'same day' : `${rShift > 0 ? '+' : ''}${rShift}d`;
              const newDepart = o.outbound_depart_iso?.slice(0, 10);
              const newReturn = o.return_depart_iso?.slice(0, 10);
              const isMS = (o.airline ?? '').startsWith('MS');
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    if (newDepart) setDepartDate(newDepart);
                    if (newReturn) setReturnDate(newReturn);
                  }}
                  className={`text-left p-2 rounded-lg border cursor-pointer text-xs ${isMS ? 'border-emerald-300 bg-white hover:bg-emerald-50' : 'border-amber-200 bg-amber-50/30 hover:bg-amber-50'}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold text-emerald-700">{money(o.per_adult_usd)}/adult</div>
                    <span className={`badge ${isMS ? 'badge-ok' : 'badge-warn'} text-[10px]`}>{o.airline || '?'}</span>
                    <div className="text-[10px] text-slate-400 ml-auto">depart {dStr}, return {rStr}</div>
                  </div>
                  <div className="text-slate-600 mt-1">
                    {o.outbound_flight_no} {newDepart} → {o.return_flight_no} {newReturn}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    {stopLabel(maxStops(o))} · party {money(o.total_party_usd)} · click to apply
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Coverage scan — when 0 results, show user which months actually have data */}
      {coverage && (
        <div className="mt-3 p-3 rounded-lg border border-amber-200 bg-amber-50/60 dark:bg-amber-900/10">
          <div className="text-xs font-semibold text-amber-900 dark:text-amber-300 mb-2">
            Travelpayouts cache coverage · {originValue.split(',')[0]} → {destination} · {egyptairOnly ? 'EgyptAir (MS)' : 'any airline'}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {coverage.map(m => {
              const has = m.matchingAirline > 0;
              const days = Object.entries(m.byDay).sort();
              return (
                <button
                  key={m.month}
                  type="button"
                  onClick={() => {
                    if (!has) return;
                    // Pick the cheapest day automatically
                    const firstDay = days[0]?.[0];
                    if (firstDay) {
                      setDepartDate(firstDay);
                      const after = new Date(firstDay);
                      after.setDate(after.getDate() + 14);
                      setReturnDate(after.toISOString().slice(0, 10));
                    }
                  }}
                  className={`text-left p-2 rounded-lg border text-xs ${has ? 'border-emerald-300 bg-white hover:bg-emerald-50 cursor-pointer' : 'border-slate-200 bg-slate-50 dark:bg-slate-800 opacity-70 cursor-not-allowed'}`}
                >
                  <div className="font-semibold text-slate-700 dark:text-slate-200">{m.month}</div>
                  <div className="text-[11px] mt-0.5">
                    {has
                      ? <span className="text-emerald-700 dark:text-emerald-400">{m.matchingAirline} flights · {Object.keys(m.byDay).length} days</span>
                      : <span className="text-slate-400">none cached ({m.totalCached} other airlines)</span>}
                  </div>
                  {has && days.length > 0 && (
                    <div className="text-[10px] text-slate-500 mt-1 truncate">
                      first: {days[0][0]}{days.length > 1 ? ` … last: ${days[days.length - 1][0]}` : ''}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          <p className="text-[10px] text-slate-500 mt-2">Click a green cell to auto-fill that month&apos;s first cached date as Depart (Return = +14 days).</p>
        </div>
      )}

      {/* Diagnostics panel — always shows last call's result + per-provider notes */}
      {(diagnostics.length > 0 || echo) && (
        <details className="mt-3 text-xs" open={offers.length === 0 && diagnostics.length > 0}>
          <summary className="cursor-pointer text-slate-600 hover:text-slate-900 font-semibold">
            Provider diagnostics ({diagnostics.length})
          </summary>
          <div className="mt-2 p-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 space-y-2">
            {echo && (
              <div className="text-slate-500">
                <span className="font-semibold text-slate-700 dark:text-slate-300">Bot received:</span>{' '}
                origin <code>{String(echo.origin)}</code>{' → '}<code>{String(echo.destination)}</code>{' · '}
                depart <code>{String(echo.departDate)}</code>{' / return '}<code>{String(echo.returnDate)}</code>{' · '}
                {String(echo.adults)} ad + {String(echo.infants)} inf · stops <code>{String(echo.stops)}</code>
              </div>
            )}
            <ul className="space-y-1">
              {diagnostics.map((d, i) => (
                <li key={i} className={`font-mono ${d.includes('ERROR') ? 'text-red-600' : 'text-slate-600 dark:text-slate-400'}`}>
                  {d}
                </li>
              ))}
            </ul>
          </div>
        </details>
      )}

      {shown.length > 0 && (
        <table className="fmt mt-4">
          <thead>
            <tr>
              <th>#</th>
              <th>Origin</th>
              <th>Stops</th>
              <th>Outbound</th>
              <th>Return</th>
              <th>Per adult</th>
              <th>Party total</th>
              <th>Provider</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {shown.map((o, idx) => {
              const out = fmtLeg(o.outbound_depart_iso);
              const ret = fmtLeg(o.return_depart_iso);
              const bookHref = bookingLink({
                origin: o.origin,
                destination,
                departDate: o.outbound_depart_iso?.slice(0, 10) || departDate,
                returnDate: o.return_depart_iso?.slice(0, 10) || returnDate,
                adults,
                infants,
                trackAs: { perAdult: o.per_adult_usd, provider: o.provider, surface: 'offers-results-table' },
              });
              return (
                <tr key={`${o.provider}-${idx}`}>
                  <td className="text-slate-500 text-xs">{idx + 1}</td>
                  <td className="font-semibold">{o.origin}</td>
                  <td className="text-slate-500 text-xs">{stopLabel(maxStops(o))}</td>
                  <td>
                    <div className="font-semibold">{out.date}{out.time && <span className="text-slate-400 font-normal"> · {out.time}</span>}</div>
                    <div className="text-xs text-slate-500">{o.outbound_flight_no || '—'}</div>
                  </td>
                  <td>
                    <div className="font-semibold">{ret.date}{ret.time && <span className="text-slate-400 font-normal"> · {ret.time}</span>}</div>
                    <div className="text-xs text-slate-500">{o.return_flight_no || '—'}</div>
                  </td>
                  <td className="font-semibold">{money(o.per_adult_usd)}</td>
                  <td>{money(o.total_party_usd)}</td>
                  <td>
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${PROVIDER_STYLE[o.provider] ?? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                      {PROVIDER_LABEL[o.provider] ?? o.provider}
                    </span>
                  </td>
                  <td>
                    <a
                      href={bookHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block px-3 py-1.5 rounded-lg text-xs font-bold bg-[#E8A33D] text-[#0B1220] hover:bg-[#F2B961] transition whitespace-nowrap"
                    >
                      Book →
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

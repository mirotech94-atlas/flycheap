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

  // Feature block: ranked bars. Bar length is the only measure the data
  // actually supports for a set of one-off search results — there is no
  // buy/wait verdict here (that needs tracked history, see the dashboard's
  // ed-ranked block), so each bar is per-adult price relative to the most
  // expensive offer shown, and the fill stays --accent (no amber modifier —
  // amber is reserved for fares/primary actions, and nothing here signals
  // "wait").
  const maxShownPrice = useMemo(
    () => shown.reduce((m, o) => Math.max(m, o.per_adult_usd), 0),
    [shown],
  );

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
    <div className="ed-panel">
      <div className="ed-panel-head">
        <div>
          <div className="ed-eyebrow">One-stop and nonstop</div>
          <h2 className="ed-panel-title">Search any route window</h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {enabledConfigured.length === 0
            ? <span className="ed-chip" style={{ color: 'var(--red)', borderColor: 'var(--red)' }}>No enabled providers configured</span>
            : <span className="ed-chip">{enabledConfigured.length} providers active</span>}
        </div>
      </div>

      {!hideForm && (
      <div className="ed-subpanel" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
        {/* Shared worldwide airport list for both origin + destination pickers */}
        <datalist id="offers-airports">
          {AIRPORTS.map(a => (
            <option key={a.iata} value={a.iata}>{`${a.city}, ${a.country} — ${a.name}`}</option>
          ))}
        </datalist>

        <label style={{ gridColumn: 'span 2' }}>
          <span className="ed-label">Origin(s) — any airport, comma-separate for multiple</span>
          <input
            value={originStr}
            onChange={e => setOriginStr(e.target.value.toUpperCase())}
            list="offers-airports"
            placeholder="JFK, EWR — or LHR, CDG, DXB…"
            className="ed-input"
          />
        </label>

        <label>
          <span className="ed-label">Destination</span>
          <input
            value={destination}
            onChange={e => setDestination(e.target.value.toUpperCase())}
            list="offers-airports"
            placeholder="CAI"
            className="ed-input"
          />
        </label>

        <label>
          <span className="ed-label">Depart</span>
          <input type="date" value={departDate} onChange={e => setDepartDate(e.target.value)} className="ed-input" />
        </label>

        <label>
          <span className="ed-label">Return</span>
          <input type="date" value={returnDate} onChange={e => setReturnDate(e.target.value)} className="ed-input" />
        </label>

        <label>
          <span className="ed-label">Stops</span>
          <select value={stops} onChange={e => setStops(e.target.value as StopsFilter)} className="ed-input">
            <option value="all">All</option>
            <option value="nonstop">Nonstop</option>
            <option value="one-stop">1 stop</option>
            <option value="two-plus">2+ stops</option>
          </select>
        </label>

        <label>
          <span className="ed-label">Adults</span>
          <input type="number" min={1} value={adults} onChange={e => setAdults(Number(e.target.value))} className="ed-input" />
        </label>
        <label>
          <span className="ed-label">Infants</span>
          <input type="number" min={0} value={infants} onChange={e => setInfants(Number(e.target.value))} className="ed-input" />
        </label>

        <label>
          <span className="ed-label">Show</span>
          <select value={limit} onChange={e => setLimit(e.target.value as ShowLimit)} className="ed-input">
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
            <option value="all">All</option>
          </select>
        </label>

        <label style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, fontSize: 12.5, color: 'var(--ink-soft)' }}>
          <input type="checkbox" checked={egyptairOnly} onChange={e => setEgyptairOnly(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
          <span>EgyptAir only (MS) — uncheck to also see other carriers</span>
        </label>

        <div style={{ gridColumn: 'span 2', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <button type="button" className="ed-btn ed-btn-primary" onClick={run} disabled={pending}>
            {pending ? 'Searching…' : 'Search'}
          </button>
          <button
            type="button"
            className="ed-btn ed-btn-secondary"
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
          {msg && <span style={{ fontSize: 12.5, color: 'var(--muted)' }}>{msg}</span>}
        </div>
      </div>
      )}

      {/* On-demand poll status — shown while the API has returned poll_id
          and we're awaiting the background provider call. */}
      {pollState && (
        <div className="ed-subpanel accent" style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="ed-dot" style={{ background: 'var(--accent)' }} aria-hidden />
          <div style={{ fontSize: 13, color: 'var(--ink)' }}>
            Pulling fresh prices from your providers — usually a few seconds…
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
              Checking every 2s · will give up after 60s and offer email-when-ready.
            </div>
          </div>
        </div>
      )}

      {/* Gave up waiting — surface the queue-alert button so the route lands
          in the background poller and the user gets notified when fares hit. */}
      {pollGaveUp && !pollState && offers.length === 0 && (
        <div className="ed-subpanel" style={{ marginTop: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>
            We&apos;ve queued this for the next polling cycle — we&apos;ll email you when it&apos;s ready.
          </div>
          {queuedSearchId ? (
            <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 4 }}>
              Queued as search #{queuedSearchId}. The background poller will email you when fares land.
            </div>
          ) : (
            <button
              type="button"
              className="ed-btn ed-btn-primary"
              style={{ marginTop: 10 }}
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
              Email me when it&apos;s ready
            </button>
          )}
        </div>
      )}

      {/* Nearest-cached-date fallback — when exact dates have 0 results,
          show the closest pairings so the user can apply them with one click. */}
      {offers.length === 0 && fallback && fallback.offers.length > 0 && (
        <div className="ed-subpanel green" style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink-soft)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 7 }}>
            <span className="ed-dot" style={{ background: 'var(--green)' }} aria-hidden />
            Closest available pairings ({fallback.window}) {egyptairOnly && fallback.offers.some(o => !((o.airline ?? '').startsWith('MS')))
              ? <span style={{ fontWeight: 400, color: 'var(--muted)' }}>— note: cache has no EgyptAir for those dates; showing other carriers too</span>
              : ''}:
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
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
                  className="ed-input"
                  style={{ textAlign: 'left', cursor: 'pointer', fontSize: 12 }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontFamily: 'var(--font-mono-ed)', fontWeight: 600, color: 'var(--ink)' }}>{money(o.per_adult_usd)}/adult</span>
                    <span className="ed-mono" style={{ color: isMS ? 'var(--green)' : 'var(--muted)', fontSize: 9.5 }}>{o.airline || '?'}</span>
                    <span style={{ fontSize: 10, color: 'var(--muted-2)', marginLeft: 'auto' }}>depart {dStr}, return {rStr}</span>
                  </div>
                  <div style={{ color: 'var(--ink-soft)', marginTop: 4 }}>
                    {o.outbound_flight_no} {newDepart} → {o.return_flight_no} {newReturn}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--muted-2)', marginTop: 2 }}>
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
        <div className="ed-subpanel" style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink)', marginBottom: 10 }}>
            Travelpayouts cache coverage · {originValue.split(',')[0]} → {destination} · {egyptairOnly ? 'EgyptAir (MS)' : 'any airline'}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
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
                  className="ed-input"
                  style={{ textAlign: 'left', fontSize: 12, cursor: has ? 'pointer' : 'not-allowed', opacity: has ? 1 : 0.6 }}
                >
                  <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{m.month}</div>
                  <div style={{ fontSize: 11, marginTop: 2 }}>
                    {has
                      ? <span style={{ color: 'var(--green)' }}>{m.matchingAirline} flights · {Object.keys(m.byDay).length} days</span>
                      : <span style={{ color: 'var(--muted-2)' }}>none cached ({m.totalCached} other airlines)</span>}
                  </div>
                  {has && days.length > 0 && (
                    <div style={{ fontSize: 10, color: 'var(--muted-2)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      first: {days[0][0]}{days.length > 1 ? ` … last: ${days[days.length - 1][0]}` : ''}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          <p style={{ fontSize: 10.5, color: 'var(--muted-2)', marginTop: 10 }}>Click a cell with data to auto-fill that month&apos;s first cached date as Depart (Return = +14 days).</p>
        </div>
      )}

      {/* Diagnostics panel — always shows last call's result + per-provider notes */}
      {(diagnostics.length > 0 || echo) && (
        <details style={{ marginTop: 14, fontSize: 12 }} open={offers.length === 0 && diagnostics.length > 0}>
          <summary className="ed-mono" style={{ cursor: 'pointer', color: 'var(--muted)' }}>
            Provider diagnostics ({diagnostics.length})
          </summary>
          <div className="ed-subpanel" style={{ marginTop: 8, display: 'grid', gap: 8 }}>
            {echo && (
              <div style={{ color: 'var(--muted)' }}>
                <span style={{ fontWeight: 600, color: 'var(--ink-soft)' }}>Bot received:</span>{' '}
                origin <code>{String(echo.origin)}</code>{' → '}<code>{String(echo.destination)}</code>{' · '}
                depart <code>{String(echo.departDate)}</code>{' / return '}<code>{String(echo.returnDate)}</code>{' · '}
                {String(echo.adults)} ad + {String(echo.infants)} inf · stops <code>{String(echo.stops)}</code>
              </div>
            )}
            <ul style={{ display: 'grid', gap: 4, listStyle: 'none', padding: 0, margin: 0 }}>
              {diagnostics.map((d, i) => (
                <li key={i} style={{ fontFamily: 'var(--font-mono-ed)', color: d.includes('ERROR') ? 'var(--red)' : 'var(--muted)' }}>
                  {d}
                </li>
              ))}
            </ul>
          </div>
        </details>
      )}

      {/* Feature block — ranked bars, cheapest first (shown is already sorted
          ascending by per_adult_usd). Bar length is price relative to the
          most expensive offer shown; fill stays --accent throughout (no
          amber — there is no buy/wait verdict for a one-off search result). */}
      {shown.length > 0 && (
        <div className="ed-ranked" style={{ marginTop: 20 }}>
          {shown.map((o, idx) => {
            const out = fmtLeg(o.outbound_depart_iso);
            const ret = fmtLeg(o.return_depart_iso);
            const pct = maxShownPrice > 0 ? (o.per_adult_usd / maxShownPrice) * 100 : 0;
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
              <div className="ed-ranked-row" key={`${o.provider}-${idx}`}>
                <div>
                  <div className="ed-ranked-name">{o.origin} → {destination}</div>
                  <div className="ed-ranked-meta">
                    {stopLabel(maxStops(o))} · {out.date}{out.time && ` ${out.time}`} → {ret.date}{ret.time && ` ${ret.time}`} · {PROVIDER_LABEL[o.provider] ?? o.provider} · party {money(o.total_party_usd)}
                  </div>
                </div>
                <div className="ed-bar"><div className="ed-bar-fill" style={{ width: `${pct}%` }} /></div>
                <div className="ed-ranked-value">{money(o.per_adult_usd)}</div>
                <a className="ed-btn ed-btn-row" href={bookHref} target="_blank" rel="noopener noreferrer">
                  Book →
                </a>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

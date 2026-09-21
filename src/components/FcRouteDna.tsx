'use client';
import { useEffect, useState } from 'react';
import { MIN_VERDICT_SAMPLES, routeKey, type Verdict } from '@/lib/verdict';
import { FcVerdictCard, FcVerdictPending } from './FcVerdictCard';
import { FcRouteSparkline, type SparkPoint } from './FcRouteSparkline';

export type RouteDnaStats = {
  cheapDay: string;
  cheapHour: string;
  bestTrip: string;
  median: number;
  floor: number;
  bookByDays: number;
  observedPolls: number;
  deltaVsMedian: number;
};

function bar(p: number): string { return Math.max(8, Math.min(100, Math.round(p))) + '%'; }

const CITY_NAME: Record<string, string> = {
  JFK: 'New York', EWR: 'Newark', LAX: 'Los Angeles', BOS: 'Boston', LHR: 'London',
  CDG: 'Paris', CAI: 'Cairo', DXB: 'Dubai', FRA: 'Frankfurt', IST: 'Istanbul',
  BCN: 'Barcelona', FCO: 'Rome', AMS: 'Amsterdam', NRT: 'Tokyo', BKK: 'Bangkok',
  GRU: 'São Paulo', MEX: 'Mexico City', LIS: 'Lisbon', SYD: 'Sydney', ATH: 'Athens',
  BWI: 'Baltimore', BOM: 'Mumbai', DEL: 'Delhi',
};

export function FcRouteDna({
  stats,
  origin: initialOrigin = 'JFK',
  dest: initialDest = 'CAI',
  routes = [],
  histories = {},
  verdicts = {},
}: {
  stats?: RouteDnaStats;
  origin?: string;
  dest?: string;
  routes?: Array<{ origin: string; destination: string }>;
  /** 30-day daily-min fare history per tracked route, keyed by routeKey(). */
  histories?: Record<string, SparkPoint[]>;
  /** Buy / Wait / Hold verdict per tracked route, keyed by routeKey(). */
  verdicts?: Record<string, Verdict>;
}) {
  const [origin, setOrigin] = useState(initialOrigin);
  const [dest, setDest] = useState(initialDest);
  const [open, setOpen] = useState(false);
  const [liveStats, setLiveStats] = useState<RouteDnaStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // When origin/dest changes from a Switch click, fetch fresh stats.
  useEffect(() => {
    if (origin === initialOrigin && dest === initialDest) {
      setLiveStats(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setErr(null);
    fetch(`/api/route-dna?origin=${origin}&dest=${dest}`)
      .then(r => r.json())
      .then(j => {
        if (cancelled) return;
        if (!j.ok) { setErr(j.error || 'fetch failed'); setLiveStats(null); return; }
        setLiveStats(j.stats);
      })
      .catch(e => { if (!cancelled) setErr(String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [origin, dest, initialOrigin, initialDest]);

  const effective: RouteDnaStats = liveStats ?? stats ?? {
    cheapDay: 'Tue', cheapHour: '03:00', bestTrip: '14d',
    median: 734, floor: 589, bookByDays: 47, observedPolls: 0, deltaVsMedian: -145,
  };

  const history = histories[routeKey(origin, dest)] ?? [];
  const verdict = verdicts[routeKey(origin, dest)];
  const tracked = routes.some(r => r.origin === origin && r.destination === dest);

  const medianW = bar((effective.median / 1500) * 100);
  const floorW = bar((effective.floor / 1500) * 100);
  const tripW = bar(Math.min(100, parseInt(effective.bestTrip) * 5));
  const bookW = bar(Math.min(100, effective.bookByDays * 1.5));

  return (
    <div className="fc-card">
      <div className="fc-card-head">
        <div>
          <div className="fc-smallcaps">Pattern intelligence</div>
          <h2 className="fc-card-title">Route <em>DNA</em></h2>
          <div className="fc-card-meta">
            {origin} ↔ {dest} · {effective.observedPolls > 0 ? `${effective.observedPolls} polls observed` : '90 days observed'}
            {loading && <span style={{ marginLeft: 8, opacity: .6 }}>· loading…</span>}
            {err && <span style={{ marginLeft: 8, color: 'var(--red)' }}>· {err}</span>}
          </div>
        </div>
        <div style={{ position: 'relative' }}>
          <button
            className="fc-btn fc-btn-light fc-btn-sm"
            onClick={() => setOpen(o => !o)}
            disabled={routes.length === 0}
            title={routes.length === 0 ? 'Track a route to enable Switch' : 'Switch route'}
          >
            Switch {routes.length > 0 ? '▾' : ''}
          </button>
          {open && routes.length > 0 && (
            <div
              style={{
                position: 'absolute', top: '110%', right: 0, zIndex: 30,
                background: 'var(--surface)',
                color: 'var(--ink)',
                border: '1px solid var(--rule-strong)',
                borderRadius: 0,
                minWidth: 180, padding: 4, maxHeight: 280, overflowY: 'auto',
              }}
              onMouseLeave={() => setOpen(false)}
            >
              {routes.map(r => {
                const active = r.origin === origin && r.destination === dest;
                return (
                  <div
                    key={`${r.origin}-${r.destination}`}
                    style={{
                      padding: '6px 10px', cursor: 'pointer',
                      fontSize: 13, borderRadius: 0,
                      background: active ? 'color-mix(in srgb, var(--amber) 18%, transparent)' : 'transparent',
                      fontFamily: 'var(--font-mono)',
                    }}
                    onClick={() => { setOrigin(r.origin); setDest(r.destination); setOpen(false); }}
                  >
                    {r.origin} → {r.destination}
                    <span style={{ marginLeft: 6, opacity: .55, fontFamily: 'inherit' }}>
                      {CITY_NAME[r.destination] || ''}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="fc-dna-flightcard">
        <div className="fc-dna-route">
          <div className="fc-dna-iata">
            {origin}
            <span className="label">{CITY_NAME[origin] || origin}</span>
          </div>
          <div className="fc-dna-plane">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M22 12L12 17V14L4 12L12 10V7L22 12Z" fill="currentColor" />
            </svg>
          </div>
          <div className="fc-dna-iata right">
            {dest}
            <span className="label">{CITY_NAME[dest] || dest}</span>
          </div>
        </div>
        {/* 30-day sparkline from fare_snapshots (daily minimums) with low/high labels. */}
        {(history.length > 0 || tracked) && (
          <FcRouteSparkline data={history} threshold={verdict?.threshold} caption={history.length > 1 ? `${history.length} polled days · daily minimum per adult` : undefined} />
        )}
      </div>

      <div className="fc-dna-vis">
        {[
          { label: 'Cheap day', w: '88%', v: effective.cheapDay },
          { label: 'Cheap hour', w: '72%', v: effective.cheapHour },
          { label: 'Best trip', w: tripW, v: effective.bestTrip },
          { label: 'Median', w: medianW, v: '$' + Math.round(effective.median) },
          { label: 'Floor', w: floorW, v: '$' + Math.round(effective.floor) },
          { label: 'Book by', w: bookW, v: '−' + effective.bookByDays + 'd' },
        ].map((r, i) => (
          <div className="fc-dna-row" key={i}>
            <div className="fc-dna-label">{r.label}</div>
            <div className="fc-dna-bar"><div className="fc-dna-fill" style={{ width: r.w }} /></div>
            <div className="fc-dna-val">{r.v}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: '4px 24px 22px' }}>
        {/* Buy / Wait / Hold verdict — Kayak/Hopper pattern, math in lib/verdict.ts */}
        {verdict
          ? <FcVerdictCard verdict={verdict} compact />
          : tracked && <FcVerdictPending samples={history.length} needed={MIN_VERDICT_SAMPLES} />}
        <div className="fc-dna-reco" style={{ marginTop: verdict || tracked ? 12 : 0 }}>
          <strong className="fc-dna-reco-strong">Recommendation:</strong> Book a {effective.cheapDay} {effective.cheapHour} departure for a {effective.bestTrip} trip
          departing within the next {effective.bookByDays} days. {effective.deltaVsMedian < 0 ? (
            <>You&apos;re <strong className="fc-dna-reco-strong">${Math.abs(Math.round(effective.deltaVsMedian))} below median</strong> on the current best deal.</>
          ) : (
            <>Currently <strong>${Math.round(effective.deltaVsMedian)} above median</strong> — consider waiting.</>
          )}
        </div>
        <button
          className="fc-btn fc-btn-gold"
          style={{ marginTop: 12 }}
          onClick={() => {
            // Turn the pattern into concrete dates: next occurrence of the
            // cheap weekday (within the book-by window), trip length from bestTrip.
            const dowNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
            const targetDow = Math.max(0, dowNames.indexOf(effective.cheapDay.slice(0, 3)));
            const tripDays = Math.max(3, parseInt(effective.bestTrip) || 14);
            const depart = new Date();
            depart.setDate(depart.getDate() + 7); // at least a week out
            while (depart.getDay() !== targetDow) depart.setDate(depart.getDate() + 1);
            const ret = new Date(depart);
            ret.setDate(ret.getDate() + tripDays);
            const params = new URLSearchParams({
              origin, destination: dest,
              departDate: depart.toISOString().slice(0, 10),
              returnDate: ret.toISOString().slice(0, 10),
            });
            window.location.href = `/offers?${params.toString()}`;
          }}
        >
          Book this pattern →
        </button>
      </div>
    </div>
  );
}

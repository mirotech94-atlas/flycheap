'use client';
import { useEffect, useRef, useState } from 'react';

export type LiveFeedItem = {
  id: string;
  route: string;       // "EWR → CAI · Aug 12-30"
  price: number;       // per-adult USD
  delta: number;       // negative = drop
  who: string;         // "Threshold cross" / "Lufthansa · travelpayouts"
  tag: 'DROP' | 'NEW LOW' | 'ALERT' | 'LOW';
  ts: number;          // epoch ms
};

type PoolItem = { route: string; price: number; delta: number; airline: string; provider: string; out: string; ret: string; trip: number };

const ROTATE_MS = 4000;      // a new real fare slides in every 4 s
const POOL_REFRESH_MS = 90_000;
const ALERTS_REFRESH_MS = 30_000;
const MAX_ROWS = 8;

function timeAgo(ts: number): string {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return s + 's';
  const m = Math.round(s / 60);
  if (m < 60) return m + 'm';
  const h = Math.round(m / 60);
  if (h < 24) return h + 'h';
  return Math.round(h / 24) + 'd';
}
const fmtD = (d: string) => { const dt = new Date(d + 'T12:00:00Z'); return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }); };

/**
 * Live fare feed: real alert events (from /api/live-feed) merged with a
 * rotating stream of real best fares across every tracked route + airline
 * (from /api/early-access/feed). A new fare slides in every few seconds.
 */
export function FcLiveFeed({ initialItems, providersLabel }: { initialItems?: LiveFeedItem[]; providersLabel?: string }) {
  const [items, setItems] = useState<LiveFeedItem[]>(initialItems ?? []);
  const [tick, setTick] = useState(0);
  const pool = useRef<PoolItem[]>([]);
  const cursor = useRef(0);

  // 1-second re-tick so "time ago" stays fresh.
  useEffect(() => {
    const c = setInterval(() => setTick(x => x + 1), 1000);
    return () => clearInterval(c);
  }, []);

  // Rotating pool of real best fares.
  useEffect(() => {
    let cancelled = false;
    async function loadPool() {
      try {
        const r = await fetch('/api/early-access/feed', { cache: 'no-store' });
        const j = await r.json();
        if (!cancelled && j.ok && Array.isArray(j.items) && j.items.length) { pool.current = j.items; cursor.current = 0; }
      } catch { /* keep current pool */ }
    }
    function rotate() {
      const p = pool.current;
      if (p.length === 0) return;
      const f = p[cursor.current % p.length]; cursor.current++;
      const item: LiveFeedItem = {
        id: `pool-${Date.now()}-${cursor.current}`,
        route: `${f.route} · ${fmtD(f.out)}–${fmtD(f.ret)}`,
        price: f.price, delta: f.delta,
        who: `${f.airline} · ${f.provider}`,
        tag: f.delta < 0 ? 'DROP' : 'LOW',
        ts: Date.now(),
      };
      setItems(prev => [item, ...prev].slice(0, MAX_ROWS));
    }
    loadPool().then(rotate);
    const r = setInterval(rotate, ROTATE_MS);
    const p = setInterval(loadPool, POOL_REFRESH_MS);
    return () => { cancelled = true; clearInterval(r); clearInterval(p); };
  }, []);

  // Real alert events: merge any new ones by id.
  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const r = await fetch('/api/live-feed', { cache: 'no-store' });
        if (!r.ok) return;
        const data = (await r.json()) as { items: LiveFeedItem[] };
        if (cancelled) return;
        setItems(prev => {
          const seen = new Set(prev.map(i => i.id));
          const fresh = data.items.filter(i => !seen.has(i.id)).map(i => ({ ...i, ts: Math.max(i.ts, Date.now()) }));
          return [...fresh, ...prev].slice(0, MAX_ROWS);
        });
      } catch { /* ignore network blips */ }
    }
    const i = setInterval(poll, ALERTS_REFRESH_MS);
    return () => { cancelled = true; clearInterval(i); };
  }, []);

  return (
    <div className="fc-card fc-feed">
      <div className="fc-feed-head">
        <div>
          <div className="fc-smallcaps">{providersLabel ?? 'Live provider polling'}</div>
          <h3 className="fc-feed-title">Live fare feed</h3>
        </div>
        <div className="fc-feed-pulse"><span className="dot" /> Live</div>
      </div>
      <div className="fc-feed-list">
        {items.map((it, idx) => (
          <div className={`fc-feed-item${idx === 0 ? ' fresh' : ''}`} key={it.id}>
            <div className="fc-feed-time">
              <strong>{idx === 0 ? 'NOW' : timeAgo(it.ts)}</strong>
              <span style={{ fontSize: 9, opacity: 0.6 }}>{it.tag}</span>
            </div>
            <div>
              <div className="fc-feed-route">
                {it.route}
                <span className="small">{it.who}</span>
              </div>
            </div>
            <div className="fc-feed-price">
              ${Math.round(it.price)}
              <span className={it.delta < 0 ? 'delta-down' : 'delta-up'}>
                {it.delta < 0 ? '▼' : '▲'} ${Math.abs(Math.round(it.delta))}
              </span>
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <div className="fc-feed-item">
            <div className="fc-feed-route">Scanning routes…</div>
          </div>
        )}
      </div>
      <span style={{ display: 'none' }}>{tick}</span>
    </div>
  );
}

'use client';
import { useEffect, useState } from 'react';

export type LiveFeedItem = {
  id: string;
  route: string;       // "EWR → CAI · Aug 12-30"
  price: number;       // per-adult USD
  delta: number;       // negative = drop
  who: string;         // "EgyptAir · alerts" or kind label
  tag: 'DROP' | 'NEW LOW' | 'ALERT';
  ts: number;          // epoch ms
};

const FALLBACK_SEED: LiveFeedItem[] = [
  { id: 'fb-1', route: 'EWR → CAI · Aug 12-30', price: 589, delta: -112, who: 'EgyptAir alerts', tag: 'NEW LOW', ts: Date.now() - 60_000 },
  { id: 'fb-2', route: 'JFK → CAI · Jul 8-22',  price: 612, delta: -84,  who: 'EgyptAir alerts', tag: 'DROP',    ts: Date.now() - 240_000 },
];

function timeAgo(ts: number): string {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return s + 's';
  const m = Math.round(s / 60);
  if (m < 60) return m + 'm';
  const h = Math.round(m / 60);
  if (h < 24) return h + 'h';
  return Math.round(h / 24) + 'd';
}

export function FcLiveFeed({ initialItems, providersLabel }: { initialItems?: LiveFeedItem[]; providersLabel?: string }) {
  const seed = (initialItems && initialItems.length > 0) ? initialItems : FALLBACK_SEED;
  const [items, setItems] = useState<LiveFeedItem[]>(seed);
  const [tick, setTick] = useState(0);

  // 1-second re-tick so "time ago" stays fresh.
  useEffect(() => {
    const c = setInterval(() => setTick(x => x + 1), 1000);
    return () => clearInterval(c);
  }, []);

  // Poll /api/live-feed every 30s; merge any new items by id.
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
          const merged = [...data.items.filter(i => !seen.has(i.id)), ...prev];
          merged.sort((a, b) => b.ts - a.ts);
          return merged.slice(0, 8);
        });
      } catch { /* ignore network blips */ }
    }
    const i = setInterval(poll, 30_000);
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
          <div className="fc-feed-item" key={it.id}>
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
            <div className="fc-feed-route">No recent activity yet. Polling…</div>
          </div>
        )}
      </div>
      {/* Keep the live tick variable referenced so React re-renders for timeAgo. */}
      <span style={{ display: 'none' }}>{tick}</span>
    </div>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import type { FeedItem } from '@/lib/early-access';
import { pollWithBackoff } from '@/lib/useLivePoll';

export type FeedLabels = { title: string; typical: string; at: string; foot: string; lastPoll: string; tagLow: string; tagDrop: string; empty: string };

const fmtD = (d: string) => { const dt = new Date(d + 'T12:00:00Z'); return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }); };

const ROTATE_MS = 4200;      // a new real fare slides in every ~4s
const POOL_REFRESH_MS = 4000; // and the pool behind it is refreshed at (about) the same cadence

/** Rotating live feed: shows 5 rows, slides a new real fare in every few seconds, refreshes the pool every ~4 s. */
export function LiveFeed({ initial, labels: t, lastPollText, footRight, visible = 5 }: { initial: FeedItem[]; labels: FeedLabels; lastPollText: string; footRight: string; visible?: number }) {
  const [pool, setPool] = useState<FeedItem[]>(initial);
  const [idx, setIdx] = useState(0);
  const [tick, setTick] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timer.current = setInterval(() => { setIdx(i => i + 1); setTick(k => k + 1); }, ROTATE_MS);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, []);

  // Pool refresh: chained setTimeout (never overlapping), paused while the tab
  // is hidden, aborted on unmount, backed off on failure. `initial` already
  // seeds the pool from SSR, so this waits one interval before its first fetch.
  useEffect(() => {
    const stop = pollWithBackoff(async signal => {
      const r = await fetch('/api/early-access/feed', { cache: 'no-store', signal });
      const j = await r.json();
      if (j.ok && Array.isArray(j.items) && j.items.length) { setPool(j.items); return true; }
      return false;
    }, { baseDelayMs: POOL_REFRESH_MS, immediate: false });
    return stop;
  }, []);

  if (pool.length === 0) return <div className="mk-feed"><div className="mk-feed-empty">{t.empty}</div></div>;
  const rows = Array.from({ length: Math.min(visible, pool.length) }, (_, k) => pool[(idx + k) % pool.length]);

  return (
    <div className="mk-feed" aria-live="polite">
      <div className="mk-feed-head">
        <span><span className="ed-dot" /> {t.title}</span>
        <span className="mk-feed-time">{lastPollText}</span>
      </div>
      {rows.map((f, i) => (
        <div className={`mk-feed-row${i === 0 ? ' fresh' : ''}`} key={`${f.route}-${f.code}-${tick}-${i}`}>
          <div className="mk-feed-route-wrap">
            <div className="mk-feed-route">{f.route} <span className="mk-feed-al">· {f.airline}</span></div>
            <div className="mk-feed-meta">{f.provider} · {fmtD(f.out)} → {fmtD(f.ret)} · {f.trip}d</div>
          </div>
          <div className={`mk-feed-delta ${f.delta < 0 ? 'down' : ''}`}>{f.delta < 0 ? `▼ $${Math.abs(f.delta)} ${t.typical}` : t.at}</div>
          <div className="mk-feed-price">${f.price}</div>
          <span className={`mk-tag ${f.delta < 0 ? 'drop' : 'low'}`}>{f.delta < 0 ? t.tagDrop : t.tagLow}</span>
        </div>
      ))}
      <div className="mk-feed-foot"><span>{t.foot}</span><span className="mk-feed-time">{footRight}</span></div>
    </div>
  );
}

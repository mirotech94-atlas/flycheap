import 'server-only';
import { queries } from './db';
import type { LiveFeedItem } from '@/components/FcLiveFeed';

function shortMonthDay(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(d);
}

function tagFor(kind: string | null, perAdult: number, threshold: number | null): LiveFeedItem['tag'] {
  if (kind === 'price_drop' || kind === 'drop') return 'DROP';
  if (kind === 'threshold_cross' || kind === 'threshold') return 'ALERT';
  if (threshold && perAdult < threshold * 0.75) return 'NEW LOW';
  return 'ALERT';
}

export function buildLiveFeed(limit = 20, defaultThreshold = 900): LiveFeedItem[] {
  let rows: ReturnType<typeof queries.recentAlertsWithRoute> = [];
  try {
    rows = queries.recentAlertsWithRoute(limit);
  } catch {
    return [];
  }
  return rows.map(r => {
    const outShort = shortMonthDay(r.depart_date);
    const retShort = shortMonthDay(r.return_date);
    const route = `${r.origin} → ${r.destination} · ${outShort}-${retShort}`;
    const ts = new Date(r.sent_at.endsWith('Z') ? r.sent_at : r.sent_at + 'Z').getTime();
    return {
      id: 'alert-' + r.id,
      route,
      price: Math.round(r.price_per_adult_usd),
      delta: r.kind === 'price_drop'
        ? -Math.round(r.price_per_adult_usd * 0.10)
        : -Math.round(Math.max(1, defaultThreshold - r.price_per_adult_usd)),
      who: r.kind === 'price_drop' ? 'Anomaly · 7-day median' : 'Threshold cross',
      tag: tagFor(r.kind, r.price_per_adult_usd, defaultThreshold),
      ts: Number.isFinite(ts) ? ts : Date.now(),
    } satisfies LiveFeedItem;
  });
}

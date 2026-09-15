import { fmtUSD } from '@/lib/utils';

type FeedItem = {
  origin: string;
  destination: string;
  outbound_date: string;
  return_date: string;
  per_adult_usd: number;
  delta?: number;
  who?: string;
  outbound_flight_no?: string;
  polled_at?: string;
};

function formatRelativeAge(iso?: string): string {
  if (!iso) return 'NOW';
  const t = new Date(iso + (iso.endsWith('Z') ? '' : 'Z')).getTime();
  if (isNaN(t)) return 'NOW';
  const dt = Date.now() - t;
  const m = Math.round(dt / 60000);
  if (m <= 1) return 'NOW';
  if (m < 60) return m + 'm';
  const h = Math.round(m / 60);
  if (h < 24) return h + 'h';
  return Math.round(h / 24) + 'd';
}

function formatHHMMSS(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso + (iso.endsWith('Z') ? '' : 'Z'));
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

export function LiveFeedCard({ items }: { items: FeedItem[] }) {
  return (
    <div className="fc-fcard fc-feed">
      <div className="fc-feed-head">
        <div>
          <div className="fc-smallcaps">Polling {Math.max(1, items.length)} providers</div>
          <h3 className="fc-feed-title">Live fare feed</h3>
        </div>
        <div className="fc-feed-pulse"><span className="dot" /> Live</div>
      </div>
      <div className="fc-feed-list">
        {items.length === 0 && (
          <div style={{ padding: '24px 22px', fontSize: 13, color: 'var(--fc-muted)' }}>
            No recent polls yet — the next refresh cycle will populate this feed.
          </div>
        )}
        {items.slice(0, 8).map((it, idx) => {
          const dest = it.destination;
          const out = it.outbound_date.slice(5).replace('-', '/');
          const ret = it.return_date.slice(5).replace('-', '/');
          const monthOut = new Date(it.outbound_date + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
          const monthRet = new Date(it.return_date + 'T00:00:00Z').toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
          return (
            <div className="fc-feed-item" key={idx}>
              <div className="fc-feed-time">
                <strong>{formatRelativeAge(it.polled_at)}</strong>
                {formatHHMMSS(it.polled_at)}
              </div>
              <div>
                <div className="fc-feed-route">
                  {it.origin} → {dest} · {monthOut}–{monthRet}
                  <span className="small">
                    {it.who ?? (it.outbound_flight_no ? `flight ${it.outbound_flight_no}` : 'cached fare')}
                  </span>
                </div>
              </div>
              <div className="fc-feed-price">
                {fmtUSD(it.per_adult_usd)}
                {typeof it.delta === 'number' && it.delta !== 0 && (
                  <span className={it.delta < 0 ? 'fc-delta-down' : 'fc-delta-up'}>
                    {it.delta < 0 ? '▼' : '▲'} {fmtUSD(Math.abs(Math.round(it.delta)))}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

import 'server-only';
import { queries, type SearchRow, type FareRow } from './db';
import { sendFareAlert } from './email';
import { getCachedBestDeals } from './bestDeals';
import { Resend } from 'resend';
import { fmtUSD, fmtDate, fmtDateTime, fmtRelative, bookingLink } from './utils';
import { effectiveTarget } from './targets';
import { APP_URL } from './hosts';

const QUOTA_PER_MONTH = 9999; // Travelpayouts is essentially unmetered for affiliates

function quickChart(config: object, width = 480, height = 280): string {
  const json = JSON.stringify(config);
  return `https://quickchart.io/chart?bkg=white&w=${width}&h=${height}&c=${encodeURIComponent(json)}`;
}

type DigestRow = {
  search: SearchRow;
  fare: FareRow | null;
  recentLow: number | null; // 7-day low for that search
};

function buildRows(): DigestRow[] {
  return queries.listSearches()
    .filter(s => s.active === 1)
    .map(s => {
      const fare = queries.latestFare(s.id) ?? null;
      const hist = queries.fareHistory(s.id, 7);
      const recentLow = hist.length
        ? Math.min(...hist.map(h => h.price_per_adult_usd))
        : null;
      return { search: s, fare, recentLow };
    });
}

export function buildDigestHtml(opts?: { headline?: string }): { html: string; subject: string; summary: string } {
  const rows = buildRows();
  const threshold = parseFloat(queries.getSetting('alert_threshold_per_adult_usd') ?? '900');
  const apiCallsThisMonth = queries.apiCallsThisMonth().count;
  const recentAlerts = queries.recentAlerts(5);
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  // Pie chart 1: total party cost by origin (current cheapest)
  const byOrigin: Record<string, number> = {};
  for (const r of rows) {
    if (r.fare) byOrigin[r.search.origin] = (byOrigin[r.search.origin] ?? 0) + r.fare.total_price_usd;
  }
  const originLabels = Object.keys(byOrigin);
  const originPie = quickChart({
    type: 'doughnut',
    data: {
      labels: originLabels,
      datasets: [{
        data: originLabels.map(o => Math.round(byOrigin[o])),
        backgroundColor: ['#0a2e57', '#b8912f', '#0f766e', '#9333ea'],
      }],
    },
    options: { plugins: { title: { display: true, text: 'Party total by origin (USD)' } } },
  });

  // Pie chart 2: under vs over target by search (per-route target honored — matches the dashboard)
  const under = rows.filter(r => r.fare && r.fare.price_per_adult_usd < effectiveTarget(r.search, threshold)).length;
  const over = rows.filter(r => r.fare && r.fare.price_per_adult_usd >= effectiveTarget(r.search, threshold)).length;
  const noData = rows.filter(r => !r.fare).length;
  const thresholdPie = quickChart({
    type: 'pie',
    data: {
      labels: [`Below threshold (${under})`, `Above (${over})`, `No data (${noData})`],
      datasets: [{
        data: [under, over, noData],
        backgroundColor: ['#16a34a', '#dc2626', '#94a3b8'],
      }],
    },
    options: { plugins: { title: { display: true, text: `Searches vs $${threshold}/adult threshold` } } },
  });

  // Best deals across the year (from the 12-month scan cache), filtered to <= maxDisplay.
  const maxDisplay = parseFloat(queries.getSetting('max_display_per_adult_usd') ?? '1200');
  const bestDealsCache = getCachedBestDeals(30);
  bestDealsCache.deals = bestDealsCache.deals.filter(d => d.per_adult_usd <= maxDisplay).slice(0, 5);
  const bestDeal = bestDealsCache.deals[0];

  const cheapestNow = rows
    .filter((r): r is DigestRow & { fare: FareRow } => !!r.fare)
    .sort((a, b) => a.fare.price_per_adult_usd - b.fare.price_per_adult_usd)[0];

  // Headline: prefer best-deal-across-year if it's below threshold, else current cheapest.
  const headline = opts?.headline ?? (() => {
    if (bestDeal && bestDeal.per_adult_usd < threshold) {
      return `Deal alert: ${fmtUSD(bestDeal.per_adult_usd)}/adult ${bestDeal.origin} → CAI ${fmtDate(bestDeal.outbound_date)} → ${fmtDate(bestDeal.return_date)}`;
    }
    if (bestDeal) {
      return `Cheapest in next 12 months: ${fmtUSD(bestDeal.per_adult_usd)}/adult (${bestDeal.origin}, ${fmtDate(bestDeal.outbound_date)})`;
    }
    if (cheapestNow) {
      return `Tracked searches: cheapest ${fmtUSD(cheapestNow.fare.price_per_adult_usd)}/adult ${cheapestNow.search.origin} ${fmtDate(cheapestNow.search.depart_date)}`;
    }
    return 'No fare data yet';
  })();

  const summary = `${rows.length} active search${rows.length === 1 ? '' : 'es'}. ${headline}. Threshold: ${fmtUSD(threshold)}/adult.`;

  const subject = `✈️  EgyptAir digest — ${headline}`;

  // Filter tracked-search rows to <= maxDisplay (or rows with no fare yet).
  const visibleRows = rows.filter(r => !r.fare || r.fare.price_per_adult_usd <= maxDisplay);
  const fareTableRows = visibleRows.map(r => {
    if (!r.fare) {
      return `<tr>
        <td><b>${r.search.origin}</b> → ${r.search.destination}</td>
        <td>${fmtDate(r.search.depart_date)}</td>
        <td>${fmtDate(r.search.return_date)}</td>
        <td colspan="3" style="color:#94a3b8">no data yet</td>
      </tr>`;
    }
    const delta = r.fare.price_per_adult_usd - effectiveTarget(r.search, threshold);
    const badge = delta < 0
      ? `<span style="background:#dcfce7;color:#15803d;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:600">below ✓</span>`
      : `<span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:600">+${fmtUSD(delta)}</span>`;
    return `<tr>
      <td><b>${r.search.origin}</b> → ${r.search.destination}<br><span style="color:#94a3b8;font-size:11px">${r.fare.outbound_flight_no ?? ''} / ${r.fare.return_flight_no ?? ''}</span></td>
      <td>${fmtDate(r.search.depart_date)}</td>
      <td>${fmtDate(r.search.return_date)}</td>
      <td><b>${fmtUSD(r.fare.price_per_adult_usd)}</b></td>
      <td>${fmtUSD(r.fare.total_price_usd)}</td>
      <td>${badge}</td>
    </tr>`;
  }).join('');

  const alertRows = recentAlerts.length
    ? recentAlerts.map(a => `<tr>
        <td style="color:#64748b;font-size:12px">${fmtDateTime(a.sent_at)}</td>
        <td><b>${a.origin}</b> → ${a.destination}</td>
        <td>${a.depart_date}</td>
        <td><b>${fmtUSD(a.price_per_adult_usd)}</b></td>
      </tr>`).join('')
    : `<tr><td colspan="4" style="color:#94a3b8;text-align:center;padding:16px">No alerts sent yet.</td></tr>`;

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;max-width:680px;margin:auto;padding:24px;color:#0f172a;background:#f8fafc">
      <div style="background:#0a2e57;color:#fff;padding:20px 24px;border-radius:12px 12px 0 0">
        <div style="font-size:13px;opacity:0.8">${today}</div>
        <h1 style="margin:6px 0 0;font-size:22px">EgyptAir Cheap Flights — Daily Digest</h1>
        <div style="margin-top:8px;opacity:0.95;font-size:14px">${headline}</div>
      </div>

      <div style="background:#fff;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none">

        ${bestDealsCache.deals.length > 0 ? `
        <h2 style="font-size:15px;color:#15803d;margin:0 0 12px;text-transform:uppercase;letter-spacing:0.5px">🎯 Best deals across next 12 months</h2>
        <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:24px">
          <thead>
            <tr style="background:#f0fdf4">
              <th style="text-align:left;padding:8px;border-bottom:1px solid #bbf7d0">Origin</th>
              <th style="text-align:left;padding:8px;border-bottom:1px solid #bbf7d0">Outbound</th>
              <th style="text-align:left;padding:8px;border-bottom:1px solid #bbf7d0">Return</th>
              <th style="text-align:left;padding:8px;border-bottom:1px solid #bbf7d0">Trip</th>
              <th style="text-align:left;padding:8px;border-bottom:1px solid #bbf7d0">Per adult</th>
              <th style="text-align:left;padding:8px;border-bottom:1px solid #bbf7d0">Party</th>
              <th style="text-align:left;padding:8px;border-bottom:1px solid #bbf7d0">vs $${threshold}</th>
            </tr>
          </thead>
          <tbody>
            ${bestDealsCache.deals.map(d => {
              const under = d.per_adult_usd < threshold;
              const badge = under
                ? `<span style="background:#dcfce7;color:#15803d;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:600">below ✓</span>`
                : `<span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:600">+${fmtUSD(d.per_adult_usd - threshold)}</span>`;
              const bookUrl = bookingLink({ origin: d.origin, destination: 'CAI', departDate: d.outbound_date, returnDate: d.return_date, adults: 4, infants: 1 });
              return `<tr${under ? ' style="background:#f0fdf4"' : ''}>
                <td style="padding:8px;border-bottom:1px solid #f1f5f9"><b>${d.origin}</b> → CAI</td>
                <td style="padding:8px;border-bottom:1px solid #f1f5f9">${fmtDate(d.outbound_date)}</td>
                <td style="padding:8px;border-bottom:1px solid #f1f5f9">${fmtDate(d.return_date)}</td>
                <td style="padding:8px;border-bottom:1px solid #f1f5f9;color:#64748b">${d.trip_length_days}d</td>
                <td style="padding:8px;border-bottom:1px solid #f1f5f9"><b>${fmtUSD(d.per_adult_usd)}</b></td>
                <td style="padding:8px;border-bottom:1px solid #f1f5f9">${fmtUSD(d.party_total_usd)}</td>
                <td style="padding:8px;border-bottom:1px solid #f1f5f9">${badge}</td>
                <td style="padding:8px;border-bottom:1px solid #f1f5f9"><a href="${bookUrl}" style="background:#0a2e57;color:#fff;padding:4px 10px;border-radius:6px;text-decoration:none;font-size:11px;font-weight:600">Book →</a></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
        ` : ''}

        <h2 style="font-size:15px;color:#475569;margin:0 0 12px;text-transform:uppercase;letter-spacing:0.5px">Tracked searches — current cheapest</h2>
        <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:24px">
          <thead>
            <tr style="background:#f1f5f9">
              <th style="text-align:left;padding:8px;border-bottom:1px solid #e2e8f0">Route</th>
              <th style="text-align:left;padding:8px;border-bottom:1px solid #e2e8f0">Depart</th>
              <th style="text-align:left;padding:8px;border-bottom:1px solid #e2e8f0">Return</th>
              <th style="text-align:left;padding:8px;border-bottom:1px solid #e2e8f0">Per adult</th>
              <th style="text-align:left;padding:8px;border-bottom:1px solid #e2e8f0">Party total</th>
              <th style="text-align:left;padding:8px;border-bottom:1px solid #e2e8f0">Threshold</th>
            </tr>
          </thead>
          <tbody>
            ${fareTableRows || `<tr><td colspan="6" style="text-align:center;padding:16px;color:#94a3b8">No active searches.</td></tr>`}
          </tbody>
        </table>

        <div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:24px">
          <div style="flex:1;min-width:280px;text-align:center">
            <img src="${originPie}" alt="Party total by origin" style="max-width:100%;border:1px solid #e2e8f0;border-radius:8px"/>
          </div>
          <div style="flex:1;min-width:280px;text-align:center">
            <img src="${thresholdPie}" alt="Threshold breakdown" style="max-width:100%;border:1px solid #e2e8f0;border-radius:8px"/>
          </div>
        </div>

        <h2 style="font-size:15px;color:#475569;margin:0 0 12px;text-transform:uppercase;letter-spacing:0.5px">Recent alerts (last 5)</h2>
        <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:24px">
          <thead>
            <tr style="background:#f1f5f9">
              <th style="text-align:left;padding:8px;border-bottom:1px solid #e2e8f0">Sent</th>
              <th style="text-align:left;padding:8px;border-bottom:1px solid #e2e8f0">Route</th>
              <th style="text-align:left;padding:8px;border-bottom:1px solid #e2e8f0">Depart</th>
              <th style="text-align:left;padding:8px;border-bottom:1px solid #e2e8f0">Per adult</th>
            </tr>
          </thead>
          <tbody>${alertRows}</tbody>
        </table>

        <div style="background:#f1f5f9;padding:14px;border-radius:8px;font-size:12px;color:#475569">
          <b>Stats this month:</b> ${apiCallsThisMonth} API calls used. Alert threshold: ${fmtUSD(threshold)}/adult. Active searches: ${rows.length}.
        </div>

        <p style="margin-top:24px;text-align:center">
          <a href="${APP_URL}" style="display:inline-block;background:#0a2e57;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Open full dashboard</a>
        </p>

        <p style="color:#94a3b8;font-size:11px;text-align:center;margin-top:24px">
          Sent automatically by your EgyptAir tracker bot at ${fmtDateTime(new Date().toISOString())}.
          Reply to this email or open the dashboard to manage searches.
        </p>
      </div>
    </div>
  `;

  return { html, subject, summary };
}

// ===========================================================================
// Weekly anomaly digest — biggest movers (top falls + rises) week-over-week.
// Fires Sundays 8pm ET. Designed to surface deals that drifted into range,
// not the absolute cheapest (the daily digest already covers that).
// ===========================================================================

type Mover = {
  origin: string;
  outbound_date: string;
  return_date: string;
  per_adult_now: number;
  per_adult_prev: number;
  delta: number;          // negative = price drop
  pct: number;            // signed
};

function buildMovers(): { fallers: Mover[]; risers: Mover[] } {
  // Pull the cached deals snapshot (today) and a deals_history table if present.
  // We don't yet store best-deals history, so fall back to comparing every
  // tracked search's current cheapest vs the price seen 7d ago for the same search.
  const searches = queries.listSearches().filter(s => s.active === 1);
  const movers: Mover[] = [];
  for (const s of searches) {
    const hist = queries.fareHistory(s.id, 14);
    if (hist.length < 2) continue;
    const now = hist[hist.length - 1].price_per_adult_usd;
    // Find the snapshot closest to "7 days before now"
    const target = Date.now() - 7 * 86400 * 1000;
    let prev = hist[0];
    let best = Infinity;
    for (const h of hist) {
      const d = Math.abs(new Date(h.polled_at).getTime() - target);
      if (d < best) { best = d; prev = h; }
    }
    if (prev.price_per_adult_usd === now) continue;
    movers.push({
      origin: s.origin,
      outbound_date: s.depart_date,
      return_date: s.return_date,
      per_adult_now: now,
      per_adult_prev: prev.price_per_adult_usd,
      delta: now - prev.price_per_adult_usd,
      pct: ((now - prev.price_per_adult_usd) / prev.price_per_adult_usd) * 100,
    });
  }
  const fallers = [...movers].filter(m => m.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 5);
  const risers  = [...movers].filter(m => m.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 5);
  return { fallers, risers };
}

function moverRow(m: Mover, isFall: boolean): string {
  const color = isFall ? '#15803d' : '#b91c1c';
  const sign = isFall ? '−' : '+';
  return `<tr>
    <td style="padding:8px;border-bottom:1px solid #f1f5f9"><b>${m.origin}</b> → CAI</td>
    <td style="padding:8px;border-bottom:1px solid #f1f5f9">${fmtDate(m.outbound_date)}</td>
    <td style="padding:8px;border-bottom:1px solid #f1f5f9">${fmtDate(m.return_date)}</td>
    <td style="padding:8px;border-bottom:1px solid #f1f5f9;color:#64748b">${fmtUSD(m.per_adult_prev)}</td>
    <td style="padding:8px;border-bottom:1px solid #f1f5f9"><b>${fmtUSD(m.per_adult_now)}</b></td>
    <td style="padding:8px;border-bottom:1px solid #f1f5f9;color:${color};font-weight:600">${sign}${fmtUSD(Math.abs(m.delta))} (${sign}${Math.abs(m.pct).toFixed(0)}%)</td>
  </tr>`;
}

export function buildAnomalyDigestHtml(): { html: string; subject: string; summary: string } {
  const { fallers, risers } = buildMovers();
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const topDrop = fallers[0];
  const headline = topDrop
    ? `📉 Biggest drop: ${topDrop.origin}→CAI ${fmtDate(topDrop.outbound_date)} now ${fmtUSD(topDrop.per_adult_now)} (was ${fmtUSD(topDrop.per_adult_prev)})`
    : (risers[0] ? `Prices mostly rising — top riser ${risers[0].origin}→CAI +${fmtUSD(risers[0].delta)}` : 'No significant fare movement this week');
  const subject = `📈 EgyptAir weekly movers — ${headline}`;
  const summary = `${fallers.length} faller${fallers.length === 1 ? '' : 's'}, ${risers.length} riser${risers.length === 1 ? '' : 's'}. ${headline}.`;

  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;max-width:680px;margin:auto;padding:24px;color:#0f172a;background:#f8fafc">
      <div style="background:linear-gradient(135deg,#0a2e57,#154a86);color:#fff;padding:20px 24px;border-radius:12px 12px 0 0">
        <div style="font-size:13px;opacity:0.8">${today}</div>
        <h1 style="margin:6px 0 0;font-size:22px">Weekly fare-movement summary</h1>
        <div style="margin-top:8px;opacity:0.95;font-size:14px">${headline}</div>
      </div>
      <div style="background:#fff;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none">

        <h2 style="font-size:14px;color:#15803d;margin:0 0 12px;text-transform:uppercase;letter-spacing:0.5px">📉 Biggest fallers (book candidates)</h2>
        <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:24px">
          <thead><tr style="background:#f0fdf4">
            <th style="text-align:left;padding:8px;border-bottom:1px solid #bbf7d0">Route</th>
            <th style="text-align:left;padding:8px;border-bottom:1px solid #bbf7d0">Depart</th>
            <th style="text-align:left;padding:8px;border-bottom:1px solid #bbf7d0">Return</th>
            <th style="text-align:left;padding:8px;border-bottom:1px solid #bbf7d0">7d ago</th>
            <th style="text-align:left;padding:8px;border-bottom:1px solid #bbf7d0">Now</th>
            <th style="text-align:left;padding:8px;border-bottom:1px solid #bbf7d0">Δ</th>
          </tr></thead>
          <tbody>${fallers.length ? fallers.map(m => moverRow(m, true)).join('') : `<tr><td colspan="6" style="padding:16px;text-align:center;color:#94a3b8">No significant drops this week.</td></tr>`}</tbody>
        </table>

        <h2 style="font-size:14px;color:#b91c1c;margin:0 0 12px;text-transform:uppercase;letter-spacing:0.5px">📈 Biggest risers (act fast / wait)</h2>
        <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:24px">
          <thead><tr style="background:#fef2f2">
            <th style="text-align:left;padding:8px;border-bottom:1px solid #fecaca">Route</th>
            <th style="text-align:left;padding:8px;border-bottom:1px solid #fecaca">Depart</th>
            <th style="text-align:left;padding:8px;border-bottom:1px solid #fecaca">Return</th>
            <th style="text-align:left;padding:8px;border-bottom:1px solid #fecaca">7d ago</th>
            <th style="text-align:left;padding:8px;border-bottom:1px solid #fecaca">Now</th>
            <th style="text-align:left;padding:8px;border-bottom:1px solid #fecaca">Δ</th>
          </tr></thead>
          <tbody>${risers.length ? risers.map(m => moverRow(m, false)).join('') : `<tr><td colspan="6" style="padding:16px;text-align:center;color:#94a3b8">No significant rises this week.</td></tr>`}</tbody>
        </table>

        <p style="margin-top:24px;text-align:center">
          <a href="${APP_URL}" style="display:inline-block;background:#0a2e57;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Open dashboard</a>
        </p>
        <p style="color:#94a3b8;font-size:11px;text-align:center;margin-top:24px">
          Weekly summary · sent Sundays 8pm ET. Comparing today's cheapest vs the snapshot from ~7 days ago for each tracked search.
        </p>
      </div>
    </div>
  `;
  return { html, subject, summary };
}

export async function sendAnomalyDigest(toEmail?: string): Promise<{ ok: true; id: string; sentTo: string } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY not set' };
  const to = toEmail || queries.getSetting('alert_email') || process.env.ALERT_EMAIL;
  if (!to) return { ok: false, error: 'No recipient email available' };
  const { html, subject } = buildAnomalyDigestHtml();
  const resend = new Resend(apiKey);
  const from = process.env.RESEND_FROM || 'onboarding@resend.dev';
  try {
    const result = await resend.emails.send({ from, to, subject, html });
    if (result.error) return { ok: false, error: result.error.message };
    return { ok: true, id: result.data?.id ?? '', sentTo: to };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export type RetrospectiveWindow = 'monthly' | 'six-month' | 'annual';

const WINDOW_DAYS: Record<RetrospectiveWindow, number> = {
  monthly: 30,
  'six-month': 180,
  annual: 365,
};

const WINDOW_LABEL: Record<RetrospectiveWindow, string> = {
  monthly: 'Last 30 days',
  'six-month': 'Last 6 months',
  annual: 'Last 12 months',
};

type RetroRouteStat = {
  search: SearchRow;
  count: number;
  min: number | null;
  max: number | null;
  avg: number | null;
  firstSeen: number | null;
  lastSeen: number | null;
};

function buildRetrospectiveStats(days: number): RetroRouteStat[] {
  const searches = queries.listSearches().filter(s => s.active === 1);
  return searches.map(s => {
    const hist = queries.fareHistory(s.id, days);
    if (!hist.length) {
      return { search: s, count: 0, min: null, max: null, avg: null, firstSeen: null, lastSeen: null };
    }
    const prices = hist.map(h => h.price_per_adult_usd);
    return {
      search: s,
      count: hist.length,
      min: Math.min(...prices),
      max: Math.max(...prices),
      avg: prices.reduce((a, b) => a + b, 0) / prices.length,
      firstSeen: hist[0].price_per_adult_usd,
      lastSeen: hist[hist.length - 1].price_per_adult_usd,
    };
  });
}

export function buildRetrospectiveHtml(win: RetrospectiveWindow): { html: string; subject: string; summary: string } {
  const days = WINDOW_DAYS[win];
  const label = WINDOW_LABEL[win];
  const stats = buildRetrospectiveStats(days);
  const threshold = parseFloat(queries.getSetting('alert_threshold_per_adult_usd') ?? '900');
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  const withData = stats.filter(s => s.min !== null);
  const overallMin = withData.length ? Math.min(...withData.map(s => s.min as number)) : null;
  const bestRoute = withData.find(s => s.min === overallMin);

  const cutoff = Date.now() - days * 86400 * 1000;
  const allRecent = queries.recentAlerts(500);
  const alertsInWindow = allRecent.filter(a => new Date(a.sent_at).getTime() >= cutoff);

  const headline = bestRoute && overallMin !== null
    ? `${label}: best per-adult was ${fmtUSD(overallMin)} on ${bestRoute.search.origin}→${bestRoute.search.destination}`
    : `${label}: no fare data captured yet`;
  const subject = `📅 EgyptAir ${label.toLowerCase()} retrospective — ${headline}`;
  const summary = `${withData.length} routes with data, ${alertsInWindow.length} alerts fired. ${headline}.`;

  const trendBadge = (first: number | null, last: number | null) => {
    if (first === null || last === null) return '<span style="color:#94a3b8">—</span>';
    const delta = last - first;
    if (Math.abs(delta) < 1) return '<span style="color:#64748b">flat</span>';
    const pct = (delta / first) * 100;
    const color = delta < 0 ? '#15803d' : '#b91c1c';
    const sign = delta < 0 ? '−' : '+';
    return `<span style="color:${color};font-weight:600">${sign}${fmtUSD(Math.abs(delta))} (${sign}${Math.abs(pct).toFixed(0)}%)</span>`;
  };

  const routeRows = stats.length
    ? stats.map(r => {
        if (r.min === null) {
          return `<tr><td style="padding:8px;border-bottom:1px solid #f1f5f9"><b>${r.search.origin}</b> → ${r.search.destination}</td><td colspan="4" style="padding:8px;border-bottom:1px solid #f1f5f9;color:#94a3b8">no snapshots in window</td></tr>`;
        }
        const underBadge = (r.min as number) < threshold
          ? `<span style="background:#dcfce7;color:#15803d;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:600">hit ✓</span>`
          : `<span style="background:#fef3c7;color:#92400e;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:600">above</span>`;
        return `<tr><td style="padding:8px;border-bottom:1px solid #f1f5f9"><b>${r.search.origin}</b> → ${r.search.destination}<br><span style="color:#94a3b8;font-size:11px">${r.count} snapshots</span></td><td style="padding:8px;border-bottom:1px solid #f1f5f9"><b>${fmtUSD(r.min as number)}</b> ${underBadge}</td><td style="padding:8px;border-bottom:1px solid #f1f5f9">${fmtUSD(r.avg as number)}</td><td style="padding:8px;border-bottom:1px solid #f1f5f9;color:#64748b">${fmtUSD(r.max as number)}</td><td style="padding:8px;border-bottom:1px solid #f1f5f9">${trendBadge(r.firstSeen, r.lastSeen)}</td></tr>`;
      }).join('')
    : `<tr><td colspan="5" style="padding:16px;text-align:center;color:#94a3b8">No active searches.</td></tr>`;

  const alertRows = alertsInWindow.length
    ? alertsInWindow.slice(0, 20).map(a => `<tr><td style="padding:8px;border-bottom:1px solid #f1f5f9;color:#64748b;font-size:12px">${fmtDateTime(a.sent_at)}</td><td style="padding:8px;border-bottom:1px solid #f1f5f9"><b>${a.origin}</b> → ${a.destination}</td><td style="padding:8px;border-bottom:1px solid #f1f5f9">${fmtDate(a.depart_date)}</td><td style="padding:8px;border-bottom:1px solid #f1f5f9"><b>${fmtUSD(a.price_per_adult_usd)}</b></td></tr>`).join('')
    : `<tr><td colspan="4" style="padding:16px;text-align:center;color:#94a3b8">No alerts fired in window.</td></tr>`;

  const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;max-width:680px;margin:auto;padding:24px;color:#0f172a;background:#f8fafc"><div style="background:linear-gradient(135deg,#0a2e57,#154a86);color:#fff;padding:20px 24px;border-radius:12px 12px 0 0"><div style="font-size:13px;opacity:0.8">${today}</div><h1 style="margin:6px 0 0;font-size:22px">EgyptAir retrospective — ${label}</h1><div style="margin-top:8px;opacity:0.95;font-size:14px">${headline}</div></div><div style="background:#fff;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e2e8f0;border-top:none"><div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:24px"><div style="flex:1;min-width:140px;background:#f1f5f9;padding:14px;border-radius:8px"><div style="font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:0.5px">Routes tracked</div><div style="font-size:22px;font-weight:700;color:#0a2e57">${stats.length}</div></div><div style="flex:1;min-width:140px;background:#f0fdf4;padding:14px;border-radius:8px"><div style="font-size:11px;color:#15803d;text-transform:uppercase;letter-spacing:0.5px">Best per-adult</div><div style="font-size:22px;font-weight:700;color:#15803d">${overallMin !== null ? fmtUSD(overallMin) : '—'}</div></div><div style="flex:1;min-width:140px;background:#fef3c7;padding:14px;border-radius:8px"><div style="font-size:11px;color:#92400e;text-transform:uppercase;letter-spacing:0.5px">Alerts fired</div><div style="font-size:22px;font-weight:700;color:#92400e">${alertsInWindow.length}</div></div></div><h2 style="font-size:14px;color:#475569;margin:0 0 12px;text-transform:uppercase;letter-spacing:0.5px">Per-route summary</h2><table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:24px"><thead><tr style="background:#f1f5f9"><th style="text-align:left;padding:8px;border-bottom:1px solid #e2e8f0">Route</th><th style="text-align:left;padding:8px;border-bottom:1px solid #e2e8f0">Min</th><th style="text-align:left;padding:8px;border-bottom:1px solid #e2e8f0">Avg</th><th style="text-align:left;padding:8px;border-bottom:1px solid #e2e8f0">Max</th><th style="text-align:left;padding:8px;border-bottom:1px solid #e2e8f0">Window trend</th></tr></thead><tbody>${routeRows}</tbody></table><h2 style="font-size:14px;color:#475569;margin:0 0 12px;text-transform:uppercase;letter-spacing:0.5px">Alerts fired in window</h2><table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:24px"><thead><tr style="background:#f1f5f9"><th style="text-align:left;padding:8px;border-bottom:1px solid #e2e8f0">Sent</th><th style="text-align:left;padding:8px;border-bottom:1px solid #e2e8f0">Route</th><th style="text-align:left;padding:8px;border-bottom:1px solid #e2e8f0">Depart</th><th style="text-align:left;padding:8px;border-bottom:1px solid #e2e8f0">Per adult</th></tr></thead><tbody>${alertRows}</tbody></table><p style="margin-top:24px;text-align:center"><a href="${APP_URL}" style="display:inline-block;background:#0a2e57;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">Open dashboard</a></p><p style="color:#94a3b8;font-size:11px;text-align:center;margin-top:24px">${label} retrospective. Threshold: ${fmtUSD(threshold)}/adult. Stats computed across every snapshot polled in the window.</p></div></div>`;
  return { html, subject, summary };
}

export async function sendRetrospectiveDigest(
  win: RetrospectiveWindow,
  toEmail?: string,
): Promise<{ ok: true; id: string; sentTo: string } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY not set' };
  const to = toEmail || queries.getSetting('alert_email') || process.env.ALERT_EMAIL;
  if (!to) return { ok: false, error: 'No recipient email available' };
  const { html, subject } = buildRetrospectiveHtml(win);
  const resend = new Resend(apiKey);
  const from = process.env.RESEND_FROM || 'onboarding@resend.dev';
  try {
    const result = await resend.emails.send({ from, to, subject, html });
    if (result.error) return { ok: false, error: result.error.message };
    return { ok: true, id: result.data?.id ?? '', sentTo: to };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function sendDigest(toEmail?: string, headline?: string): Promise<{ ok: true; id: string; sentTo: string } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY not set' };

  const to = toEmail || queries.getSetting('alert_email') || process.env.ALERT_EMAIL;
  if (!to) return { ok: false, error: 'No recipient email available' };

  const { html, subject } = buildDigestHtml({ headline });
  const resend = new Resend(apiKey);
  const from = process.env.RESEND_FROM || 'onboarding@resend.dev';

  try {
    const result = await resend.emails.send({ from, to, subject, html });
    if (result.error) return { ok: false, error: result.error.message };
    return { ok: true, id: result.data?.id ?? '', sentTo: to };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

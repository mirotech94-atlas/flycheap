import 'server-only';
import { queries, type SearchRow, type FareRow } from './db';
import { sendFareAlert } from './email';
import { getCachedBestDeals, DEFAULT_PARTY } from './bestDeals';
import { Resend } from 'resend';
import { fmtUSD, fmtDate, fmtDateTime, fmtRelative, bookingLink } from './utils';
import { effectiveTarget } from './targets';
import { APP_URL } from './hosts';
import { emailFrame, emailMasthead, emailFooter, emailButton, emailEyebrow, EMAIL_TOKENS as T } from './emailLayout';

const QUOTA_PER_MONTH = 9999; // Travelpayouts is essentially unmetered for affiliates

/**
 * A small bar list, inline SVG. Replaces the remote doughnut and pie images
 * the digest used to embed: those were an outbound request to a third party
 * the moment the mail was opened, and the wrong form — a pie asks the eye to
 * compare angles, and "party total by origin" is a magnitude per category,
 * which a bar answers at a glance.
 *
 * Single series, one hue, value labelled directly, square ends (the editorial
 * system has no radius). Gmail strips inline <svg>, so every caller prints the
 * same numbers as a ruled table beneath it — the chart is never the only copy.
 */
function barListSvg(rows: Array<{ label: string; value: number; color?: string; text?: string }>, opts: { width?: number; title: string }): string {
  if (rows.length === 0) return '';
  const W = opts.width ?? 268, ROW = 22, LABEL = 64, VALUE = 74, PAD = 2;
  const H = rows.length * ROW;
  const max = Math.max(1, ...rows.map(r => r.value));
  const track = W - LABEL - VALUE;
  const bars = rows.map((r, i) => {
    const y = i * ROW + PAD;
    const w = r.value > 0 ? Math.max(2, Math.round((r.value / max) * track)) : 0;
    return `<text x="0" y="${y + 13}" font-family="${T.MONO}" font-size="11" fill="${T.MUTED_2}">${escapeHtml(r.label)}</text>`
      + `<rect x="${LABEL}" y="${y + 3}" width="${w}" height="${ROW - PAD * 2 - 6}" fill="${r.color ?? T.ACCENT}"/>`
      + `<text x="${W}" y="${y + 13}" text-anchor="end" font-family="${T.MONO}" font-size="11" fill="${T.INK}">${escapeHtml(r.text ?? String(r.value))}</text>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;max-width:100%;height:auto" role="img" aria-label="${escapeHtml(opts.title)}">${bars}</svg>`;
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

/**
 * The owner digests wear the same shell as every customer email (editorial
 * tokens, ruled tables, ink buttons). These helpers keep the three builders'
 * tables identical rather than each carrying its own inline palette.
 */
const TH = `text-align:left;padding:8px 6px;border-bottom:1px solid ${T.INK};font-family:${T.MONO};font-size:10.5px;letter-spacing:.12em;text-transform:uppercase;font-weight:500;color:${T.MUTED_2}`;
const TD = `padding:8px 6px;border-bottom:1px solid ${T.LINE_CARD};font-family:${T.SANS};font-size:13px;color:${T.INK};vertical-align:top`;
const TDM = `${TD};color:${T.MUTED}`;
const NUM = `font-family:${T.MONO}`;
const H2 = `font-family:${T.MONO};font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:${T.MUTED_2};margin:22px 0 8px`;
const EMPTY = `padding:16px;text-align:center;color:${T.MUTED};font-family:${T.SANS};font-size:13px`;
const pill = (ok: boolean, text: string) => `<span style="${NUM};font-size:12px;font-weight:500;color:${ok ? T.GREEN : T.INK_SOFT}">${text}</span>`;
const digestShell = (eyebrow: string, headline: string, sub: string, inner: string, note: string) => emailFrame(
  sub,
  emailMasthead(eyebrow)
  + `<div style="background:${T.CARD};padding:26px 32px 28px">`
  + emailEyebrow(new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }))
  + `<h1 style="font-family:${T.SERIF};font-size:28px;line-height:1.15;font-weight:400;letter-spacing:-.02em;color:${T.INK};margin:8px 0 6px">${headline}</h1>`
  + `<div style="font-family:${T.SANS};font-size:14px;color:${T.MUTED};margin:0 0 6px">${sub}</div>`
  + inner
  + `<div style="margin:26px 0 0">${emailButton('Open the dashboard', APP_URL)}</div>`
  + `</div>`
  + emailFooter({ appUrl: APP_URL, note }),
);

/** Minimal escape for text we put into the digest's HTML. */
function escapeHtml(v: string): string {
  return v.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
}

export function buildDigestHtml(
  opts?: { headline?: string; ownerUserId?: number },
): { html: string; subject: string; summary: string; deferredIds: number[] } {
  const ownerUserId = opts?.ownerUserId ?? 1;
  const rows = buildRows();
  const threshold = parseFloat(queries.getSetting('alert_threshold_per_adult_usd') ?? '900');
  const apiCallsThisMonth = queries.apiCallsThisMonth().count;
  const recentAlerts = queries.recentAlerts(5);
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  // Chart 1: total party cost by origin (current cheapest) — one hue, a bar per origin.
  const byOrigin: Record<string, number> = {};
  for (const r of rows) {
    if (r.fare) byOrigin[r.search.origin] = (byOrigin[r.search.origin] ?? 0) + r.fare.total_price_usd;
  }
  const originRows = Object.entries(byOrigin)
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label, value: Math.round(value), text: fmtUSD(value) }));
  const originChart = barListSvg(originRows, { title: 'Party total by origin, USD' });

  // Chart 2: searches under / over target / no data — status colours, the word beside each.
  const under = rows.filter(r => r.fare && r.fare.price_per_adult_usd < effectiveTarget(r.search, threshold)).length;
  const over = rows.filter(r => r.fare && r.fare.price_per_adult_usd >= effectiveTarget(r.search, threshold)).length;
  const noData = rows.filter(r => !r.fare).length;
  const statusRows = [
    { label: 'below', value: under, color: T.GREEN },
    { label: 'above', value: over, color: T.RED },
    { label: 'no data', value: noData, color: T.MUTED },
  ];
  const statusChart = barListSvg(statusRows, { title: `Searches against the ${fmtUSD(threshold)} per-adult threshold` });
  const legend = (items: Array<{ label: string; text: string }>) =>
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:6px">${items.map(i =>
      `<tr><td style="${TDM};${NUM};font-size:11px;padding:4px 0">${escapeHtml(i.label)}</td><td style="${TD};${NUM};font-size:11px;padding:4px 0;text-align:right">${escapeHtml(i.text)}</td></tr>`).join('')}</table>`;
  const originLegend = legend(originRows.map(r => ({ label: r.label, text: r.text })));
  const statusLegend = legend(statusRows.map(r => ({ label: r.label, text: String(r.value) })));

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
      return `Deal alert: ${fmtUSD(bestDeal.per_adult_usd)}/adult ${bestDeal.origin} → ${bestDeal.destination} ${fmtDate(bestDeal.outbound_date)} → ${fmtDate(bestDeal.return_date)}`;
    }
    if (bestDeal) {
      return `Cheapest in next 12 months: ${fmtUSD(bestDeal.per_adult_usd)}/adult (${bestDeal.origin}, ${fmtDate(bestDeal.outbound_date)})`;
    }
    if (cheapestNow) {
      return `Tracked searches: cheapest ${fmtUSD(cheapestNow.fare.price_per_adult_usd)}/adult ${cheapestNow.search.origin} ${fmtDate(cheapestNow.search.depart_date)}`;
    }
    return 'No fare data yet';
  })();

  // Alerts the policy held for the digest — trend warnings, verdict changes that
  // were not close to departure, anything caught by quiet hours or the daily
  // cap. Without this they would have been computed and then silently dropped,
  // which is what "deferred" would otherwise have meant.
  const deferred = (() => {
    try { return queries.pendingDeferredAlerts(ownerUserId); }
    catch { return []; }
  })();
  const deferredIds = deferred.map(d => d.id);
  const deferredRows = deferred
    .map(d => `<li>${escapeHtml(d.headline)}</li>`)
    .join('');

  const summary = `${rows.length} active search${rows.length === 1 ? '' : 'es'}. ${headline}. Threshold: ${fmtUSD(threshold)}/adult.`;

  const subject = `✈️  FlyCheap digest — ${headline}`;

  // Filter tracked-search rows to <= maxDisplay (or rows with no fare yet).
  const visibleRows = rows.filter(r => !r.fare || r.fare.price_per_adult_usd <= maxDisplay);
  const fareTableRows = visibleRows.map(r => {
    if (!r.fare) {
      return `<tr>
        <td style="${TD}"><b>${r.search.origin}</b> → ${r.search.destination}</td>
        <td style="${TDM}">${fmtDate(r.search.depart_date)}</td>
        <td style="${TDM}">${fmtDate(r.search.return_date)}</td>
        <td colspan="3" style="${TDM}">no data yet</td>
      </tr>`;
    }
    const delta = r.fare.price_per_adult_usd - effectiveTarget(r.search, threshold);
    const badge = delta < 0 ? pill(true, 'below ✓') : pill(false, `+${fmtUSD(delta)}`);
    return `<tr>
      <td style="${TD}"><b>${r.search.origin}</b> → ${r.search.destination}<br><span style="${NUM};color:${T.MUTED};font-size:11px">${r.fare.outbound_flight_no ?? ''} / ${r.fare.return_flight_no ?? ''}</span></td>
      <td style="${TDM}">${fmtDate(r.search.depart_date)}</td>
      <td style="${TDM}">${fmtDate(r.search.return_date)}</td>
      <td style="${TD};${NUM};font-weight:500;color:${T.FARE_TEXT}">${fmtUSD(r.fare.price_per_adult_usd)}</td>
      <td style="${TD};${NUM}">${fmtUSD(r.fare.total_price_usd)}</td>
      <td style="${TD}">${badge}</td>
    </tr>`;
  }).join('');

  const alertRows = recentAlerts.length
    ? recentAlerts.map(a => `<tr>
        <td style="${TDM};${NUM};font-size:12px">${fmtDateTime(a.sent_at)}</td>
        <td style="${TD}"><b>${a.origin}</b> → ${a.destination}</td>
        <td style="${TDM}">${a.depart_date}</td>
        <td style="${TD};${NUM};font-weight:500">${fmtUSD(a.price_per_adult_usd)}</td>
      </tr>`).join('')
    : `<tr><td colspan="4" style="${EMPTY}">No alerts sent yet.</td></tr>`;

  const dealRows = bestDealsCache.deals.map(d => {
    const under = d.per_adult_usd < threshold;
    // The same party the cache row was priced for — never a second typed 4+1.
    const bookUrl = bookingLink({ origin: d.origin, destination: d.destination, departDate: d.outbound_date, returnDate: d.return_date, adults: DEFAULT_PARTY.adults, infants: DEFAULT_PARTY.infants });
    return `<tr>
      <td style="${TD}"><b>${d.origin}</b> → ${d.destination}</td>
      <td style="${TDM}">${fmtDate(d.outbound_date)}</td>
      <td style="${TDM}">${fmtDate(d.return_date)}</td>
      <td style="${TDM};${NUM}">${d.trip_length_days}d</td>
      <td style="${TD};${NUM};font-weight:500;color:${T.FARE_TEXT}">${fmtUSD(d.per_adult_usd)}</td>
      <td style="${TD};${NUM}">${fmtUSD(d.party_total_usd)}</td>
      <td style="${TD}">${under ? pill(true, 'below ✓') : pill(false, `+${fmtUSD(d.per_adult_usd - threshold)}`)}</td>
      <td style="${TD};text-align:right"><a href="${bookUrl}" style="color:${T.ACCENT};font-weight:600;text-decoration:underline;font-size:12px">Book</a></td>
    </tr>`;
  }).join('');

  const inner = `
    ${deferredRows ? `<div style="${H2}">Since your last digest</div><ul style="margin:0;padding-left:18px;font-family:${T.SANS};font-size:14px;line-height:1.7;color:${T.INK}">${deferredRows}</ul>` : ''}

    ${bestDealsCache.deals.length > 0 ? `
    <div style="${H2}">Best deals across the next 12 months</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
      <thead><tr><th style="${TH}">Route</th><th style="${TH}">Outbound</th><th style="${TH}">Return</th><th style="${TH}">Trip</th><th style="${TH}">Per adult</th><th style="${TH}">Party</th><th style="${TH}">vs ${fmtUSD(threshold)}</th><th style="${TH}"></th></tr></thead>
      <tbody>${dealRows}</tbody>
    </table>` : ''}

    <div style="${H2}">Tracked searches — current cheapest</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
      <thead><tr><th style="${TH}">Route</th><th style="${TH}">Depart</th><th style="${TH}">Return</th><th style="${TH}">Per adult</th><th style="${TH}">Party total</th><th style="${TH}">Target</th></tr></thead>
      <tbody>${fareTableRows || `<tr><td colspan="6" style="${EMPTY}">No active searches.</td></tr>`}</tbody>
    </table>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:22px"><tr valign="top">
      <td width="50%" style="padding-right:12px">${emailEyebrow('Party total by origin')}<div style="margin-top:8px">${originChart}</div>${originLegend}</td>
      <td width="50%" style="padding-left:12px;border-left:1px solid ${T.LINE_CARD}">${emailEyebrow(`Searches vs ${fmtUSD(threshold)} target`)}<div style="margin-top:8px">${statusChart}</div>${statusLegend}</td>
    </tr></table>

    <div style="${H2}">Recent alerts (last 5)</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
      <thead><tr><th style="${TH}">Sent</th><th style="${TH}">Route</th><th style="${TH}">Depart</th><th style="${TH}">Per adult</th></tr></thead>
      <tbody>${alertRows}</tbody>
    </table>

    <div style="margin-top:18px;padding:12px 14px;background:${T.SURFACE_2};font-family:${T.SANS};font-size:12px;color:${T.INK_SOFT}">
      <b>This month:</b> ${apiCallsThisMonth} API calls used · alert threshold ${fmtUSD(threshold)}/adult · ${rows.length} active search${rows.length === 1 ? '' : 'es'}.
    </div>`;

  const html = digestShell('Owner digest', 'Daily digest', headline, inner,
    `Sent automatically by FlyCheap at ${fmtDateTime(new Date().toISOString())}. Reply to this email or open the dashboard to manage searches.`);

  return { html, subject, summary, deferredIds };
}

// ===========================================================================
// Weekly anomaly digest — biggest movers (top falls + rises) week-over-week.
// Fires Sundays 8pm ET. Designed to surface deals that drifted into range,
// not the absolute cheapest (the daily digest already covers that).
// ===========================================================================

type Mover = {
  origin: string;
  destination: string;
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
      destination: s.destination,
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
  const color = isFall ? T.GREEN : T.RED;
  const sign = isFall ? '−' : '+';
  return `<tr>
    <td style="${TD}"><b>${m.origin}</b> → ${m.destination}</td>
    <td style="${TDM}">${fmtDate(m.outbound_date)}</td>
    <td style="${TDM}">${fmtDate(m.return_date)}</td>
    <td style="${TDM};${NUM}">${fmtUSD(m.per_adult_prev)}</td>
    <td style="${TD};${NUM};font-weight:500">${fmtUSD(m.per_adult_now)}</td>
    <td style="${TD};${NUM};color:${color};font-weight:500">${sign}${fmtUSD(Math.abs(m.delta))} (${sign}${Math.abs(m.pct).toFixed(0)}%)</td>
  </tr>`;
}

export function buildAnomalyDigestHtml(): { html: string; subject: string; summary: string } {
  const { fallers, risers } = buildMovers();
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const topDrop = fallers[0];
  const headline = topDrop
    ? `📉 Biggest drop: ${topDrop.origin}→${topDrop.destination} ${fmtDate(topDrop.outbound_date)} now ${fmtUSD(topDrop.per_adult_now)} (was ${fmtUSD(topDrop.per_adult_prev)})`
    : (risers[0] ? `Prices mostly rising — top riser ${risers[0].origin}→${risers[0].destination} +${fmtUSD(risers[0].delta)}` : 'No significant fare movement this week');
  const subject = `📈 FlyCheap weekly movers — ${headline}`;
  const summary = `${fallers.length} faller${fallers.length === 1 ? '' : 's'}, ${risers.length} riser${risers.length === 1 ? '' : 's'}. ${headline}.`;

  const moverTable = (rowsHtml: string, empty: string) => `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
      <thead><tr><th style="${TH}">Route</th><th style="${TH}">Depart</th><th style="${TH}">Return</th><th style="${TH}">7d ago</th><th style="${TH}">Now</th><th style="${TH}">Δ</th></tr></thead>
      <tbody>${rowsHtml || `<tr><td colspan="6" style="${EMPTY}">${empty}</td></tr>`}</tbody>
    </table>`;
  const inner = `
    <div style="${H2}">Biggest fallers · book candidates</div>
    ${moverTable(fallers.map(m => moverRow(m, true)).join(''), 'No significant drops this week.')}
    <div style="${H2}">Biggest risers · act fast or wait</div>
    ${moverTable(risers.map(m => moverRow(m, false)).join(''), 'No significant rises this week.')}`;
  const html = digestShell('Owner digest', 'Weekly fare movement', headline, inner,
    `Weekly summary · sent Sundays 8pm ET. Comparing today's cheapest with the snapshot from about 7 days ago for each tracked search.`);
  void today;
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
  const subject = `📅 FlyCheap ${label.toLowerCase()} retrospective — ${headline}`;
  const summary = `${withData.length} routes with data, ${alertsInWindow.length} alerts fired. ${headline}.`;

  const trendBadge = (first: number | null, last: number | null) => {
    if (first === null || last === null) return '<span style="color:${T.MUTED}">—</span>';
    const delta = last - first;
    if (Math.abs(delta) < 1) return '<span style="color:${T.MUTED}">flat</span>';
    const pct = (delta / first) * 100;
    const color = delta < 0 ? T.GREEN : T.RED;
    const sign = delta < 0 ? '−' : '+';
    return `<span style="${NUM};color:${color};font-weight:500">${sign}${fmtUSD(Math.abs(delta))} (${sign}${Math.abs(pct).toFixed(0)}%)</span>`;
  };

  const routeRows = stats.length
    ? stats.map(r => {
        if (r.min === null) {
          return `<tr><td style="${TD}"><b>${r.search.origin}</b> → ${r.search.destination}</td><td colspan="4" style="${TDM}">no snapshots in window</td></tr>`;
        }
        const underBadge = (r.min as number) < threshold ? pill(true, 'hit ✓') : pill(false, 'above');
        return `<tr><td style="${TD}"><b>${r.search.origin}</b> → ${r.search.destination}<br><span style="${NUM};color:${T.MUTED};font-size:11px">${r.count} snapshots</span></td><td style="${TD};${NUM};font-weight:500;color:${T.FARE_TEXT}">${fmtUSD(r.min as number)} ${underBadge}</td><td style="${TDM}">${fmtUSD(r.avg as number)}</td><td style="${TDM};${NUM}">${fmtUSD(r.max as number)}</td><td style="${TDM}">${trendBadge(r.firstSeen, r.lastSeen)}</td></tr>`;
      }).join('')
    : `<tr><td colspan="5" style="${EMPTY}">No active searches.</td></tr>`;

  const alertRows = alertsInWindow.length
    ? alertsInWindow.slice(0, 20).map(a => `<tr><td style="${TDM};${NUM};font-size:12px">${fmtDateTime(a.sent_at)}</td><td style="${TDM}"><b>${a.origin}</b> → ${a.destination}</td><td style="${TDM}">${fmtDate(a.depart_date)}</td><td style="${TDM}"><b>${fmtUSD(a.price_per_adult_usd)}</b></td></tr>`).join('')
    : `<tr><td colspan="4" style="${EMPTY}">No alerts fired in window.</td></tr>`;

  const stat = (label: string, value: string, color = T.INK) =>
    `<td width="33%" style="padding:12px 14px;border-top:1px solid ${T.LINE};border-bottom:1px solid ${T.LINE}">${emailEyebrow(label)}<div style="font-family:${T.SERIF};font-size:28px;letter-spacing:-.02em;color:${color};margin-top:4px">${value}</div></td>`;
  const inner = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:14px"><tr>
      ${stat('Routes tracked', String(stats.length))}
      ${stat('Best per adult', overallMin !== null ? fmtUSD(overallMin) : '—', T.FARE_TEXT)}
      ${stat('Alerts fired', String(alertsInWindow.length))}
    </tr></table>
    <div style="${H2}">Per-route summary</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
      <thead><tr><th style="${TH}">Route</th><th style="${TH}">Min</th><th style="${TH}">Avg</th><th style="${TH}">Max</th><th style="${TH}">Window trend</th></tr></thead>
      <tbody>${routeRows}</tbody>
    </table>
    <div style="${H2}">Alerts fired in window</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
      <thead><tr><th style="${TH}">Sent</th><th style="${TH}">Route</th><th style="${TH}">Depart</th><th style="${TH}">Per adult</th></tr></thead>
      <tbody>${alertRows}</tbody>
    </table>`;
  const html = digestShell('Owner digest', `Retrospective — ${label}`, headline, inner,
    `${label} retrospective. Threshold ${fmtUSD(threshold)}/adult. Stats computed across every snapshot polled in the window.`);
  void today;
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

  const { html, subject, deferredIds } = buildDigestHtml({ headline });
  const resend = new Resend(apiKey);
  const from = process.env.RESEND_FROM || 'onboarding@resend.dev';

  try {
    const result = await resend.emails.send({ from, to, subject, html });
    if (result.error) return { ok: false, error: result.error.message };
    // Only NOW are the held alerts actually delivered. Marking them before the
    // send would lose them if it failed — and a held alert that is lost is worse
    // than one never computed, because the poller believes it was handled.
    try { queries.markDeferredDelivered(deferredIds); }
    catch (e) { console.error('[digest] markDeferredDelivered failed:', (e as Error).message); }
    return { ok: true, id: result.data?.id ?? '', sentTo: to };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

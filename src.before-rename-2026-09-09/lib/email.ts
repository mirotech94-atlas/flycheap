import 'server-only';
import { Resend } from 'resend';
import { fmtUSD, fmtDate, fmtDateTime } from './utils';
import { bookingLink } from './affiliate';
import type { SearchRow, FareRow } from './db';

export type AlertEmailContext = {
  /** Route's "normal" price — 7-day median (same number the anomaly detector uses). */
  median7d: number | null;
  /** Previous alert sent for this search, for the "delta vs last alert" line. */
  lastAlert: { price_per_adult_usd: number; sent_at: string } | null;
  /** Last 30 days, daily minimum per adult — feeds the inline SVG sparkline. */
  history: Array<{ day: string; price: number }>;
  /** Nearby (±3d) date pairs from best_deals_cache that price at or below this fare. */
  flexDates: Array<{ depart: string; return: string; price: number }>;
};

export type AlertEmailInput = {
  to: string;
  search: SearchRow;
  fare: FareRow;
  thresholdPerAdult: number;
  kind?: 'threshold' | 'price-drop';
  pctDrop?: number;
  median7d?: number | null;
  context?: Partial<AlertEmailContext>;
};

const SITE = (process.env.APP_URL || 'https://flycheap.18dn.com').replace(/\/$/, '');

/** "Sat, Dec 20" — weekday makes the working-date range scannable. */
function fmtDow(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}
function nightsBetween(dep: string, ret: string): number | null {
  const a = Date.parse(dep.slice(0, 10) + 'T00:00:00Z');
  const b = Date.parse(ret.slice(0, 10) + 'T00:00:00Z');
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return null;
  return Math.round((b - a) / 86400000);
}
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Server-rendered inline SVG sparkline for the alert email. No external
 * images (nothing to block, nothing to load). Renders in Apple Mail, iOS
 * Mail, Outlook for Mac and Thunderbird; Gmail strips inline <svg>, so the
 * low/high text line right after it always carries the same information.
 */
function sparklineSvg(history: Array<{ day: string; price: number }>, current: number, threshold: number): string {
  const pts = [...history].sort((a, b) => a.day.localeCompare(b.day)).map(h => h.price);
  if (pts.length < 2) return '';
  const W = 520, H = 72, pad = 6;
  const lo = Math.min(...pts, current);
  const hi = Math.max(...pts, current);
  const range = Math.max(1, hi - lo);
  const x = (i: number) => pad + (i / (pts.length - 1)) * (W - pad * 2);
  const y = (v: number) => pad + (H - pad * 2) - ((v - lo) / range) * (H - pad * 2);
  const line = pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L${x(pts.length - 1).toFixed(1)},${(H - pad).toFixed(1)} L${x(0).toFixed(1)},${(H - pad).toFixed(1)} Z`;
  const minIdx = pts.indexOf(Math.min(...pts));
  const tY = threshold >= lo && threshold <= hi ? y(threshold) : null;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;max-width:100%;height:auto" role="img" aria-label="30-day price history">
    <path d="${area}" fill="#d4af37" fill-opacity="0.22"/>
    ${tY != null ? `<line x1="${pad}" x2="${W - pad}" y1="${tY.toFixed(1)}" y2="${tY.toFixed(1)}" stroke="#8a93a6" stroke-width="1" stroke-dasharray="3 3"/>` : ''}
    <path d="${line}" fill="none" stroke="#0a3a6b" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="${x(minIdx).toFixed(1)}" cy="${y(pts[minIdx]).toFixed(1)}" r="3.5" fill="#d4af37" stroke="#fff" stroke-width="1.5"/>
    <circle cx="${x(pts.length - 1).toFixed(1)}" cy="${y(pts[pts.length - 1]).toFixed(1)}" r="3.5" fill="#0a3a6b" stroke="#fff" stroke-width="1.5"/>
  </svg>`;
}

/**
 * Threshold / price-drop alert email — Going + Kayak pattern:
 *   route + dates headline → "normal $X → now $Y (−Z%)" → delta vs last alert
 *   → 30-day sparkline → working date ranges → (mistake-fare urgency) → Book via /go.
 * Multipart: HTML + plain-text alternative, RFC 8058 List-Unsubscribe headers.
 */
export async function sendFareAlert(input: AlertEmailInput): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY not set' };

  const resend = new Resend(apiKey);
  const from = process.env.RESEND_FROM || 'onboarding@resend.dev';
  const { unsubscribeUrl } = await import('@/app/api/unsubscribe/route');
  const unsubLink = unsubscribeUrl(input.to, SITE);

  const { search, fare, thresholdPerAdult, kind = 'threshold', pctDrop } = input;
  const ctx: AlertEmailContext = {
    median7d: input.context?.median7d ?? input.median7d ?? null,
    lastAlert: input.context?.lastAlert ?? null,
    history: input.context?.history ?? [],
    flexDates: input.context?.flexDates ?? [],
  };
  const now = fare.price_per_adult_usd;
  const normal = ctx.median7d && ctx.median7d > 0 ? ctx.median7d : null;
  // % below normal: reuse the detector's figure when given, else derive from the median.
  const pctBelowNormal = pctDrop != null ? pctDrop : normal ? ((normal - now) / normal) * 100 : null;
  const isDrop = kind === 'price-drop';
  // Mistake-fare heuristic, same bar as the dashboard radar (< 70% of target)
  // and the Slack/Telegram bots (≥ 30% under the route's normal).
  const isMistake = now < thresholdPerAdult * 0.7 || (pctBelowNormal != null && pctBelowNormal >= 30);
  const tag = isMistake ? '✦ MISTAKE FARE' : isDrop ? '📉 PRICE DROP' : '✈️ BELOW TARGET';
  const route = `${search.origin} → ${search.destination}`;
  const nights = nightsBetween(search.depart_date, search.return_date);
  const datesLine = `${fmtDow(search.depart_date)} → ${fmtDow(search.return_date)}${nights ? ` · ${nights} nights` : ''}`;
  const headlinePrice = normal
    ? `normal ${fmtUSD(normal)} → now ${fmtUSD(now)}${pctBelowNormal && pctBelowNormal > 0 ? ` (−${pctBelowNormal.toFixed(0)}%)` : ''}`
    : `now ${fmtUSD(now)} · target ${fmtUSD(thresholdPerAdult)}`;
  const subject = `${tag} · ${route} ${headlinePrice} · ${fmtDate(search.depart_date)}`;

  const lastDelta = ctx.lastAlert ? now - ctx.lastAlert.price_per_adult_usd : null;
  const lastAlertLine = ctx.lastAlert && lastDelta != null
    ? `vs your last alert (${fmtDate(ctx.lastAlert.sent_at)} · ${fmtUSD(ctx.lastAlert.price_per_adult_usd)}): ${lastDelta <= 0 ? '−' : '+'}${fmtUSD(Math.abs(lastDelta))}`
    : 'first alert for this watch';

  const histPrices = ctx.history.map(h => h.price);
  const hist30 = histPrices.length >= 2
    ? { low: Math.min(...histPrices, now), high: Math.max(...histPrices, now), days: ctx.history.length }
    : null;
  const spark = hist30 ? sparklineSvg(ctx.history, now, thresholdPerAdult) : '';

  const bookUrl = bookingLink({
    origin: search.origin, destination: search.destination,
    departDate: search.depart_date, returnDate: search.return_date,
    adults: search.adults, infants: search.infants,
    baseUrl: SITE,
    trackAs: { searchId: search.id || undefined, perAdult: Math.round(now), provider: 'aviasales', surface: 'email-alert' },
  });
  const manageUrl = `${SITE}/searches`;

  const accent = isMistake ? '#b8860b' : isDrop ? '#b91c1c' : '#0e6240';
  const accentBg = isMistake ? '#fdf6e3' : isDrop ? '#fef2f2' : '#f0fdf4';
  const mono = "font-family:'JetBrains Mono',SFMono-Regular,Menlo,Consolas,monospace";
  const preheader = `${route} ${datesLine} · ${headlinePrice}`;

  const flexRows = ctx.flexDates.map(f =>
    `<tr><td style="padding:4px 0;color:#475569">${fmtDow(f.depart)} → ${fmtDow(f.return)}${nightsBetween(f.depart, f.return) ? ` · ${nightsBetween(f.depart, f.return)} nights` : ''}</td><td style="padding:4px 0;text-align:right;font-weight:700;color:#0a3a6b;${mono}">${fmtUSD(f.price)}</td></tr>`
  ).join('');

  const html = `
    <div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</div>
    <div style="font-family:Manrope,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:600px;margin:auto;padding:24px;color:#0a1426;background:#faf7ef">
      <div style="display:inline-block;background:${accentBg};color:${accent};font-weight:700;font-size:11px;letter-spacing:.12em;text-transform:uppercase;padding:4px 10px;border-radius:999px;margin-bottom:14px;${mono}">${tag}</div>

      <h1 style="font-family:Fraunces,Georgia,'Times New Roman',serif;font-weight:400;font-size:34px;line-height:1.05;letter-spacing:-.01em;color:#0a3a6b;margin:0 0 6px">${route}</h1>
      <div style="font-size:14px;color:#5b6678;margin:0 0 18px">${datesLine} · ${search.adults} adult${search.adults !== 1 ? 's' : ''}${search.infants ? ` + ${search.infants} infant${search.infants !== 1 ? 's' : ''}` : ''}</div>

      <div style="background:#fff;border:1px solid rgba(10,20,38,.10);border-left:4px solid ${accent};border-radius:12px;padding:16px 18px;margin:0 0 16px">
        <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#8a93a6;${mono}">${normal ? 'Normal price → now' : 'Now · per adult'}</div>
        <div style="margin-top:6px;line-height:1.1">
          ${normal ? `<span style="font-size:20px;color:#8a93a6;text-decoration:line-through;${mono}">${fmtUSD(normal)}</span> <span style="color:#8a93a6;font-size:18px">→</span> ` : ''}
          <span style="font-size:36px;font-weight:700;color:${accent};${mono}">${fmtUSD(now)}</span>
          ${pctBelowNormal != null && pctBelowNormal > 0 ? `<span style="display:inline-block;margin-left:8px;background:${accentBg};color:${accent};font-weight:700;font-size:13px;padding:3px 8px;border-radius:999px;${mono}">−${pctBelowNormal.toFixed(0)}%</span>` : ''}
        </div>
        <div style="color:#475569;font-size:13px;margin-top:8px">
          per adult · your target ${fmtUSD(thresholdPerAdult)}${normal ? ` · 7-day median ${fmtUSD(normal)}` : ''}<br>
          <span style="color:#0a1426;font-weight:600">${esc(lastAlertLine)}</span><br>
          party total <strong>${fmtUSD(fare.total_price_usd)}</strong> · base ${fmtUSD(fare.base_price_usd)} + taxes/fees ${fmtUSD(fare.taxes_fees_usd)}
        </div>
      </div>

      ${hist30 ? `
      <div style="background:#fff;border:1px solid rgba(10,20,38,.10);border-radius:12px;padding:14px 18px;margin:0 0 16px">
        <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#8a93a6;margin-bottom:8px;${mono}">Last 30 days · daily low per adult</div>
        ${spark}
        <div style="display:flex;justify-content:space-between;font-size:11px;letter-spacing:.06em;text-transform:uppercase;margin-top:6px;${mono}">
          <span style="color:#0e6240;font-weight:700">▼ ${fmtUSD(hist30.low)} low</span>
          <span style="color:#8a93a6">${hist30.days} polled days</span>
          <span style="color:#9a3d1f;font-weight:700">▲ ${fmtUSD(hist30.high)} high</span>
        </div>
      </div>` : ''}

      <div style="background:#fff;border:1px solid rgba(10,20,38,.10);border-radius:12px;padding:14px 18px;margin:0 0 16px">
        <div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#8a93a6;margin-bottom:6px;${mono}">Dates that work</div>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr><td style="padding:4px 0;font-weight:700;color:#0a1426">${fmtDow(search.depart_date)} → ${fmtDow(search.return_date)}${nights ? ` · ${nights} nights` : ''}${fare.outbound_flight_no ? ` · ${esc(fare.outbound_flight_no)}${fare.return_flight_no ? ` / ${esc(fare.return_flight_no)}` : ''}` : ''}</td><td style="padding:4px 0;text-align:right;font-weight:700;color:${accent};${mono}">${fmtUSD(now)}</td></tr>
          ${flexRows}
        </table>
        ${ctx.flexDates.length ? `<div style="font-size:11px;color:#8a93a6;margin-top:6px">Nearby dates from our cache priced within 5% of this fare (±3 days).</div>` : ''}
      </div>

      ${isMistake ? `
      <div style="background:#fdf6e3;border:1px solid rgba(212,175,55,.5);border-radius:12px;padding:12px 16px;margin:0 0 16px;font-size:14px;color:#7c5c10">
        <strong>✦ Book fast</strong> — fares like this get pulled within hours. Airlines and OTAs correct mistake fares quickly; if the price is still showing at checkout, lock it in and sort the details later.
      </div>` : ''}

      <p style="margin:0 0 8px">
        <a href="${bookUrl}" style="display:inline-block;background:#d4af37;color:#061a35;padding:13px 24px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px">Book this fare →</a>
      </p>
      <div style="font-size:12px;color:#8a93a6;margin:0 0 20px">Opens Aviasales with these exact dates pre-filled. No booking fee — ever.</div>

      <div style="border-top:1px solid rgba(10,20,38,.10);padding-top:14px;color:#8a93a6;font-size:12px;line-height:1.6">
        Snapshot ${fmtDateTime(fare.polled_at)} · fares move — verify at checkout.<br>
        <a href="${manageUrl}" style="color:#8a93a6;text-decoration:underline">Manage this watch</a> · <a href="${unsubLink}" style="color:#8a93a6;text-decoration:underline">Unsubscribe</a>
      </div>
    </div>
  `;

  const text = [
    `${tag.replace(/[✦📉✈️]\s*/g, '')} — ${route}`,
    datesLine,
    '',
    normal
      ? `Normal ${fmtUSD(normal)} -> now ${fmtUSD(now)} per adult${pctBelowNormal && pctBelowNormal > 0 ? ` (-${pctBelowNormal.toFixed(0)}%)` : ''}`
      : `Now ${fmtUSD(now)} per adult (target ${fmtUSD(thresholdPerAdult)})`,
    lastAlertLine.charAt(0).toUpperCase() + lastAlertLine.slice(1),
    `Party total ${fmtUSD(fare.total_price_usd)} (base ${fmtUSD(fare.base_price_usd)} + taxes/fees ${fmtUSD(fare.taxes_fees_usd)})`,
    hist30 ? `Last 30 days: low ${fmtUSD(hist30.low)} / high ${fmtUSD(hist30.high)} over ${hist30.days} polled days` : '',
    '',
    'Dates that work:',
    `  ${fmtDow(search.depart_date)} -> ${fmtDow(search.return_date)}${nights ? ` (${nights} nights)` : ''}  ${fmtUSD(now)}`,
    ...ctx.flexDates.map(f => `  ${fmtDow(f.depart)} -> ${fmtDow(f.return)}  ${fmtUSD(f.price)}`),
    '',
    isMistake ? 'BOOK FAST — fares like this get pulled within hours.\n' : '',
    `Book: ${bookUrl}`,
    '',
    `Snapshot ${fmtDateTime(fare.polled_at)}. Fares move — verify at checkout.`,
    `Manage this watch: ${manageUrl}`,
    `Unsubscribe: ${unsubLink}`,
  ].filter(l => l !== undefined).join('\n').replace(/\n{3,}/g, '\n\n');

  try {
    const result = await resend.emails.send({
      from, to: input.to, subject, html, text,
      headers: {
        // RFC 8058: one-click unsubscribe in Gmail / Apple Mail / Outlook.
        'List-Unsubscribe': `<${unsubLink}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    });
    if (result.error) return { ok: false, error: result.error.message };
    return { ok: true, id: result.data?.id ?? '' };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Operator brief — plain internal email for the AI insights agent. Owner-only
 * (no public formatting). Body is the agent's narrative; we wrap it lightly.
 */
export async function sendOperatorBrief(input: { to: string; subject: string; body: string }):
  Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY not set' };
  const resend = new Resend(apiKey);
  const from = process.env.RESEND_FROM || 'onboarding@resend.dev';
  const paragraphs = input.body.split(/\n{2,}/).map(p =>
    `<p style="margin:0 0 12px">${p.replace(/\n/g, '<br>')}</p>`).join('');
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;max-width:600px;margin:auto;padding:24px;color:#0f172a">
      <div style="display:inline-block;background:#eef2ff;color:#0a3a6b;font-weight:700;font-size:11px;letter-spacing:.12em;text-transform:uppercase;padding:4px 10px;border-radius:999px;margin-bottom:12px">FlyCheap · Ops brief</div>
      <h2 style="color:#0a3a6b;margin:0 0 16px">${input.subject}</h2>
      ${paragraphs}
      <p style="color:#94a3b8;font-size:12px;margin-top:24px">Generated by the FlyCheap insights agent. Internal only.</p>
    </div>`;
  try {
    const result = await resend.emails.send({ from, to: input.to, subject: input.subject, html });
    if (result.error) return { ok: false, error: result.error.message };
    return { ok: true, id: result.data?.id ?? '' };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export type DigestDealCard = {
  headline: string;
  blurb: string;
  route: string;        // "JFK → FCO"
  price: string;        // "$536"
  dates: string;        // "May 29 – Jun 5"
  bookUrl: string;      // /go redirect
};

/**
 * Personalized deal digest — plain-HTML (no React Email). The AI composes
 * subject/intro/cards; this renders them in the FlyCheap house style.
 */
export async function sendDigestEmail(input: {
  to: string; subject: string; preheader?: string; intro: string; outro?: string; deals: DigestDealCard[];
}): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY not set' };
  const resend = new Resend(apiKey);
  const from = process.env.RESEND_FROM || 'onboarding@resend.dev';
  const cards = input.deals.map(d => `
    <div style="border:1px solid #e2e8f0;border-radius:8px;padding:16px;margin:0 0 12px">
      <div style="font-size:13px;color:#64748b">${d.route} · ${d.dates}</div>
      <div style="font-size:18px;font-weight:700;color:#0a3a6b;margin:2px 0 6px">${d.headline} — ${d.price}</div>
      <div style="font-size:14px;color:#334155;margin-bottom:12px">${d.blurb}</div>
      <a href="${d.bookUrl}" style="display:inline-block;background:#0a3a6b;color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px">See this fare</a>
    </div>`).join('');
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;max-width:600px;margin:auto;padding:24px;color:#0f172a">
      ${input.preheader ? `<div style="display:none;max-height:0;overflow:hidden">${input.preheader}</div>` : ''}
      <div style="display:inline-block;background:#eef2ff;color:#0a3a6b;font-weight:700;font-size:11px;letter-spacing:.12em;text-transform:uppercase;padding:4px 10px;border-radius:999px;margin-bottom:12px">FlyCheap · Deal digest</div>
      <p style="font-size:15px;color:#334155;margin:0 0 16px">${input.intro}</p>
      ${cards}
      ${input.outro ? `<p style="font-size:14px;color:#475569;margin-top:16px">${input.outro}</p>` : ''}
      <p style="color:#94a3b8;font-size:12px;margin-top:24px">You're getting this because you track these routes on FlyCheap. Fares change fast — verify before booking.</p>
    </div>`;
  try {
    const result = await resend.emails.send({ from, to: input.to, subject: input.subject, html });
    if (result.error) return { ok: false, error: result.error.message };
    return { ok: true, id: result.data?.id ?? '' };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

import 'server-only';
import { Resend } from 'resend';
import { fmtUSD, fmtDate, fmtDateTime } from './utils';
import type { SearchRow, FareRow } from './db';

export type AlertEmailInput = {
  to: string;
  search: SearchRow;
  fare: FareRow;
  thresholdPerAdult: number;
  kind?: 'threshold' | 'price-drop';
  pctDrop?: number;
  median7d?: number | null;
};

export async function sendFareAlert(input: AlertEmailInput): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { ok: false, error: 'RESEND_API_KEY not set' };

  const resend = new Resend(apiKey);
  const from = process.env.RESEND_FROM || 'onboarding@resend.dev';

  const { search, fare, thresholdPerAdult, kind = 'threshold', pctDrop } = input;
  const isDrop = kind === 'price-drop';
  const tag = isDrop ? `📉 PRICE DROP${pctDrop ? ` −${pctDrop.toFixed(0)}%` : ''}` : '✈️ Cheap fare';
  const headline = isDrop ? 'Significant price drop detected' : 'Cheap fare alert';
  const subject = `${tag} — ${fmtUSD(fare.price_per_adult_usd)}/adult EgyptAir ${search.origin} → ${search.destination} ${fmtDate(search.depart_date)}`;
  const accent = isDrop ? '#b91c1c' : '#15803d';
  const accentBg = isDrop ? '#fef2f2' : '#f0fdf4';
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;max-width:600px;margin:auto;padding:24px;color:#0f172a">
      <div style="display:inline-block;background:${accentBg};color:${accent};font-weight:700;font-size:11px;letter-spacing:.12em;text-transform:uppercase;padding:4px 10px;border-radius:999px;margin-bottom:12px">${tag}</div>
      <h2 style="color:#0a3a6b;margin:0 0 16px">${headline}</h2>
      ${isDrop && pctDrop != null
        ? `<p style="margin:0 0 12px"><strong>${pctDrop.toFixed(0)}% below the 7-day median</strong> for this exact route + dates. Worth grabbing before it bounces back.</p>`
        : `<p style="margin:0 0 12px">A new low fare is available for your tracked search:</p>`}
      <table style="width:100%;border-collapse:collapse;margin:16px 0">
        <tr><td style="padding:6px 0;color:#64748b">Route</td><td style="padding:6px 0;font-weight:600">${search.origin} → ${search.destination} (nonstop, EgyptAir)</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Depart</td><td style="padding:6px 0;font-weight:600">${fmtDate(search.depart_date)}${fare.outbound_flight_no ? ` · ${fare.outbound_flight_no}` : ''}${fare.outbound_depart_iso ? ` · ${fmtDateTime(fare.outbound_depart_iso)}` : ''}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Return</td><td style="padding:6px 0;font-weight:600">${fmtDate(search.return_date)}${fare.return_flight_no ? ` · ${fare.return_flight_no}` : ''}${fare.return_depart_iso ? ` · ${fmtDateTime(fare.return_depart_iso)}` : ''}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b">Party</td><td style="padding:6px 0;font-weight:600">${search.adults} adults + ${search.infants} infant</td></tr>
      </table>
      <div style="background:${accentBg};border-left:4px solid ${accent};padding:16px;border-radius:6px;margin:16px 0">
        <div style="font-size:32px;font-weight:700;color:${accent};line-height:1">${fmtUSD(fare.price_per_adult_usd)}</div>
        <div style="color:${accent};margin-top:4px">per adult (target: ${fmtUSD(thresholdPerAdult)}${input.median7d ? ` · 7d median ${fmtUSD(input.median7d)}` : ''})</div>
        <div style="color:#475569;margin-top:8px">Total for party: <strong>${fmtUSD(fare.total_price_usd)}</strong> · Base ${fmtUSD(fare.base_price_usd)} + Taxes/fees ${fmtUSD(fare.taxes_fees_usd)}</div>
      </div>
      <p>
        <a href="https://www.egyptair.com" style="display:inline-block;background:#0a3a6b;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600">Book on egyptair.com</a>
      </p>
      <p style="color:#94a3b8;font-size:12px;margin-top:24px">
        Snapshot taken ${fmtDateTime(fare.polled_at)}. Fare may change before you book — verify on the airline site.
      </p>
    </div>
  `;

  try {
    const result = await resend.emails.send({ from, to: input.to, subject, html });
    if (result.error) return { ok: false, error: result.error.message };
    return { ok: true, id: result.data?.id ?? '' };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

import 'server-only';
import { queries } from './db';

// Travelpayouts financial pull.
//
// ACTUAL earnings (as opposed to the click × industry-EPC *estimate* shown on
// the revenue dashboard) come straight from Travelpayouts' finance API. The
// only endpoint that is currently live + reachable with our API token is:
//
//   GET https://api.travelpayouts.com/finance/v2/get_user_balance
//       header: X-Access-Token: <token>
//   → { "balance": { "usd": "0", "eur": "0", "rub": "0" } }
//
// This is the confirmed, payable balance — money that has cleared the
// 60-180 day booking→trip-completion→confirmation pipeline. We persist it to
// the `settings` table so the admin revenue dashboard can show a real number
// next to the forecast.
//
// The older per-booking statistics endpoint (/v2/statistics/partner) now
// 404s — Travelpayouts retired it. We still probe it for per-booking detail
// so that if it comes back we ingest into commission_events, but a 404 there
// is NOT a job failure: the balance pull is the source of truth.

const BALANCE_URL = 'https://api.travelpayouts.com/finance/v2/get_user_balance';

interface BalanceResponse {
  balance?: { usd?: string | number; eur?: string | number; rub?: string | number };
}

interface RawStatRow {
  date?: string;
  marker?: string;
  sub_id?: string;
  partner?: string;
  program?: string;
  bookings?: number;
  bookings_confirmed?: number;
  profit?: number;
  payment?: number;
  commission?: number;
  [k: string]: unknown;
}

export interface PullResult {
  ingested: number;
  skipped: number;
  /** Confirmed payable USD balance from Travelpayouts, or null if unreachable. */
  balanceUsd: number | null;
  error?: string;
}

export async function pullCommissions(): Promise<PullResult> {
  const token = process.env.TRAVELPAYOUTS_API_TOKEN;
  if (!token) {
    return { ingested: 0, skipped: 0, balanceUsd: null, error: 'TRAVELPAYOUTS_API_TOKEN not set' };
  }

  // -----------------------------------------------------------------------
  // 1. ACTUAL BALANCE — the working, authoritative endpoint.
  // -----------------------------------------------------------------------
  let balanceUsd: number | null = null;
  try {
    const res = await fetch(BALANCE_URL, {
      cache: 'no-store',
      headers: { 'X-Access-Token': token },
    });
    if (res.ok) {
      const body = (await res.json().catch(() => null)) as BalanceResponse | null;
      const usd = body?.balance?.usd;
      const n = typeof usd === 'number' ? usd : typeof usd === 'string' ? parseFloat(usd) : NaN;
      if (Number.isFinite(n)) {
        balanceUsd = n;
        queries.setSetting('tp_balance_usd', String(n));
        queries.setSetting('tp_balance_updated_at', new Date().toISOString());
        queries.setSetting('tp_balance_error', '');
      }
    } else {
      // Don't hard-fail — record the error but keep going.
      queries.setSetting('tp_balance_error', `HTTP ${res.status} @ ${new Date().toISOString()}`);
    }
  } catch (e) {
    queries.setSetting('tp_balance_error', `network: ${(e as Error).message} @ ${new Date().toISOString()}`);
  }

  // -----------------------------------------------------------------------
  // 2. PER-BOOKING DETAIL — best-effort. Travelpayouts retired the old
  //    /v2/statistics/partner endpoint; probe it and ingest whatever
  //    responds. A 404 here is expected and NOT an error.
  // -----------------------------------------------------------------------
  let ingested = 0;
  let skipped = 0;
  const to = new Date();
  const from = new Date(); from.setUTCDate(from.getUTCDate() - 90);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  const statsCandidates = [
    `https://api.travelpayouts.com/v2/statistics/partner?date_from=${fmt(from)}&date_to=${fmt(to)}`,
  ];
  for (const url of statsCandidates) {
    try {
      const res = await fetch(url, { cache: 'no-store', headers: { 'X-Access-Token': token } });
      if (!res.ok) continue; // 404 = endpoint retired; just move on
      const body = (await res.json().catch(() => null)) as { data?: RawStatRow[] } | RawStatRow[] | null;
      const rows: RawStatRow[] = Array.isArray(body) ? body : (body?.data ?? []);
      for (const r of rows) {
        const amount = typeof r.profit === 'number' ? r.profit
                    : typeof r.payment === 'number' ? r.payment
                    : typeof r.commission === 'number' ? r.commission
                    : 0;
        if (amount <= 0) { skipped++; continue; }
        const partner = r.partner ?? r.program ?? 'travelpayouts';
        queries.insertCommission({
          click_token: typeof r.sub_id === 'string' ? r.sub_id : null,
          partner,
          amount_usd: amount,
          booking_id: typeof r.date === 'string' && typeof r.sub_id === 'string' ? `${r.date}.${r.sub_id}` : null,
          raw_json: r,
        });
        ingested++;
      }
      break; // first endpoint that responds wins
    } catch {
      // network blip — try next candidate
    }
  }

  return { ingested, skipped, balanceUsd };
}

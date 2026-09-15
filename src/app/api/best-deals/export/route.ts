import { NextRequest } from 'next/server';
import { getCachedBestDeals } from '@/lib/bestDeals';
import { queries } from '@/lib/db';

export const dynamic = 'force-dynamic';

const DOW_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function csvEscape(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const origin     = url.searchParams.get('origin') ?? 'all';
  const outbound   = url.searchParams.get('outbound') ?? 'all';
  const ret        = url.searchParams.get('return_') ?? 'all';
  const stops      = url.searchParams.get('stops') ?? 'all';
  const above      = url.searchParams.get('above') === 'yes';
  const tripMin    = Number(url.searchParams.get('tripMin')) || null;
  const tripMax    = Number(url.searchParams.get('tripMax')) || null;

  const maxDisplay = parseFloat(queries.getSetting('max_display_per_adult_usd') ?? '1200');
  const threshold  = parseFloat(queries.getSetting('alert_threshold_per_adult_usd') ?? '900');

  const { deals: all } = getCachedBestDeals(500);
  const filtered = all.filter(d => {
    if (!above && d.per_adult_usd > maxDisplay) return false;
    if (origin !== 'all' && d.origin !== origin) return false;
    if (outbound !== 'all' && d.outbound_date.slice(0, 7) !== outbound) return false;
    if (ret !== 'all' && d.return_date.slice(0, 7) !== ret) return false;
    if (stops === 'nonstop'  && Math.max(d.outbound_transfers, d.return_transfers) !== 0) return false;
    if (stops === 'one-stop' && Math.max(d.outbound_transfers, d.return_transfers) !== 1) return false;
    if (tripMin && d.trip_length_days < tripMin) return false;
    if (tripMax && d.trip_length_days > tripMax) return false;
    return true;
  });

  const headers = [
    'rank','origin','destination','outbound_date','outbound_dow','outbound_local_hour',
    'return_date','return_dow','return_local_hour','trip_days',
    'outbound_flight','return_flight','outbound_stops','return_stops',
    'per_adult_usd','party_total_usd','threshold_usd','vs_threshold_usd',
  ];
  const lines = [headers.join(',')];
  filtered.forEach((d, i) => {
    lines.push([
      i + 1, d.origin, 'CAI',
      d.outbound_date, DOW_NAMES[d.outbound_dow], d.outbound_hour,
      d.return_date,   DOW_NAMES[d.return_dow],   d.return_hour,
      d.trip_length_days,
      d.outbound_flight_no, d.return_flight_no,
      d.outbound_transfers, d.return_transfers,
      d.per_adult_usd.toFixed(2), d.party_total_usd.toFixed(2),
      threshold.toFixed(2), (d.per_adult_usd - threshold).toFixed(2),
    ].map(csvEscape).join(','));
  });

  const csv = lines.join('\n');
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="egyptair-deals-${stamp}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}

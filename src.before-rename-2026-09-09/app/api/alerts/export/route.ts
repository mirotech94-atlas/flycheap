import { queries } from '@/lib/db';

export const dynamic = 'force-dynamic';

function csvEscape(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET() {
  const rows = queries.recentAlerts(500);
  const headers = ['sent_at','search_id','origin','destination','depart_date','return_date','price_per_adult_usd'];
  const lines = [headers.join(',')];
  for (const r of rows) {
    lines.push([
      r.sent_at, r.search_id, r.origin, r.destination,
      r.depart_date, r.return_date, r.price_per_adult_usd.toFixed(2),
    ].map(csvEscape).join(','));
  }
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(lines.join('\n'), {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="egyptair-alerts-${stamp}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}

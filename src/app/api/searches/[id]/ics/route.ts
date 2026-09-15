import { NextResponse } from 'next/server';
import { queries } from '@/lib/db';
import { getCurrentUser, isAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// CRLF per RFC 5545, then "ICS escape" commas/semicolons/newlines.
function escape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}
function fmtIcsDate(iso: string): string {
  // 2026-07-07 → 20260707
  return iso.slice(0, 10).replace(/-/g, '');
}
function fmtIcsDateTimeUtc(iso: string): string {
  // 2026-07-07T19:00:00Z → 20260707T190000Z
  const d = new Date(iso);
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const numId = parseInt(id, 10);
  if (!Number.isFinite(numId)) return NextResponse.json({ error: 'bad id' }, { status: 400 });

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const search = queries.getSearch(numId);
  if (!search) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (search.user_id !== user.id && !isAdmin(user)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }

  const fare = queries.latestFare(numId);
  const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const stamp = `flycheap-${numId}-${Date.now()}@flycheap.18dn.com`;
  const partyTotal = fare ? `Party total $${Math.round(fare.total_price_usd)} (${search.adults}A + ${search.infants}I)` : '';
  const perAdult = fare ? `$${Math.round(fare.price_per_adult_usd)}/adult` : 'no fare polled yet';
  const fno = [fare?.outbound_flight_no, fare?.return_flight_no].filter(Boolean).join(' / ');

  const events: string[] = [];

  // Outbound — all-day event on depart_date OR timed event if we have the ISO.
  const outIso = fare?.outbound_depart_iso;
  if (outIso) {
    events.push([
      'BEGIN:VEVENT',
      `UID:out-${stamp}`,
      `DTSTAMP:${now}`,
      `DTSTART:${fmtIcsDateTimeUtc(outIso)}`,
      // Estimated duration: 10h for transatlantic; the user re-verifies on book
      `DTEND:${fmtIcsDateTimeUtc(new Date(new Date(outIso).getTime() + 10 * 3600_000).toISOString())}`,
      `SUMMARY:${escape(`✈ ${search.origin} → ${search.destination}${fno ? ' · ' + fno.split(' / ')[0] : ''}`)}`,
      `DESCRIPTION:${escape(`${perAdult}. ${partyTotal}. Tracked by FlyCheap. Verify on the airline site before relying on times.`)}`,
      `LOCATION:${escape(search.origin + ' airport')}`,
      'END:VEVENT',
    ].join('\r\n'));
  } else {
    events.push([
      'BEGIN:VEVENT',
      `UID:out-${stamp}`,
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${fmtIcsDate(search.depart_date)}`,
      `SUMMARY:${escape(`✈ Depart ${search.origin} → ${search.destination}`)}`,
      `DESCRIPTION:${escape(`${perAdult}. ${partyTotal}. Time TBD — set when you book.`)}`,
      'END:VEVENT',
    ].join('\r\n'));
  }

  // Return
  const retIso = fare?.return_depart_iso;
  if (retIso) {
    events.push([
      'BEGIN:VEVENT',
      `UID:ret-${stamp}`,
      `DTSTAMP:${now}`,
      `DTSTART:${fmtIcsDateTimeUtc(retIso)}`,
      `DTEND:${fmtIcsDateTimeUtc(new Date(new Date(retIso).getTime() + 10 * 3600_000).toISOString())}`,
      `SUMMARY:${escape(`✈ ${search.destination} → ${search.origin}${fno ? ' · ' + fno.split(' / ')[1] : ''}`)}`,
      `DESCRIPTION:${escape(`${perAdult}. Return leg.`)}`,
      `LOCATION:${escape(search.destination + ' airport')}`,
      'END:VEVENT',
    ].join('\r\n'));
  } else {
    events.push([
      'BEGIN:VEVENT',
      `UID:ret-${stamp}`,
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${fmtIcsDate(search.return_date)}`,
      `SUMMARY:${escape(`✈ Return ${search.destination} → ${search.origin}`)}`,
      `DESCRIPTION:${escape(`${perAdult}. Time TBD — set when you book.`)}`,
      'END:VEVENT',
    ].join('\r\n'));
  }

  // 24h price-watch reminder — fire the day before the cheapest fare's depart.
  const departISO = (search.depart_date as string).slice(0, 10);
  const reminderDate = new Date(new Date(departISO).getTime() - 24 * 3600_000)
    .toISOString().slice(0, 10).replace(/-/g, '');
  events.push([
    'BEGIN:VEVENT',
    `UID:reminder-${stamp}`,
    `DTSTAMP:${now}`,
    `DTSTART;VALUE=DATE:${reminderDate}`,
    `SUMMARY:${escape('🔔 FlyCheap — verify fare before tomorrow')}`,
    `DESCRIPTION:${escape(`Last tracked fare: ${perAdult}. Re-check on the airline site.`)}`,
    'END:VEVENT',
  ].join('\r\n'));

  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//FlyCheap//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...events,
    'END:VCALENDAR',
  ].join('\r\n') + '\r\n';

  return new NextResponse(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="cheapflight-${search.origin}-${search.destination}-${search.depart_date}.ics"`,
      'Cache-Control': 'no-store',
    },
  });
}

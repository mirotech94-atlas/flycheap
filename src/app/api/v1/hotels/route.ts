import { NextResponse } from 'next/server';
import { z } from 'zod';
import { apiAuthBearer } from '@/lib/mobileAuth';
import { getHotelsForDestination, HOTEL_CITY_CENTERS } from '@/lib/hotelMockData';
import { queries } from '@/lib/db';

export const dynamic = 'force-dynamic';

const Query = z.object({
  destination: z.string().optional(),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  adults: z.coerce.number().int().min(1).max(9).optional(),
});

function baseFromReq(req: Request): string {
  const proto = req.headers.get('x-forwarded-proto') ?? 'https';
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'flycheap.live';
  return `${proto}://${host}`;
}
function todayPlus(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * GET /api/v1/hotels — native Hotels screen data for the signed-in user.
 * Returns the destination list (cities we have hotel data for, the user's tracked ones first),
 * and the hotels for the chosen destination. Each hotel carries a ready booking link that goes
 * through /go so the affiliate marker is injected server-side (never built on the client).
 */
export async function GET(req: Request) {
  const user = await apiAuthBearer(req);
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const parsed = Query.safeParse(Object.fromEntries(new URL(req.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: 'bad params' }, { status: 400 });

  // Destinations we can actually show hotels for, with the user's tracked destinations surfaced first.
  const tracked = new Set(queries.listSearchesForUser(user.id).map((s) => s.destination.toUpperCase()));
  const all = Object.entries(HOTEL_CITY_CENTERS).map(([code, c]) => ({ code, label: c.label, tracked: tracked.has(code) }));
  all.sort((a, b) => (a.tracked === b.tracked ? a.label.localeCompare(b.label) : a.tracked ? -1 : 1));

  const destination = (parsed.data.destination ?? all.find((d) => d.tracked)?.code ?? all[0]?.code ?? 'CAI').toUpperCase();
  const checkIn = parsed.data.checkIn ?? todayPlus(60);
  const checkOut = parsed.data.checkOut ?? todayPlus(67);
  const adults = parsed.data.adults ?? 2;
  const baseUrl = baseFromReq(req);
  const cityLabel = HOTEL_CITY_CENTERS[destination]?.label ?? destination;

  const hotels = getHotelsForDestination(destination, 24).map((h) => {
    const dest = new URL('https://search.hotellook.com/');
    dest.searchParams.set('destination', h.area || cityLabel);
    dest.searchParams.set('checkIn', checkIn);
    dest.searchParams.set('checkOut', checkOut);
    dest.searchParams.set('adults', String(adults));
    const bookUrl = `${baseUrl}/go?${new URLSearchParams({ to: dest.toString(), provider: 'hotellook', surface: 'hotels-mobile' }).toString()}`;
    return {
      id: h.id,
      name: h.name,
      area: h.area,
      stars: h.stars,
      rating: h.rating,
      reviewCount: h.reviewCount,
      pricePerNight: h.price,
      distanceKm: h.distanceKm,
      tagline: h.tagline,
      amenities: h.amenities.slice(0, 4),
      bookUrl,
    };
  });

  return NextResponse.json({
    destinations: all.map(({ code, label }) => ({ code, label })),
    destination,
    cityLabel,
    checkIn,
    checkOut,
    adults,
    hotels,
  });
}

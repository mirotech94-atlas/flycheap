import { NextResponse } from 'next/server';
import { apiAuthBearer } from '@/lib/mobileAuth';
import { queries } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/alerts — the signed-in user's recent price-drop alerts (their routes only).
 * Powers the in-app alerts feed. Alerts for deleted routes naturally drop out (inner join).
 */
export async function GET(req: Request) {
  const user = await apiAuthBearer(req);
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const alerts = queries.alertsForUser(user.id, 50).map((a) => ({
    id: a.id,
    origin: a.origin,
    destination: a.destination,
    depart_date: a.depart_date,
    return_date: a.return_date,
    perAdultUsd: a.price_per_adult_usd,
    kind: a.kind,
    sentAt: a.sent_at,
  }));
  return NextResponse.json({ alerts });
}

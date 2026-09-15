import { NextResponse } from 'next/server';
import { apiAuthBearer } from '@/lib/mobileAuth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/me
 * Bearer-authed identity check — the smallest endpoint that proves the mobile
 * auth loop (verify → store token → authed request) end-to-end.
 */
export async function GET(req: Request) {
  const user = await apiAuthBearer(req);
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  return NextResponse.json({
    user: { id: user.id, email: user.email, name: user.name, tier: user.tier },
  });
}

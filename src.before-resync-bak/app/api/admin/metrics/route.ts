import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { queries } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Admin-only metrics endpoint. Authorized via either:
//   1. ADMIN_EMAILS env var (comma-separated allow-list of emails), or
//   2. Falling back to user.id === 1 (the seeded Owner)
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const allowList = (process.env.ADMIN_EMAILS ?? '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const isAdmin = user.id === 1 || allowList.includes(user.email.toLowerCase());
  if (!isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  return NextResponse.json({ ok: true, metrics: queries.adminMetrics() });
}

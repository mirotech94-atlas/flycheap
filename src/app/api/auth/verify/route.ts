import { NextRequest, NextResponse } from 'next/server';
import { consumeMagicLinkAndStartSession } from '@/lib/auth';
import { publicUrl } from '@/lib/publicUrl';

export const dynamic = 'force-dynamic';

function clientIp(req: NextRequest): string | null {
  const fwd = req.headers.get('x-forwarded-for') ?? '';
  const first = fwd.split(',')[0]?.trim();
  return first || req.headers.get('x-real-ip') || null;
}

export async function GET(req: NextRequest) {
  const token = new URL(req.url).searchParams.get('token');
  if (!token) return NextResponse.redirect(publicUrl(req, '/login?error=missing'));
  const user = await consumeMagicLinkAndStartSession(token, { ip: clientIp(req) });
  if (!user) return NextResponse.redirect(publicUrl(req, '/login?error=invalid'));
  return NextResponse.redirect(publicUrl(req, '/'));
}

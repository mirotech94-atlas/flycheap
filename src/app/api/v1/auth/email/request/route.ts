import { NextResponse } from 'next/server';
import { z } from 'zod';
import crypto from 'node:crypto';
import { sendEmailCode } from '@/lib/auth';
import { queries } from '@/lib/db';

export const dynamic = 'force-dynamic';

const Body = z.object({ email: z.string().email() });

function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for') ?? '';
  return fwd.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
}

/**
 * POST /api/v1/auth/email/request  { email }
 * First-sign-in / authenticator-recovery: emails a 6-digit code (typed in-app — no link).
 * Enumeration-safe: always returns { ok: true } regardless of whether the email exists or
 * the rate limit tripped, so the response never reveals account existence.
 */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'Valid email required.' }, { status: 400 });

  const email = parsed.data.email.trim().toLowerCase();
  const ip = clientIp(req);
  // Per-email: 3 / 10 min. Per-IP: 20 / hour. Tripping the limit still returns ok.
  const emailOk = queries.rateLimitCheck('emailcode_email', email, 3, 600);
  const ipOk = queries.rateLimitCheck('emailcode_ip', ip, 20, 3600);
  if (emailOk && ipOk) {
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
    queries.insertEmailCode(email, code, 10);
    // Don't block the (uniform) response on SMTP; deliver in the background.
    sendEmailCode(email, code).catch(() => { /* logged by Resend */ });
  }
  return NextResponse.json({ ok: true });
}

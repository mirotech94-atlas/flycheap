import { NextResponse } from 'next/server';
import { checkDeviceToken, startSession } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Trusted-device login — skip OTP for returning users on a recognized browser.
 * The device cookie (fareintel_device) is set after every successful OTP verification.
 * If valid → create a full session and return { ok: true }.
 * If missing or expired → return { ok: false } so the client falls through to OTP.
 */
export async function POST() {
  const user = await checkDeviceToken();
  if (!user) return NextResponse.json({ ok: false });

  await startSession(user.id);
  return NextResponse.json({ ok: true, username: user.username ?? null });
}

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createProCheckoutSession, isStripeConfigured } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL('/login?next=/settings', req.url));

  if (!isStripeConfigured()) {
    return NextResponse.redirect(new URL('/settings?billing=stripe-not-configured', req.url));
  }

  const proto = req.headers.get('x-forwarded-proto') ?? 'https';
  const host  = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'tracker.18dn.com';
  const baseUrl = `${proto}://${host}`;

  const r = await createProCheckoutSession({
    userId: user.id,
    email: user.email,
    customerId: user.stripe_customer_id,
    successUrl: `${baseUrl}/settings?billing=success`,
    cancelUrl:  `${baseUrl}/settings?billing=canceled`,
  });
  if (!r.ok) return NextResponse.redirect(new URL(`/settings?billing=error&msg=${encodeURIComponent(r.error)}`, req.url));
  return NextResponse.redirect(r.url, 303);
}

export async function POST(req: NextRequest) {
  return GET(req);
}

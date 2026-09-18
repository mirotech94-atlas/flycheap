import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createProCheckoutSession, isStripeConfigured } from '@/lib/stripe';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // req.url is the internal localhost origin behind Caddy — always build
  // redirects from the forwarded host.
  const proto = req.headers.get('x-forwarded-proto') ?? 'https';
  const host  = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'flycheap.live';
  const baseUrl = `${proto}://${host}`;

  const user = await getCurrentUser();
  if (!user) {
    // Send them back into this exact checkout after they sign in/up.
    const next = encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(`${baseUrl}/login?next=${next}`);
  }

  if (!isStripeConfigured()) {
    return NextResponse.redirect(`${baseUrl}/settings?billing=stripe-not-configured`);
  }

  const rawPlan = req.nextUrl.searchParams.get('plan');
  const plan: 'pro' | 'enterprise' = rawPlan === 'enterprise' ? 'enterprise' : 'pro';

  const r = await createProCheckoutSession({
    userId: user.id,
    email: user.email,
    customerId: user.stripe_customer_id,
    successUrl: `${baseUrl}/settings?billing=success`,
    cancelUrl:  `${baseUrl}/settings?billing=canceled`,
    plan,
  });
  if (!r.ok) return NextResponse.redirect(`${baseUrl}/settings?billing=error&msg=${encodeURIComponent(r.error)}`);
  return NextResponse.redirect(r.url, 303);
}

export async function POST(req: NextRequest) {
  return GET(req);
}

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createSubscription, isPaypalConfigured, type PlanKey, type BillingPeriod } from '@/lib/paypal';

export const dynamic = 'force-dynamic';

function pickPlan(s: string | null): PlanKey {
  return s === 'enterprise' ? 'enterprise' : 'pro';
}
function pickPeriod(s: string | null): BillingPeriod {
  return s === 'year' ? 'year' : 'month';
}

async function start(req: NextRequest, plan: PlanKey, period: BillingPeriod) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL('/login?next=/pricing', req.url));
  if (!isPaypalConfigured()) {
    return NextResponse.redirect(new URL('/pricing?billing=paypal-not-configured', req.url));
  }

  const proto = req.headers.get('x-forwarded-proto') ?? 'https';
  const host  = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'flycheap.18dn.com';
  const baseUrl = `${proto}://${host}`;

  const r = await createSubscription({
    plan, period,
    userId: user.id,
    email: user.email,
    returnUrl: `${baseUrl}/api/billing/paypal/return?plan=${plan}&period=${period}`,
    cancelUrl: `${baseUrl}/pricing?billing=canceled`,
  });
  if (!r.ok) {
    return NextResponse.redirect(new URL(`/pricing?billing=error&msg=${encodeURIComponent(r.error)}`, req.url));
  }
  return NextResponse.redirect(r.approveUrl, 303);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const r = await start(req, pickPlan(searchParams.get('plan')), pickPeriod(searchParams.get('period')));
  r.headers.set('Cache-Control', 'no-store, no-cache');
  return r;
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  return start(req, pickPlan(searchParams.get('plan')), pickPeriod(searchParams.get('period')));
}

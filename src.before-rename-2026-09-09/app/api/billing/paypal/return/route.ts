import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { getSubscription, type PlanKey, type BillingPeriod } from '@/lib/paypal';
import { queries } from '@/lib/db';

export const dynamic = 'force-dynamic';

// PayPal redirects users back here after they approve the subscription. Query
// params include `subscription_id` (PayPal-assigned). We confirm activation
// and bump the user's tier optimistically; the authoritative state lands via
// the webhook (BILLING.SUBSCRIPTION.ACTIVATED etc.).

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL('/login?next=/settings', req.url));

  const { searchParams } = new URL(req.url);
  const subId = searchParams.get('subscription_id');
  const plan = (searchParams.get('plan') === 'enterprise' ? 'enterprise' : 'pro') as PlanKey;
  const period = (searchParams.get('period') === 'year' ? 'year' : 'month') as BillingPeriod;
  if (!subId) {
    return NextResponse.redirect(new URL('/pricing?billing=error&msg=missing-subscription-id', req.url));
  }

  const sub = await getSubscription(subId);
  // PayPal returns ACTIVE | APPROVED | APPROVAL_PENDING | CANCELLED | ...
  // ACTIVE means recurring billing has started. APPROVED means the user
  // signed but the first cycle hasn't fired yet — both are good states for
  // granting access; the webhook will tidy up if anything later goes wrong.
  const ok = sub && (sub.status === 'ACTIVE' || sub.status === 'APPROVED');
  if (!ok) {
    return NextResponse.redirect(new URL(`/pricing?billing=error&msg=paypal-${sub?.status || 'unknown'}`, req.url));
  }

  // Custom_id was set to the user id at create time; sanity-check it matches
  // the signed-in user so a tampered URL can't upgrade someone else.
  if (sub.custom_id && Number(sub.custom_id) !== user.id) {
    return NextResponse.redirect(new URL('/pricing?billing=error&msg=user-mismatch', req.url));
  }

  queries.setUserPaypal(user.id, subId);
  queries.setUserTier(user.id, plan, sub.status === 'ACTIVE' ? 'active' : 'trialing',
    sub.billing_info?.next_billing_time ?? null);
  queries.setSubscriptionMeta(user.id, {
    provider: 'paypal',
    period,
    trialEndsAt: sub.billing_info?.next_billing_time ?? null,
  });

  return NextResponse.redirect(new URL(`/settings?billing=success&plan=${plan}&period=${period}&provider=paypal`, req.url));
}

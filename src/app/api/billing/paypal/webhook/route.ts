import { NextRequest, NextResponse } from 'next/server';
import { verifyWebhook, planFromPaypalPlanId, getSubscription } from '@/lib/paypal';
import { getDb, queries } from '@/lib/db';
import { notifyBillingToSlack } from '@/lib/notifier';

export const dynamic = 'force-dynamic';

// PayPal webhook endpoint. Configure in your PayPal app:
//   https://flycheap.live/api/billing/paypal/webhook
// Subscribe to events: BILLING.SUBSCRIPTION.ACTIVATED, .CANCELLED, .SUSPENDED,
// .PAYMENT.FAILED, PAYMENT.SALE.COMPLETED. Then put the webhook ID into
// PAYPAL_WEBHOOK_ID env.

type PaypalEvent = {
  id: string;
  event_type: string;
  resource: any;
};

const PAID_STATUSES = new Set(['ACTIVE', 'APPROVED']);

/**
 * Resolve the account behind a PayPal subscription when the event carries no
 * custom_id. Subscriptions opened through our own flow set custom_id to the
 * user id, but PayPal drops it on some resource shapes — and a cancellation we
 * cannot attribute would silently leave the account on a paid tier.
 */
function findUserIdByPaypalSub(subId: string | undefined): number | null {
  if (!subId) return null;
  const row = getDb()
    .prepare('SELECT id FROM users WHERE paypal_subscription_id = ? LIMIT 1')
    .get(subId) as { id: number } | undefined;
  return row?.id ?? null;
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!(await verifyWebhook(req.headers, raw))) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 400 });
  }
  const event = JSON.parse(raw) as PaypalEvent;

  if (!queries.recordWebhookEvent(event.id, 'paypal')) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  // PayPal resources sometimes embed the subscription id at the top level,
  // sometimes nested. Resolve once.
  const subId: string | undefined =
    event.resource?.id ??
    event.resource?.billing_agreement_id ??
    event.resource?.subscription_id;
  const customId: string | undefined =
    event.resource?.custom_id ??
    event.resource?.subscriber?.custom_id;
  const userId = Number(customId) || findUserIdByPaypalSub(subId) || NaN;

  switch (event.event_type) {
    case 'BILLING.SUBSCRIPTION.ACTIVATED':
    case 'BILLING.SUBSCRIPTION.UPDATED': {
      if (!subId || !Number.isFinite(userId)) break;
      // Refresh from PayPal to know status + plan_id authoritatively.
      const sub = await getSubscription(subId);
      const status = sub?.status ?? 'UNKNOWN';
      const planId = sub?.plan_id;
      const map = planId ? planFromPaypalPlanId(planId) : null;
      if (PAID_STATUSES.has(status) && map) {
        // The return route usually posts first (and sets a paid tier); only
        // post here when the webhook is the first to see the subscription.
        const wasFree = (queries.getUserById(userId)?.tier ?? 'free') === 'free';
        queries.setUserPaypal(userId, subId);
        queries.setUserTier(userId, map.plan, status === 'ACTIVE' ? 'active' : 'trialing',
          sub?.billing_info?.next_billing_time ?? null);
        if (wasFree) void notifyBillingToSlack('subscription_started', userId, {
          provider: 'paypal', plan: map.plan, period: map.period, source: `PayPal ${event.event_type}`,
        });
        queries.setSubscriptionMeta(userId, {
          provider: 'paypal',
          period: map.period,
          trialEndsAt: sub?.billing_info?.next_billing_time ?? null,
        });
      }
      break;
    }
    case 'BILLING.SUBSCRIPTION.CANCELLED':
    case 'BILLING.SUBSCRIPTION.EXPIRED': {
      if (!Number.isFinite(userId)) break;
      const wasPaid = (queries.getUserById(userId)?.tier ?? 'free') !== 'free';
      queries.setUserTier(userId, 'free', 'canceled', null);
      queries.setSubscriptionMeta(userId, { provider: null, period: null });
      queries.setUserPaypal(userId, null);
      if (wasPaid) void notifyBillingToSlack('cancelled', userId, { provider: 'paypal', source: `PayPal ${event.event_type}` });
      break;
    }
    case 'BILLING.SUBSCRIPTION.SUSPENDED':
    case 'BILLING.SUBSCRIPTION.PAYMENT.FAILED':
      // Grace period — don't downgrade immediately. Log for visibility; the
      // user keeps access until ACTIVATED returns or CANCELLED arrives.
      console.warn('[paypal] subscription issue', event.event_type, event.id);
      if (Number.isFinite(userId)) void notifyBillingToSlack('payment_failed', userId, {
        provider: 'paypal', source: `PayPal ${event.event_type}`,
      });
      break;
    case 'PAYMENT.SALE.COMPLETED':
      // Renewal succeeded — refresh renews_at via subscription fetch.
      if (subId && Number.isFinite(userId)) {
        const sub = await getSubscription(subId);
        const next = sub?.billing_info?.next_billing_time;
        if (next) {
          queries.setUserTier(userId, (queries.getUserById(userId)?.tier) ?? 'pro', 'active', next);
        }
        const amt = event.resource?.amount?.total ?? event.resource?.amount?.value;
        const cur = event.resource?.amount?.currency ?? event.resource?.amount?.currency_code;
        void notifyBillingToSlack('payment_received', userId, {
          provider: 'paypal', amount: amt ? `$${amt} ${cur ?? 'USD'}` : null,
          when: next ? `next ${String(next).slice(0, 10)}` : null, source: 'PayPal sale completed',
        });
      }
      break;
    default:
      break;
  }

  return NextResponse.json({ received: true });
}

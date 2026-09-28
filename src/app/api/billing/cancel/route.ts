import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { queries } from '@/lib/db';
import { notifyBillingToSlack } from '@/lib/notifier';

export const dynamic = 'force-dynamic';

// POST /api/billing/cancel
// Cancels the user's subscription AT THE END OF THE PAID PERIOD. The tier is
// kept until then; subscription_status becomes 'cancel_at_period_end' and
// subscription_renews_at holds the date access ends. Idempotent — a second
// call on an already-scheduled or never-subscribed user is a no-op.
//
// Provider routing:
//   - Stripe   → POST /v1/subscriptions/{id}  cancel_at_period_end=true
//                Stripe then fires customer.subscription.deleted at period
//                end, which the webhook turns into the Free downgrade.
//   - PayPal   → POST /v1/billing/subscriptions/{id}/cancel — immediate on
//                PayPal's side (no further charges); locally we keep the tier
//                and the poll sweep (pollAll → dueScheduledCancellations)
//                downgrades when the already-paid period ends.
//
// Two cases fall back to an IMMEDIATE local downgrade, because promising
// access to an unknown date is worse than ending it now: we do not know the
// period end, or the provider refused to schedule the cancellation (in which
// case leaving the tier up could mean another charge — the Slack notice
// carries the error so it can be fixed at the provider).

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  if (user.subscription_status === 'cancel_at_period_end') {
    return NextResponse.json({ ok: true, tier: user.tier, endsAt: user.subscription_renews_at, note: 'already scheduled' });
  }

  const provider = user.subscription_provider ?? null;
  const stripeSubId = user.stripe_subscription_id;
  const paypalSubId = user.paypal_subscription_id ?? null;
  const endsAt = user.subscription_renews_at ?? null;

  const results: Record<string, unknown> = {};
  let scheduled = false;

  if (provider === 'stripe' && stripeSubId) {
    try {
      const sk = process.env.STRIPE_SECRET_KEY ?? '';
      const r = await fetch(`https://api.stripe.com/v1/subscriptions/${stripeSubId}`, {
        signal: AbortSignal.timeout(15_000),
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + Buffer.from(sk + ':').toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'cancel_at_period_end=true',
      });
      const j = await r.json().catch(() => ({}));
      scheduled = r.ok && j.cancel_at_period_end === true;
      results.stripe = r.ok ? { ok: true, status: j.status, cancelAtPeriodEnd: j.cancel_at_period_end } : { ok: false, error: j.error?.message };
    } catch (e) {
      results.stripe = { ok: false, error: (e as Error).message };
    }
  } else if (provider === 'paypal' && paypalSubId) {
    try {
      const env = (process.env.PAYPAL_ENV ?? 'live') === 'sandbox'
        ? 'https://api-m.sandbox.paypal.com'
        : 'https://api-m.paypal.com';
      const cid = process.env.PAYPAL_CLIENT_ID;
      const sec = process.env.PAYPAL_CLIENT_SECRET;
      if (cid && sec) {
        const auth = Buffer.from(`${cid}:${sec}`).toString('base64');
        const tok = await fetch(`${env}/v1/oauth2/token`, {
          signal: AbortSignal.timeout(15_000),
          method: 'POST',
          headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'grant_type=client_credentials',
        }).then(r => r.json()).then(j => j.access_token);
        const r = await fetch(`${env}/v1/billing/subscriptions/${paypalSubId}/cancel`, {
          signal: AbortSignal.timeout(15_000),
          method: 'POST',
          headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: 'User requested cancellation from the Pricing page.' }),
        });
        // 204 = cancelled; 422 with an already-cancelled status is fine too.
        scheduled = r.ok;
        results.paypal = r.ok ? { ok: true } : { ok: false, status: r.status };
      } else {
        results.paypal = { ok: false, error: 'PayPal not configured' };
      }
    } catch (e) {
      results.paypal = { ok: false, error: (e as Error).message };
    }
  } else {
    results.note = 'no active subscription';
  }

  const wasPaid = user.tier !== 'free';
  const source = 'user · Pricing → Downgrade to Free';

  if (wasPaid && scheduled && endsAt && Date.parse(endsAt.replace(' ', 'T')) > Date.now()) {
    // Keep the tier, mark the end date. The webhook (Stripe) or the poll
    // sweep (both) finishes the job when the period runs out.
    queries.setUserTier(user.id, user.tier, 'cancel_at_period_end', endsAt);
    void notifyBillingToSlack('cancelled', user, {
      provider: provider ?? 'none', plan: user.tier, when: `access ends ${endsAt.slice(0, 10)}`, source,
    });
    return NextResponse.json({ ok: true, tier: user.tier, endsAt, providerResult: results });
  }

  // Fallback: immediate. Either nothing was subscribed, we could not schedule
  // at the provider, or we do not know when the paid period ends.
  queries.setUserTier(user.id, 'free', 'canceled', null);
  queries.setSubscriptionMeta(user.id, { provider: null, period: null });
  queries.setUserStripe(user.id, '', null);
  queries.setUserPaypal(user.id, null);
  if (wasPaid) void notifyBillingToSlack('cancelled', user, {
    provider: provider ?? 'none', plan: user.tier,
    when: scheduled ? 'immediately (period end unknown)' : `immediately (provider call failed: ${JSON.stringify(results)})`,
    source,
  });
  return NextResponse.json({ ok: true, tier: 'free', endsAt: null, providerResult: results });
}

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { queries } from '@/lib/db';

export const dynamic = 'force-dynamic';

// POST /api/billing/cancel
// Cancels the user's active subscription IMMEDIATELY (not at period end),
// drops their tier to Free, and clears subscription metadata. Idempotent —
// safe to call on already-cancelled / never-subscribed users (no-op).
//
// Provider routing:
//   - Stripe   → DELETE /v1/subscriptions/{id}
//   - PayPal   → POST   /v1/billing/subscriptions/{id}/cancel
// On provider-side failure we still flip the local tier to free — better
// to over-revoke than to keep a customer paying for access they think
// they've cancelled. Provider webhooks will reconcile later if needed.

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  const provider = (user as any).subscription_provider as 'stripe' | 'paypal' | null;
  const stripeSubId = (user as any).stripe_subscription_id as string | null;
  const paypalSubId = (user as any).paypal_subscription_id as string | null;

  const results: Record<string, unknown> = {};

  if (provider === 'stripe' && stripeSubId) {
    try {
      const sk = process.env.STRIPE_SECRET_KEY ?? '';
      const r = await fetch(`https://api.stripe.com/v1/subscriptions/${stripeSubId}`, {
        method: 'DELETE',
        headers: { Authorization: 'Basic ' + Buffer.from(sk + ':').toString('base64') },
      });
      const j = await r.json().catch(() => ({}));
      results.stripe = r.ok ? { ok: true, status: j.status } : { ok: false, error: j.error?.message };
    } catch (e) {
      results.stripe = { ok: false, error: (e as Error).message };
    }
  } else if (provider === 'paypal' && paypalSubId) {
    try {
      const { default: _paypal } = { default: await import('@/lib/paypal') };
      // Inline OAuth — keeps the cancel path self-contained without expanding
      // the paypal module's public surface for a one-off action.
      const env = (process.env.PAYPAL_ENV ?? 'live') === 'sandbox'
        ? 'https://api-m.sandbox.paypal.com'
        : 'https://api-m.paypal.com';
      const cid = process.env.PAYPAL_CLIENT_ID;
      const sec = process.env.PAYPAL_CLIENT_SECRET;
      if (cid && sec) {
        const auth = Buffer.from(`${cid}:${sec}`).toString('base64');
        const tok = await fetch(`${env}/v1/oauth2/token`, {
          method: 'POST',
          headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'grant_type=client_credentials',
        }).then(r => r.json()).then(j => j.access_token);
        const r = await fetch(`${env}/v1/billing/subscriptions/${paypalSubId}/cancel`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: 'User requested cancellation from Settings.' }),
        });
        results.paypal = r.ok ? { ok: true } : { ok: false, status: r.status };
      } else {
        results.paypal = { ok: false, error: 'PayPal not configured' };
      }
      void _paypal;
    } catch (e) {
      results.paypal = { ok: false, error: (e as Error).message };
    }
  } else {
    results.note = 'no active subscription';
  }

  // Always drop the local tier to free, even if the provider call failed —
  // user requested cancellation, give them what they asked for. The webhook
  // handler also clears these fields when the provider's cancellation event
  // arrives, so this is idempotent.
  queries.setUserTier(user.id, 'free', 'canceled', null);
  queries.setSubscriptionMeta(user.id, { provider: null, period: null });
  queries.setUserStripe(user.id, '', null);
  queries.setUserPaypal(user.id, null);

  return NextResponse.json({ ok: true, tier: 'free', providerResult: results });
}

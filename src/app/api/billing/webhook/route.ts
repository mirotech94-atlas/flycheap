import { NextRequest, NextResponse } from 'next/server';
import { verifyStripeSignature } from '@/lib/stripe';
import { queries } from '@/lib/db';
import { findUserByStripeCustomer, sendTrialEndingEmail, sendPaymentFailedEmail } from '@/lib/billing-emails';
import { notifyBillingToSlack, fmtMinorAmount } from '@/lib/notifier';

const fmtUnix = (t: number | undefined) => (t ? new Date(t * 1000).toISOString().slice(0, 10) : null);

export const dynamic = 'force-dynamic';

// Stripe webhook handler. Bind this URL in your Stripe dashboard:
//   https://flycheap.live/api/billing/webhook
// Set STRIPE_WEBHOOK_SECRET to the signing secret Stripe gives you.

type StripeEvent = {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
};

export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: 'STRIPE_WEBHOOK_SECRET not set' }, { status: 500 });

  const raw = await req.text();
  const sig = req.headers.get('stripe-signature');
  if (!verifyStripeSignature(raw, sig, secret)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 400 });
  }

  let event: StripeEvent;
  try { event = JSON.parse(raw) as StripeEvent; } catch { return NextResponse.json({ error: 'bad payload' }, { status: 400 }); }
  if (!event?.id || typeof event.id !== 'string') return NextResponse.json({ error: 'missing event id' }, { status: 400 });

  // Stripe delivers at least once and retries on any non-2xx, and a signed
  // event can be replayed within the signature tolerance. Record the id
  // first; a repeat is acknowledged without being applied again (which would
  // otherwise, say, re-upgrade an account after a later cancellation).
  if (!queries.recordWebhookEvent(event.id, 'stripe')) {
    return NextResponse.json({ received: true, duplicate: true });
  }
  try {
    await handleEvent(event);
  } catch (e) {
    // Let Stripe's retry run: forget the id, answer 5xx.
    queries.forgetWebhookEvent(event.id, 'stripe');
    console.error('[stripe-webhook] handler failed:', (e as Error).message);
    return NextResponse.json({ error: 'handler failed' }, { status: 500 });
  }
  return NextResponse.json({ received: true });
}

async function handleEvent(event: StripeEvent): Promise<void> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const s = event.data.object as {
        client_reference_id?: string; customer?: string;
        subscription?: string; metadata?: Record<string, string>;
        amount_total?: number; currency?: string;
      };
      const userId = Number(s.client_reference_id) || Number(s.metadata?.user_id);
      const plan = s.metadata?.plan === 'enterprise' ? 'enterprise' : 'pro';
      const period = s.metadata?.period === 'year' ? 'year' : 'month';
      if (userId && s.customer) {
        queries.setUserStripe(userId, String(s.customer), s.subscription ?? null);
        queries.setUserTier(userId, plan, 'active');
        // Record WHAT was sold. The PayPal branch has always done this; the
        // Stripe branch did not, so every Stripe subscription was stored with
        // a null provider and period — unattributable in the revenue admin.
        queries.setSubscriptionMeta(userId, { provider: 'stripe', period });
        queries.clearFoundingPeriod(userId);
        void notifyBillingToSlack('subscription_started', userId, {
          provider: 'stripe', plan, period,
          amount: fmtMinorAmount(s.amount_total, s.currency), source: 'Stripe checkout',
        });
      }
      break;
    }
    case 'customer.subscription.updated':
    case 'customer.subscription.created': {
      const sub = event.data.object as {
        id: string; customer: string; status: string; cancel_at_period_end?: boolean;
        current_period_end?: number; metadata?: Record<string, string>;
      };
      // Subscriptions opened through our checkout carry user_id metadata, but
      // one created in the Stripe dashboard (or before that metadata existed)
      // does not — and a no-op here would strand the account on the wrong tier.
      // The customer id is always present, so resolve through it as a fallback.
      const userId = Number(sub.metadata?.user_id) || (findUserByStripeCustomer(sub.customer)?.id ?? 0);
      if (userId) {
        const renewsIso = sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null;
        const plan = sub.metadata?.plan === 'enterprise' ? 'enterprise' : 'pro';
        const tier = (sub.status === 'active' || sub.status === 'trialing') ? plan : 'free';
        // A scheduled cancellation keeps the paid tier until period end; the
        // status records that so Settings can show the end date and the poll
        // sweep can finish it if the deleted webhook is late.
        const status = tier !== 'free' && sub.cancel_at_period_end ? 'cancel_at_period_end' : sub.status;
        // Stripe renewals arrive as subscription.updated; post only when the
        // period end actually moves forward so metadata-only updates stay quiet.
        const prevRenews = queries.getUserById(userId)?.subscription_renews_at ?? null;
        queries.setUserTier(userId, tier, status, renewsIso);
        queries.setUserStripe(userId, sub.customer, sub.id);
        if (sub.metadata?.period === 'year' || sub.metadata?.period === 'month') {
          queries.setSubscriptionMeta(userId, { provider: 'stripe', period: sub.metadata.period });
        }
        if (sub.status === 'active' && renewsIso && prevRenews && Date.parse(renewsIso) > Date.parse(prevRenews) + 60_000) {
          void notifyBillingToSlack('payment_received', userId, {
            provider: 'stripe', plan, when: `renews ${renewsIso.slice(0, 10)}`, source: 'Stripe renewal',
          });
        }
      }
      break;
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object as { customer: string; metadata?: Record<string, string> };
      // Same fallback as the update case — without it a cancellation made in
      // Stripe's own billing portal silently leaves the user on a paid tier.
      const userId = Number(sub.metadata?.user_id) || (findUserByStripeCustomer(sub.customer)?.id ?? 0);
      if (userId) {
        // A cancellation scheduled from the app already posted when it was
        // scheduled; post here only when Stripe is the first to tell us
        // (e.g. a portal cancel).
        const cur = queries.getUserById(userId);
        const wasPaid = (cur?.tier ?? 'free') !== 'free';
        const wasScheduled = cur?.subscription_status === 'cancel_at_period_end';
        queries.setUserTier(userId, 'free', 'canceled', null);
        queries.setSubscriptionMeta(userId, { provider: null, period: null });
        if (wasPaid && !wasScheduled) void notifyBillingToSlack('cancelled', userId, { provider: 'stripe', source: 'Stripe webhook' });
      }
      break;
    }
    case 'customer.subscription.trial_will_end': {
      // Fires 3 days before a trial converts — the reminder promised in the FAQ.
      const sub = event.data.object as { customer: string; trial_end?: number; metadata?: Record<string, string> };
      const userId = Number(sub.metadata?.user_id);
      const user = userId ? queries.getUserById(userId) : findUserByStripeCustomer(sub.customer);
      if (user?.email) await sendTrialEndingEmail(user.email, sub.trial_end, sub.metadata?.plan ?? 'pro');
      if (user) void notifyBillingToSlack('trial_ending', user, {
        provider: 'stripe', plan: sub.metadata?.plan ?? 'pro', when: fmtUnix(sub.trial_end),
      });
      break;
    }
    case 'invoice.payment_failed': {
      const inv = event.data.object as { customer: string; amount_due?: number; currency?: string };
      const user = findUserByStripeCustomer(inv.customer);
      if (user) {
        // Keep the tier until Stripe gives up and fires subscription.deleted
        // (which downgrades to Free with no data loss); just flag the status.
        // Flag past_due but KEEP the renewal date — a later successful retry is
        // detected by the period end moving, which needs the old value intact.
        const cur = queries.getUserById(user.id);
        queries.setUserTier(user.id, (cur?.tier ?? 'pro'), 'past_due', cur?.subscription_renews_at ?? null);
        await sendPaymentFailedEmail(user.email, inv.amount_due, inv.currency);
        void notifyBillingToSlack('payment_failed', user, {
          provider: 'stripe', amount: fmtMinorAmount(inv.amount_due, inv.currency), source: 'Stripe invoice',
        });
      }
      break;
    }
    default:
      // Ignore other events for now
      break;
  }
}

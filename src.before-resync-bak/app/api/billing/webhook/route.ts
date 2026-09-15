import { NextRequest, NextResponse } from 'next/server';
import { verifyStripeSignature } from '@/lib/stripe';
import { queries } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Stripe webhook handler. Bind this URL in your Stripe dashboard:
//   https://tracker.18dn.com/api/billing/webhook
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

  const event = JSON.parse(raw) as StripeEvent;

  switch (event.type) {
    case 'checkout.session.completed': {
      const s = event.data.object as {
        client_reference_id?: string; customer?: string;
        subscription?: string; metadata?: Record<string, string>;
      };
      const userId = Number(s.client_reference_id) || Number(s.metadata?.user_id);
      if (userId && s.customer) {
        queries.setUserStripe(userId, String(s.customer), s.subscription ?? null);
        queries.setUserTier(userId, 'pro', 'active');
      }
      break;
    }
    case 'customer.subscription.updated':
    case 'customer.subscription.created': {
      const sub = event.data.object as {
        id: string; customer: string; status: string;
        current_period_end?: number; metadata?: Record<string, string>;
      };
      const userId = Number(sub.metadata?.user_id);
      if (userId) {
        const renewsIso = sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null;
        const tier = sub.status === 'active' || sub.status === 'trialing' ? 'pro' : 'free';
        queries.setUserTier(userId, tier, sub.status, renewsIso);
        queries.setUserStripe(userId, sub.customer, sub.id);
      }
      break;
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object as { metadata?: Record<string, string> };
      const userId = Number(sub.metadata?.user_id);
      if (userId) queries.setUserTier(userId, 'free', 'canceled', null);
      break;
    }
    default:
      // Ignore other events for now
      break;
  }

  return NextResponse.json({ received: true });
}

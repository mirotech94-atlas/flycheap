import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { publicUrl } from '@/lib/publicUrl';

export const dynamic = 'force-dynamic';

// Stripe Customer Portal — lets users manage their subscription, change card,
// download invoices, and cancel without ever talking to support.
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(publicUrl(req, '/login?next=/settings'));
  if (!user.stripe_customer_id) {
    return NextResponse.redirect(publicUrl(req, '/settings?billing=no-customer'));
  }
  const sk = process.env.STRIPE_SECRET_KEY;
  if (!sk) return NextResponse.redirect(publicUrl(req, '/settings?billing=stripe-not-configured'));

  const returnUrl = publicUrl(req, '/settings');
  const form = new URLSearchParams();
  form.set('customer', user.stripe_customer_id);
  form.set('return_url', returnUrl);

  const r = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(sk + ':').toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form.toString(),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return NextResponse.redirect(publicUrl(req, `/settings?billing=portal-error&msg=${encodeURIComponent(j.error?.message ?? 'unknown')}`));
  return NextResponse.redirect(j.url, 303);
}

export async function POST(req: NextRequest) { return GET(req); }

import 'server-only';
import crypto from 'node:crypto';

// Hand-rolled Stripe REST client — keeps zero new deps. Only the two endpoints
// we need: create-checkout-session and verify-webhook-signature.

const API = 'https://api.stripe.com/v1';

function basicAuth(): string {
  const k = process.env.STRIPE_SECRET_KEY ?? '';
  return 'Basic ' + Buffer.from(k + ':').toString('base64');
}

export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY && !!process.env.STRIPE_PRICE_PRO;
}

/**
 * Create a Stripe Checkout Session for the Pro plan. successUrl / cancelUrl
 * are absolute URLs the user is redirected to after Checkout.
 */
export async function createProCheckoutSession(opts: {
  userId: number;
  email: string;
  successUrl: string;
  cancelUrl: string;
  customerId?: string | null;
}): Promise<{ ok: true; url: string; sessionId: string } | { ok: false; error: string }> {
  if (!isStripeConfigured()) {
    return { ok: false, error: 'Stripe not configured (STRIPE_SECRET_KEY / STRIPE_PRICE_PRO missing).' };
  }

  const form = new URLSearchParams();
  form.set('mode', 'subscription');
  form.set('success_url', opts.successUrl);
  form.set('cancel_url', opts.cancelUrl);
  form.set('line_items[0][price]', process.env.STRIPE_PRICE_PRO!);
  form.set('line_items[0][quantity]', '1');
  form.set('client_reference_id', String(opts.userId));
  if (opts.customerId) form.set('customer', opts.customerId);
  else form.set('customer_email', opts.email);
  form.set('subscription_data[metadata][user_id]', String(opts.userId));
  form.set('allow_promotion_codes', 'true');

  const res = await fetch(`${API}/checkout/sessions`, {
    method: 'POST',
    headers: { Authorization: basicAuth(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: j.error?.message || `HTTP ${res.status}` };
  return { ok: true, url: j.url, sessionId: j.id };
}

/**
 * Verify a Stripe webhook signature without the SDK.
 * Header format: t=<unix>,v1=<sig>[,v0=...]
 * Signed payload: "${t}.${rawBody}" → HMAC-SHA256 with whsec_… → hex
 */
export function verifyStripeSignature(rawBody: string, sigHeader: string | null, secret: string, toleranceSec = 300): boolean {
  if (!sigHeader || !secret) return false;
  const parts = Object.fromEntries(sigHeader.split(',').map(s => s.split('=') as [string, string]));
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > toleranceSec) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(v1, 'hex'));
  } catch { return false; }
}

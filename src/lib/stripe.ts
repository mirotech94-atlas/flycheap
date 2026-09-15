import 'server-only';
import crypto from 'node:crypto';

// Hand-rolled Stripe REST client — keeps zero new deps. Only the two endpoints
// we need: create-checkout-session and verify-webhook-signature.

const API = 'https://api.stripe.com/v1';

function basicAuth(): string {
  const k = process.env.STRIPE_SECRET_KEY ?? '';
  return 'Basic ' + Buffer.from(k + ':').toString('base64');
}

// Env uses STRIPE_PRICE_{PRO,ENT}_MONTHLY; older STRIPE_PRICE_PRO/ENTERPRISE
// names are honored as fallbacks.
function proPriceId(): string | undefined {
  return process.env.STRIPE_PRICE_PRO_MONTHLY || process.env.STRIPE_PRICE_PRO;
}
function enterprisePriceId(): string | undefined {
  return process.env.STRIPE_PRICE_ENT_MONTHLY || process.env.STRIPE_PRICE_ENTERPRISE;
}

export function isStripeConfigured(): boolean {
  return !!process.env.STRIPE_SECRET_KEY && !!proPriceId();
}

/**
 * Create a Stripe Checkout Session for a given plan (pro | enterprise).
 * Falls back to STRIPE_PRICE_PRO if enterprise price not configured.
 */
export async function createProCheckoutSession(opts: {
  userId: number;
  email: string;
  successUrl: string;
  cancelUrl: string;
  customerId?: string | null;
  plan?: 'pro' | 'enterprise';
  trialDays?: number;
}): Promise<{ ok: true; url: string; sessionId: string } | { ok: false; error: string }> {
  if (!isStripeConfigured()) {
    return { ok: false, error: 'Stripe not configured (STRIPE_SECRET_KEY / STRIPE_PRICE_PRO_MONTHLY missing).' };
  }

  const plan = opts.plan ?? 'pro';
  const priceId = plan === 'enterprise'
    ? (enterprisePriceId() || proPriceId()!)
    : proPriceId()!;

  const form = new URLSearchParams();
  form.set('mode', 'subscription');
  form.set('success_url', opts.successUrl);
  form.set('cancel_url', opts.cancelUrl);
  form.set('line_items[0][price]', priceId);
  form.set('line_items[0][quantity]', '1');
  form.set('client_reference_id', String(opts.userId));
  if (opts.customerId) form.set('customer', opts.customerId);
  else form.set('customer_email', opts.email);
  form.set('subscription_data[metadata][user_id]', String(opts.userId));
  form.set('subscription_data[metadata][plan]', plan);
  if (opts.trialDays && opts.trialDays > 0) {
    form.set('subscription_data[trial_period_days]', String(opts.trialDays));
    // Card is collected up front; if the trial ends without a valid payment
    // method Stripe cancels the subscription rather than invoicing.
    form.set('subscription_data[trial_settings][end_behavior][missing_payment_method]', 'cancel');
  }
  form.set('allow_promotion_codes', 'true');
  // Stripe Tax is active on the account: with automatic_tax on, Stripe charges
  // tax only in jurisdictions where a registration exists and monitors
  // thresholds elsewhere. Set STRIPE_AUTOMATIC_TAX=0 to disable.
  if (process.env.STRIPE_AUTOMATIC_TAX !== '0') {
    form.set('automatic_tax[enabled]', 'true');
    form.set('billing_address_collection', 'required');
    // customer_update is only valid for an existing customer object.
    if (opts.customerId) form.set('customer_update[address]', 'auto');
  }

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

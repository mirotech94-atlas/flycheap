import 'server-only';
import crypto from 'node:crypto';

// Hand-rolled Stripe REST client — keeps zero new deps. Only the two endpoints
// we need: create-checkout-session and verify-webhook-signature.

const API = 'https://api.stripe.com/v1';

function basicAuth(): string {
  const k = process.env.STRIPE_SECRET_KEY ?? '';
  return 'Basic ' + Buffer.from(k + ':').toString('base64');
}

export type Plan = 'pro' | 'enterprise';
export type Period = 'month' | 'year';

/**
 * Which env var holds each price.
 *
 * Env uses STRIPE_PRICE_{PRO,ENT}_{MONTHLY,YEARLY}; the older
 * STRIPE_PRICE_PRO / STRIPE_PRICE_ENTERPRISE names are honoured as monthly
 * fallbacks so an old deployment keeps working.
 */
const PRICE_ENV: Record<Plan, Record<Period, string[]>> = {
  pro: {
    month: ['STRIPE_PRICE_PRO_MONTHLY', 'STRIPE_PRICE_PRO'],
    year:  ['STRIPE_PRICE_PRO_YEARLY'],
  },
  enterprise: {
    month: ['STRIPE_PRICE_ENT_MONTHLY', 'STRIPE_PRICE_ENTERPRISE'],
    year:  ['STRIPE_PRICE_ENT_YEARLY'],
  },
};

/**
 * The price to charge, and the period actually being charged.
 *
 * THE BUG THIS EXISTS TO CLOSE: the pricing page has a monthly/yearly switch
 * and sends `?period=year`, but checkout only ever read `plan` — so every
 * yearly purchase silently charged the MONTHLY price. Someone clicking
 * "$79/year" was billed $9/month, and the two yearly price IDs configured in
 * production were referenced nowhere in the codebase.
 *
 * Returns the period it resolved, which is not always the one asked for: if a
 * yearly price is not configured we fall back to monthly rather than failing
 * the sale, and the caller records what was really sold.
 */
export function priceIdFor(plan: Plan, period: Period): { priceId: string; period: Period } | null {
  const pick = (p: Period) => PRICE_ENV[plan][p].map(k => process.env[k]).find(Boolean);
  const wanted = pick(period);
  if (wanted) return { priceId: wanted, period };
  // Never fail a sale over a missing yearly price; charge monthly and say so.
  const monthly = pick('month');
  return monthly ? { priceId: monthly, period: 'month' } : null;
}

function proPriceId(): string | undefined {
  return PRICE_ENV.pro.month.map(k => process.env[k]).find(Boolean);
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
  plan?: Plan;
  period?: Period;
}): Promise<{ ok: true; url: string; sessionId: string } | { ok: false; error: string }> {
  if (!isStripeConfigured()) {
    return { ok: false, error: 'Stripe not configured (STRIPE_SECRET_KEY / STRIPE_PRICE_PRO_MONTHLY missing).' };
  }

  const plan = opts.plan ?? 'pro';
  const resolved = priceIdFor(plan, opts.period ?? 'month');
  if (!resolved) return { ok: false, error: `No Stripe price configured for ${plan}.` };
  const { priceId, period } = resolved;

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
  // The period the customer was ACTUALLY charged for. Without it the webhook
  // has no way to attribute revenue — it reads metadata.period and would
  // record null for every subscription ever sold.
  form.set('subscription_data[metadata][period]', period);
  form.set('metadata[period]', period);
  form.set('metadata[plan]', plan);
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
    signal: AbortSignal.timeout(15_000),
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

import 'server-only';
import crypto from 'node:crypto';

// PayPal Subscriptions API — REST client, no SDK.
// Docs: https://developer.paypal.com/docs/api/subscriptions/v1/
//
// Required env:
//   PAYPAL_ENV                 = 'live' | 'sandbox' (default 'live')
//   PAYPAL_CLIENT_ID
//   PAYPAL_CLIENT_SECRET
//   PAYPAL_PLAN_PRO_MONTHLY
//   PAYPAL_PLAN_PRO_YEARLY
//   PAYPAL_PLAN_ENT_MONTHLY
//   PAYPAL_PLAN_ENT_YEARLY
//   PAYPAL_WEBHOOK_ID          (for webhook signature verification)

const ENV = (process.env.PAYPAL_ENV ?? 'live') === 'sandbox' ? 'sandbox' : 'live';
const API = ENV === 'sandbox'
  ? 'https://api-m.sandbox.paypal.com'
  : 'https://api-m.paypal.com';

export type PlanKey = 'pro' | 'enterprise';
export type BillingPeriod = 'month' | 'year';

const PLAN_ENV: Record<PlanKey, Record<BillingPeriod, string>> = {
  pro: {
    month: 'PAYPAL_PLAN_PRO_MONTHLY',
    year:  'PAYPAL_PLAN_PRO_YEARLY',
  },
  enterprise: {
    month: 'PAYPAL_PLAN_ENT_MONTHLY',
    year:  'PAYPAL_PLAN_ENT_YEARLY',
  },
};

export function planIdFor(plan: PlanKey, period: BillingPeriod): string | null {
  return process.env[PLAN_ENV[plan][period]] || null;
}

export function planFromPaypalPlanId(planId: string): { plan: PlanKey; period: BillingPeriod } | null {
  for (const plan of Object.keys(PLAN_ENV) as PlanKey[]) {
    for (const period of Object.keys(PLAN_ENV[plan]) as BillingPeriod[]) {
      if (process.env[PLAN_ENV[plan][period]] === planId) return { plan, period };
    }
  }
  return null;
}

export function isPaypalConfigured(): boolean {
  return Boolean(
    process.env.PAYPAL_CLIENT_ID &&
    process.env.PAYPAL_CLIENT_SECRET &&
    (process.env.PAYPAL_PLAN_PRO_MONTHLY || process.env.PAYPAL_PLAN_PRO_YEARLY ||
     process.env.PAYPAL_PLAN_ENT_MONTHLY || process.env.PAYPAL_PLAN_ENT_YEARLY)
  );
}

// PayPal access tokens last ~9h. Cache in-process to avoid hitting OAuth on
// every request.
let tokenCache: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string | null> {
  if (tokenCache && Date.now() < tokenCache.expiresAt) return tokenCache.token;
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) return null;
  const auth = Buffer.from(`${id}:${secret}`).toString('base64');
  const res = await fetch(`${API}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) return null;
  const j = await res.json().catch(() => ({}));
  if (!j.access_token) return null;
  // Refresh 60s before expiry to avoid races.
  tokenCache = { token: j.access_token, expiresAt: Date.now() + ((j.expires_in - 60) * 1000) };
  return j.access_token;
}

/**
 * Create a PayPal subscription in CREATED state. Returns the approval URL the
 * user must visit to authorize the recurring payment. On return, PayPal hits
 * our /api/billing/paypal/return endpoint with the subscription id.
 */
export async function createSubscription(opts: {
  plan: PlanKey;
  period: BillingPeriod;
  userId: number;
  email: string;
  returnUrl: string;
  cancelUrl: string;
}): Promise<{ ok: true; approveUrl: string; subscriptionId: string } | { ok: false; error: string }> {
  if (!isPaypalConfigured()) return { ok: false, error: 'PayPal not configured (missing client id/secret/plan ids).' };
  const planId = planIdFor(opts.plan, opts.period);
  if (!planId) return { ok: false, error: `No PayPal plan configured for ${opts.plan} / ${opts.period}.` };

  const token = await getAccessToken();
  if (!token) return { ok: false, error: 'PayPal auth failed.' };

  // Subscription starts (and billing begins) immediately — no trial period.
  const body: any = {
    plan_id: planId,
    custom_id: String(opts.userId),
    subscriber: { email_address: opts.email },
    application_context: {
      brand_name: 'FlyCheap',
      shipping_preference: 'NO_SHIPPING',
      user_action: 'SUBSCRIBE_NOW',
      return_url: opts.returnUrl,
      cancel_url: opts.cancelUrl,
    },
  };

  const res = await fetch(`${API}/v1/billing/subscriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: j.message || j.error_description || `HTTP ${res.status}` };
  const approve = (j.links ?? []).find((l: any) => l.rel === 'approve');
  if (!approve?.href) return { ok: false, error: 'PayPal did not return an approval URL.' };
  return { ok: true, approveUrl: approve.href, subscriptionId: j.id };
}

export async function getSubscription(subscriptionId: string): Promise<any | null> {
  const token = await getAccessToken();
  if (!token) return null;
  const res = await fetch(`${API}/v1/billing/subscriptions/${subscriptionId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

/**
 * Verify a PayPal webhook signature. PayPal's signed-payload model is
 * different from Stripe's — instead of an HMAC we ask PayPal to verify the
 * event for us (verify-webhook-signature endpoint). It's an extra round-trip
 * but cryptographically simpler since PayPal owns the signing key rotation.
 */
export async function verifyWebhook(headers: Headers, rawBody: string): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) return false;
  const token = await getAccessToken();
  if (!token) return false;

  const body = {
    auth_algo:           headers.get('paypal-auth-algo'),
    cert_url:            headers.get('paypal-cert-url'),
    transmission_id:     headers.get('paypal-transmission-id'),
    transmission_sig:    headers.get('paypal-transmission-sig'),
    transmission_time:   headers.get('paypal-transmission-time'),
    webhook_id:          webhookId,
    webhook_event:       JSON.parse(rawBody),
  };
  const res = await fetch(`${API}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) return false;
  const j = await res.json().catch(() => ({}));
  return j.verification_status === 'SUCCESS';
}

// crypto import retained for any future HMAC use cases; PayPal currently
// uses a verify-by-API model so we don't sign anything locally.
void crypto;

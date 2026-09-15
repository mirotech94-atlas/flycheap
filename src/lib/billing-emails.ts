import 'server-only';
import { Resend } from 'resend';
import { getDb } from './db';
import { supportFrom } from './senders';
import { APP_URL } from './hosts';

const APP = process.env.APP_URL || APP_URL;

export function findUserByStripeCustomer(customerId: string): { id: number; email: string; name: string | null } | undefined {
  return getDb()
    .prepare('SELECT id, email, name FROM users WHERE stripe_customer_id = ? LIMIT 1')
    .get(customerId) as { id: number; email: string; name: string | null } | undefined;
}

function shell(title: string, body: string, ctaHref: string, ctaLabel: string): string {
  return `
  <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;max-width:560px;margin:auto;padding:32px;color:#0f172a">
    <div style="display:inline-block;background:linear-gradient(135deg,#0a3a6b,#1f5fa5);color:white;font-weight:700;font-size:11px;letter-spacing:.14em;text-transform:uppercase;padding:6px 12px;border-radius:999px;margin-bottom:16px">FlyCheap · Billing</div>
    <h1 style="font-size:28px;margin:0 0 12px;color:#0a3a6b;line-height:1.15">${title}</h1>
    <div style="color:#334155;font-size:15px;line-height:1.6">${body}</div>
    <a href="${ctaHref}" style="display:inline-block;margin-top:24px;background:linear-gradient(180deg,#1f5fa5,#0a3a6b);color:white;padding:14px 26px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px">${ctaLabel}</a>
    <div style="margin-top:32px;padding-top:20px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:12px;line-height:1.6">
      Questions? Reply to this email. · <a href="${APP}/terms#refunds" style="color:#94a3b8">Cancellation &amp; refund policy</a>
    </div>
  </div>`;
}

async function send(to: string, subject: string, html: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;
  try {
    await new Resend(apiKey).emails.send({ from: supportFrom('FlyCheap Billing'), to, subject, html });
  } catch (e) {
    console.error('[billing-email] send failed:', (e as Error).message);
  }
}

/** Sent when Stripe fires customer.subscription.trial_will_end (3 days before conversion). */
export async function sendTrialEndingEmail(to: string, trialEndUnix: number | undefined, plan: string): Promise<void> {
  const when = trialEndUnix
    ? new Date(trialEndUnix * 1000).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    : 'in 3 days';
  const price = plan === 'enterprise' ? '$39' : '$9';
  await send(to, `Your FlyCheap Pro trial ends ${trialEndUnix ? 'on ' + when : when}`, shell(
    'Your free trial ends in 3 days',
    `<p>Heads up — your FlyCheap ${plan === 'enterprise' ? 'Enterprise' : 'Pro'} trial ends <strong>${when}</strong>. If you do nothing, your card will be charged <strong>${price}/month</strong> starting then, and every feature you're using stays on.</p>
     <p>Not for you? Cancel in one click from Settings → Billing before then and you won't be charged anything. Your routes and fare history stay put on the Free plan either way.</p>`,
    `${APP}/settings`, 'Manage my subscription →',
  ));
}

/** Sent when Stripe fires invoice.payment_failed. */
export async function sendPaymentFailedEmail(to: string, amountCents: number | undefined, currency: string | undefined): Promise<void> {
  const amount = amountCents != null ? `${(amountCents / 100).toFixed(2)} ${(currency || 'usd').toUpperCase()}` : 'your subscription';
  await send(to, 'Action needed: your FlyCheap payment didn’t go through', shell(
    'We couldn’t process your payment',
    `<p>Your renewal for <strong>${amount}</strong> was declined by your bank. We'll retry automatically over the next few days, and nothing changes in your account yet.</p>
     <p>To keep Pro features running without interruption, update your card in the billing portal. If payment can't be collected after our retries, your account moves to the Free plan — <strong>no routes or history are deleted</strong>.</p>`,
    `${APP}/api/billing/portal`, 'Update payment method →',
  ));
}

/** One-time nudge when the free founding period (first 3 months) ends. */
export async function sendUpgradeNudgeEmail(to: string): Promise<void> {
  await send(to, 'Your first 3 months with FlyCheap are up — ready for more?', shell(
    'Three months in. Time to level up?',
    `<p>Your founding period is complete — thanks for flying with us. Your account stays on the Free plan (5 routes, email alerts, worldwide explore), nothing is lost.</p>
     <p>If FlyCheap has been earning its keep, <strong>Pro</strong> ($9/month) unlocks up to 100 routes, priority 5-minute polling, SMS / WhatsApp / Telegram alerts, buy/wait verdicts and the mistake-fare radar. <strong>Enterprise</strong> ($39/month) adds white-label, a custom domain, the REST API and Slack alerts.</p>`,
    `${APP}/welcome#pricing`, 'See Pro & Enterprise →',
  ));
}

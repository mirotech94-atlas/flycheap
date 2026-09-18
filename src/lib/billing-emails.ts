import 'server-only';
import { Resend } from 'resend';
import { getDb } from './db';
import { supportFrom } from './senders';
import { APP_URL } from './hosts';
import { renderEmail, emailButton, EMAIL_TOKENS as T } from './emailLayout';

const APP = process.env.APP_URL || APP_URL;

export function findUserByStripeCustomer(customerId: string): { id: number; email: string; name: string | null } | undefined {
  return getDb()
    .prepare('SELECT id, email, name FROM users WHERE stripe_customer_id = ? LIMIT 1')
    .get(customerId) as { id: number; email: string; name: string | null } | undefined;
}

function shell(title: string, body: string, ctaHref: string, ctaLabel: string): string {
  // `body` is caller-supplied <p> HTML; give it the shell's body type + color.
  const styledBody = body.replace(/<p>/g, `<p style="font-family:${T.SANS};font-size:15px;line-height:1.62;color:${T.INK};margin:0 0 16px">`);
  return renderEmail({
    kind: 'billing',
    appUrl: APP,
    preheader: title,
    headline: title,
    body: `${styledBody}<div style="margin:14px 0 4px">${emailButton(ctaLabel, ctaHref)}</div>`,
    footerNote: `Questions? Just reply to this email — it lands in our inbox. &nbsp;&middot;&nbsp; <a href="${APP}/terms#refunds" style="color:${T.SLATE};text-decoration:underline">Cancellation &amp; refund policy</a>`,
  });
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

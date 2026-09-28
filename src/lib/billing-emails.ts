import 'server-only';
import { Resend } from 'resend';
import { getDb } from './db';
import { supportFrom } from './senders';
import { APP_URL } from './hosts';
import { renderEmail, emailButton, EMAIL_TOKENS as T } from './emailLayout';
import { TIER_LIMITS } from './db';
import { PRICES } from './prices';
import { deliverableChannels } from './channelHealth';
import { tierChannels, channelSentence, upgradeReasons, plural } from './tierCopy';

const APP = process.env.APP_URL || APP_URL;

/** "a, b and c" — every list in these emails is derived, so it needs joining at render time. */
const andList = (xs: readonly string[]) =>
  xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

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
    footerNote: `Questions? Just reply to this email — it lands in our inbox. &nbsp;&nbsp; <a href="${APP}/terms#refunds" style="color:${T.MUTED};text-decoration:underline">Cancellation &amp; refund policy</a>`,
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
  const tier = plan === 'enterprise' ? 'enterprise' : 'pro';
  const planName = tier === 'enterprise' ? 'Enterprise' : 'Pro';
  const price = `$${PRICES[tier].month}`;
  await send(to, `Your FlyCheap ${planName} trial ends ${trialEndUnix ? 'on ' + when : when}`, shell(
    'Your free trial ends in 3 days',
    `<p>Heads up — your FlyCheap ${planName} trial ends <strong>${when}</strong>. If you do nothing, your card will be charged <strong>${price}/month</strong> starting then, and every feature you're using stays on.</p>
     <p>Not for you? Click <strong>Downgrade to Free</strong> on the Pricing page before then and you won't be charged anything. Your routes and fare history stay put on the Free plan either way.</p>`,
    `${APP}/pricing`, 'Manage my plan',
  ));
}

/** Sent when Stripe fires invoice.payment_failed. */
export async function sendPaymentFailedEmail(to: string, amountCents: number | undefined, currency: string | undefined): Promise<void> {
  const amount = amountCents != null ? `${(amountCents / 100).toFixed(2)} ${(currency || 'usd').toUpperCase()}` : 'your subscription';
  await send(to, 'Action needed: your FlyCheap payment didn’t go through', shell(
    'We couldn’t process your payment',
    `<p>Your renewal for <strong>${amount}</strong> was declined by your bank. We'll retry automatically over the next few days, and nothing changes in your account yet.</p>
     <p>To keep Pro features running without interruption, update your card in the billing portal. If payment can't be collected after our retries, your account moves to the Free plan — <strong>no routes or history are deleted</strong>.</p>`,
    `${APP}/api/billing/portal`, 'Update payment method',
  ));
}

/**
 * One-time nudge when the free founding period (first 3 months) ends.
 *
 * Every claim is derived: the Free plan from TIER_LIMITS and the channels we
 * can actually deliver on, the upgrade cases from upgradeReasons(), prices
 * from PRICES. The hand-written version sold "priority 5-minute polling",
 * WhatsApp, a mistake-fare radar, a REST API and Slack alerts — none of which
 * a customer can get — and linked to the retired /welcome page.
 */
export function upgradeNudgeEmail(): { subject: string; html: string } {
  const d = deliverableChannels();
  const free = TIER_LIMITS.free;
  const freeLine = `${plural(free.maxRoutes, 'tracked route')}, alerts by ${lower(channelSentence(tierChannels('free', d)))}, and worldwide explore`;
  // upgradeReasons() is shared with the pricing page; one of its lines carries
  // its own comma clause, which reads badly inside a joined list here.
  const tidy = (s: string) => lower(s).replace(/, not just target alerts$/, '');
  const proAdds = upgradeReasons('free', 'pro', d).map(tidy);
  const entAdds = upgradeReasons('pro', 'enterprise', d).map(tidy);
  const pro = `<strong>Pro</strong> ($${PRICES.pro.month}/month) adds ${andList(proAdds)}.`;
  const ent = entAdds.length ? ` <strong>Enterprise</strong> ($${PRICES.enterprise.month}/month) adds ${andList(entAdds)}.` : '';
  return {
    subject: 'Your first 3 months with FlyCheap are up — ready for more?',
    html: shell(
      'Three months in. Time to level up?',
      `<p>Your founding period is complete — thanks for flying with us. Your account stays on the Free plan (${freeLine}), nothing is lost.</p>
       <p>If FlyCheap has been earning its keep: ${pro}${ent}</p>`,
      `${APP}/pricing`, 'See Pro and Enterprise',
    ),
  };
}

export async function sendUpgradeNudgeEmail(to: string): Promise<void> {
  const { subject, html } = upgradeNudgeEmail();
  await send(to, subject, html);
}

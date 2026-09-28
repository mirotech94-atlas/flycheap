import 'server-only';
import {
  renderEmail, emailButton, emailCode, emailNote, p, link, escapeEmail as esc,
  EMAIL_TOKENS as T,
} from './emailLayout';
import { TIER_LIMITS } from './db';
import { PRICES } from './prices';
import { deliverableChannels } from './channelHealth';
import { tierChannels, channelSentence, upgradeReasons, plural } from './tierCopy';

/**
 * Concrete FlyCheap emails, one builder per live sender. Each returns
 * { subject, preheader, html }; the shared shell (emailLayout.ts) supplies the
 * masthead, type and footer, so every message reads as one family while the
 * body is tailored to what that email is for.
 *
 * Builder → sender map:
 *   inviteEmail            → early-access.ts  sendInviteEmail        (welcome)
 *   welcomeQuickStartEmail → auth.ts          sendWelcomeEmail       (welcome)
 *   waitlistPositionEmail  → early-access.ts  sendEarlyAccessEmail   (welcome)
 *   signInLinkEmail        → auth.ts          sendMagicLink          (security)
 *   signInCodeEmail        → auth.ts          sendEmailCode          (security)
 * Billing emails keep their own shell() (billing-emails.ts) and the fare alert
 * wears the chrome directly (email.ts); both use the same masthead/footer.
 */

export type BuiltEmail = { subject: string; preheader: string; html: string };

/** Early-access approval — the 48h one-click sign-in link ("you're in"). */
export function inviteEmail(o: { firstName?: string; loginUrl: string; appUrl?: string }): BuiltEmail {
  const hi = o.firstName ? esc(o.firstName) + ', your' : 'Your';
  return {
    subject: "You're in — your FlyCheap account is ready",
    preheader: 'Your founding-member seat is open. One tap to start watching fares.',
    html: renderEmail({
      kind: 'welcome', appUrl: o.appUrl,
      preheader: 'Your founding-member seat is open. One tap to start watching fares.',
      headline: `${hi} founding-member seat is open.`,
      body: [
        p('Welcome aboard. Your account is ready with a three-month trial of the full product — every feature, no card. Add your first route and we start watching fares within the hour.'),
        `<div style="margin:6px 0 4px">${emailButton('Open FlyCheap', o.loginUrl)}</div>`,
        emailNote('This one-tap sign-in link works for 48 hours. After that, sign in any time with this email address.'),
      ].join(''),
    }),
  };
}

function foundingFooter(): string {
  const d = deliverableChannels();
  const free = TIER_LIMITS.free;
  const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
  const adds = upgradeReasons('free', 'pro', d).map(s => lower(s).replace(/, not just target alerts$/, ''));
  const addsText = adds.length <= 1 ? adds.join('') : `${adds.slice(0, -1).join(', ')} and ${adds[adds.length - 1]}`;
  return `Your founding period is the full product for 3 months, free, no card. After that your account continues on Free — ${plural(free.maxRoutes, 'tracked route')}, alerts by ${lower(channelSentence(tierChannels('free', d)))}, worldwide explore — and Pro ($${PRICES.pro.month}/mo) adds ${addsText}.`;
}

/** First-signup welcome with the 60-second quick start + founding-period terms. */
export function welcomeQuickStartEmail(o: { appUrl: string; unsubUrl?: string }): BuiltEmail {
  const app = o.appUrl.replace(/\/$/, '');
  const step = (title: string, rest: string) =>
    `<p style="font-family:${T.SANS};font-size:15px;line-height:1.6;color:${T.INK};margin:0 0 12px"><strong style="color:${T.INK}">${title}</strong> — ${rest}</p>`;
  return {
    subject: 'Welcome to FlyCheap — your first 60 seconds',
    preheader: 'Your first 3 months are on us. Three quick steps to your first fare alert.',
    html: renderEmail({
      kind: 'welcome', appUrl: app, unsubUrl: o.unsubUrl,
      preheader: 'Your first 3 months are on us. Three quick steps to your first fare alert.',
      headline: 'Welcome to FlyCheap.',
      // Derived: the trial is the FULL product (limitsForUser never drops a
      // founding account below Enterprise), Free is TIER_LIMITS.free, and the
      // upgrade case is whatever Pro genuinely adds over Free today.
      footerNote: foundingFooter(),
      body: [
        p('Your first three months are on us — the full product, no card. Here is everything to do in your first sixty seconds:'),
        step('Add your first route', `pick a home airport and destination at ${link('flycheap.live/searches', app + '/searches')}. We start polling within the hour.`),
        step('Set your target price', `in ${link('Settings', app + '/settings')}. We email you the moment any tracked fare drops below it.`),
        step('Explore worldwide', `at ${link('flycheap.live/explore', app + '/explore')} — the cheapest flights from your home city, mapped.`),
        `<div style="margin:14px 0 4px">${emailButton('Open the dashboard', app + '/')}</div>`,
        emailNote('Questions? Just reply to this email — it lands in our inbox.'),
      ].join(''),
    }),
  };
}

/** Waitlist confirmation — the position number is the hero. */
export function waitlistPositionEmail(o: { position: number; shareUrl: string; referralBoost: number; demoUrl: string; appUrl?: string }): BuiltEmail {
  const hero = `
    <div style="margin:0 0 16px">
      <div style="font-family:${T.SERIF};font-size:52px;font-weight:700;color:${T.INK};line-height:1">#${o.position}</div>
      <div style="font-family:${T.SANS};font-size:13px;color:${T.SLATE};margin-top:2px">your place on the early-access list</div>
    </div>`;
  return {
    subject: `You're #${o.position} on the FlyCheap early-access list`,
    preheader: `You're #${o.position} in line. Share your link to move up ${o.referralBoost} spots per friend.`,
    html: renderEmail({
      kind: 'welcome', appUrl: o.appUrl,
      preheader: `You're #${o.position} in line. Share your link to move up ${o.referralBoost} spots per friend.`,
      headline: "You're on the list.",
      body: [
        hero,
        p(`We're onboarding founding members in small waves so everyone gets a real welcome. Want to skip ahead? Every friend who joins with your link moves you up <strong style="color:${T.INK}">${o.referralBoost} spots</strong>.`),
        `<div style="font-family:${T.MONO};font-size:13px;color:${T.NAVY};background:${T.PAPER};border:1px solid ${T.LINE};border-radius:6px;padding:11px 14px;margin:0 0 4px;word-break:break-all">${esc(o.shareUrl)}</div>`,
        `<div style="margin:14px 0 4px">${emailButton('Watch the 4-minute demo', o.demoUrl)}</div>`,
        emailNote("Didn't sign up? Ignore this email and you'll never hear from us again."),
      ].join(''),
    }),
  };
}

/** Magic-link sign-in — the primary button is the link; mobile gets a scheme fallback. */
export function signInLinkEmail(o: { link: string; minutes: number; mobileFallbackHref?: string; appUrl?: string }): BuiltEmail {
  const fallback = o.mobileFallbackHref
    ? `<div style="margin:12px 0 0"><a href="${o.mobileFallbackHref.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}" style="display:inline-block;background:${T.PAPER};border:1px solid ${T.LINE};color:${T.NAVY};text-decoration:none;font-family:${T.SANS};font-size:13px;font-weight:600;padding:10px 20px;border-radius:6px">Open in the FlyCheap app</a></div>`
    : '';
  return {
    subject: 'Sign in to FlyCheap',
    preheader: `Your sign-in link is ready. It's good for ${o.minutes} minutes.`,
    html: renderEmail({
      kind: 'security', appUrl: o.appUrl,
      preheader: `Your sign-in link is ready. It's good for ${o.minutes} minutes.`,
      headline: 'Sign in to FlyCheap.',
      body: [
        p(`Tap the button to sign in. This link is good for <strong style="color:${T.INK}">${o.minutes} minutes</strong> and works once.`),
        `<div style="margin:6px 0 4px">${emailButton('Sign in', o.link)}</div>`,
        fallback,
        emailNote(`If you didn't ask to sign in, you can safely ignore this email — nothing changes without this link.<br><span style="color:#97a1b2;word-break:break-all">${esc(o.link)}</span>`),
      ].join(''),
    }),
  };
}

/** Support: acknowledgement the moment a client opens a ticket. */
export function ticketReceivedEmail(o: { ref: string; name?: string; subject: string; threadUrl: string; appUrl?: string }): BuiltEmail {
  const greet = o.name ? `Hi ${esc(o.name.split(' ')[0])},` : 'Hi there,';
  return {
    subject: `We've got it — your request ${o.ref}`,
    preheader: `Logged as ${o.ref}. A real person will get back to you.`,
    html: renderEmail({
      kind: 'support', appUrl: o.appUrl,
      preheader: `Logged as ${o.ref}. A real person will get back to you.`,
      headline: "We've got your message.",
      body: [
        p(greet),
        p(`Your request is logged as <strong style="color:${T.INK}">${esc(o.ref)}</strong> — "${esc(o.subject)}". A real person reads every ticket, and we'll get back to you by email. You can also follow the thread in your Support tab.`),
        `<div style="margin:6px 0 4px">${emailButton('View your ticket', o.threadUrl)}</div>`,
        emailNote(`Just reply to this email to add anything — it stays on ${esc(o.ref)}.`),
      ].join(''),
    }),
  };
}

/** Support: an operator's reply on an open ticket. */
export function ticketReplyEmail(o: { ref: string; name?: string; replyBody: string; threadUrl: string; appUrl?: string }): BuiltEmail {
  const greet = o.name ? `Hi ${esc(o.name.split(' ')[0])},` : 'Hi there,';
  const bodyHtml = esc(o.replyBody).replace(/\n{2,}/g, '</p><p style="font-family:' + T.SANS + ';font-size:15px;line-height:1.62;color:' + T.INK + ';margin:0 0 16px">').replace(/\n/g, '<br/>');
  return {
    subject: `Re: your FlyCheap request (${o.ref})`,
    preheader: 'We replied to your support request.',
    html: renderEmail({
      kind: 'support', appUrl: o.appUrl,
      preheader: 'We replied to your support request.',
      headline: 'We looked into it.',
      body: [
        p(greet),
        p(bodyHtml),
        `<div style="margin:6px 0 4px">${emailButton('Reply in FlyCheap', o.threadUrl)}</div>`,
        emailNote(`Or just reply to this email — it stays on ticket <strong style="color:${T.INK}">${esc(o.ref)}</strong>.`),
      ].join(''),
    }),
  };
}

/** One-time sign-in / recovery code. */
export function signInCodeEmail(o: { code: string; minutes: number; appUrl?: string }): BuiltEmail {
  return {
    subject: `${o.code} is your FlyCheap sign-in code`,
    preheader: `Your one-time code is ${o.code}. It expires in ${o.minutes} minutes.`,
    html: renderEmail({
      kind: 'security', appUrl: o.appUrl,
      preheader: `Your one-time code is ${o.code}. It expires in ${o.minutes} minutes.`,
      headline: 'Your one-time sign-in code',
      body: [
        p('Enter this code in the FlyCheap app to finish signing in. It is good for one use.'),
        emailCode(o.code),
        emailNote(`Expires in <strong style="color:${T.INK}">${o.minutes} minutes</strong>. If you didn't ask to sign in, you can ignore this email — your account is unchanged, and no one can get in without this code.`),
      ].join(''),
    }),
  };
}

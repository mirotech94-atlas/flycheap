/**
 * Every customer-facing sentence about what a plan gives you.
 *
 * "Every customer-facing number must be derived, never typed." Nine false
 * public claims have already been found and fixed in this codebase; the pricing
 * page had three more (see DELIVERABILITY below). The fix is to stop writing
 * these sentences by hand: this module derives all of them from TIER_LIMITS and
 * from what the product can actually deliver, so a limit change moves the copy
 * and an undeliverable channel cannot be advertised.
 *
 * WHY THERE IS NO POLLING CADENCE IN HERE
 * The paid tiers used to be sold on polling speed ("30-minute polling — 8×
 * faster than Free"). That is a promise the poll allocator has to break to do
 * its job: it wants to poll a route departing next week every five minutes and
 * a speculative one six months out once a day, regardless of who owns them.
 * pollBudget.ts says so in as many words — `'full'` mode is gated on "the
 * pricing page no longer sells a polling interval".
 *
 * So cadence is no longer a feature. It is an implementation detail the user
 * cannot feel, and what replaces it is a statement of the MECHANISM, which is
 * both true today and still true after the allocator gets full authority.
 * Tiers are sold on route count, history, channels, flexible dates and sharing
 * — things a user can actually want.
 *
 * Pure and client-safe: deliverability is measured on the server and passed in,
 * so this module cannot accidentally read an env var that is undefined in the
 * browser and quietly drop a channel from the page.
 */

import { TIER_LIMITS, type TierLimit } from './db';
import type { Channel } from './alertPolicy';

/**
 * Tier names that still appear in the `users.tier` column of installs that
 * predate the open-source change. Nothing is gated on them any more —
 * TIER_LIMITS answers every key with the same unlimited record — but the union
 * stays so old rows keep typechecking instead of needing a migration.
 */
export type TierId = 'free' | 'pro' | 'enterprise' | 'open';

export const TIER_LABEL: Record<TierId, string> = {
  free: 'Open', pro: 'Open', enterprise: 'Open', open: 'Open',
};

const CHANNEL_LABEL: Record<Channel, string> = {
  email: 'Email',
  sms: 'SMS',
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  push: 'Push',
};

/**
 * The one sentence about how often we check.
 *
 * States the mechanism rather than an interval, so it stays true whichever
 * allocator mode is running. Nothing here is a number we would have to defend.
 */
export const POLLING_PROMISE =
  'We check your routes continuously, and check the ones that matter most — '
  + 'close to departure, close to your target, or moving fast — most often.';

/** The short form, for a stat tile or a tooltip. */
export const POLLING_PROMISE_SHORT = 'Checked continuously, most often when it matters';

export const plural = (n: number, one: string, many = `${one}s`) =>
  `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

/**
 * Channels this tier may use AND the product can actually send on.
 *
 * DELIVERABILITY — the reason this takes an argument.
 * TIER_LIMITS.channels is a permission list, not a capability list. The pricing
 * page was advertising Pro as "All alert channels (Slack, Telegram, WhatsApp,
 * Instagram, SMS, email)". Of those six: Slack is the internal ops channel and
 * is not in any tier's channel list; Instagram has no sender and no code at
 * all; and WhatsApp's sender is missing (TWILIO_FROM_WHATSAPP is unset, so
 * sendTwilio returns "not configured" for every WhatsApp alert). Three claims,
 * none of them true. `isConfigured` is not the same as enabled, and a
 * permission is not the same as a delivery.
 */
export function tierChannels(tier: TierId, deliverable: readonly Channel[]): Channel[] {
  return resolveChannels(tier, deliverable).channels;
}

/**
 * The channels to show, and whether that list is MEASURED or merely permitted.
 *
 * The failure mode this closes: `deliverable` is read from server env, and an
 * environment that cannot see those vars returns an empty list — which rendered
 * "No alert channels" against every tier on the public pricing page. Telling
 * visitors the product cannot alert them at all, because of a deployment
 * condition, is a worse lie than the one this module exists to prevent.
 *
 * So an empty measurement is treated as "we could not measure", and the page
 * falls back to what the plan PERMITS and says so in those words. A non-empty
 * measurement is the truth and is stated flatly.
 */
export function resolveChannels(tier: TierId, deliverable: readonly Channel[]): {
  channels: Channel[];
  measured: boolean;
} {
  const permitted = (TIER_LIMITS[tier] ?? TIER_LIMITS.free).channels as Channel[];
  if (deliverable.length === 0) return { channels: permitted, measured: false };
  return { channels: permitted.filter(c => deliverable.includes(c)), measured: true };
}

/** "Email, SMS and Telegram" — the Oxford-free list humans read. */
export function channelSentence(channels: readonly Channel[]): string {
  const names = channels.map(c => CHANNEL_LABEL[c]);
  if (names.length === 0) return 'No alert channels';
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/*
 * `PlanFeature`, `planFeatures()` and `upgradeReasons()` lived here and are
 * gone. They described what one plan had that another did not, and there are no
 * plans: FlyCheap is open source, every capability is on, and nothing is sold.
 *
 * What remains is the copy that is still true with one tier — the polling
 * promise (a mechanism, never a cadence), the channel sentence, and `plural`.
 * `tierChannels` keeps its signature because six callers pass a tier, and it
 * still does the one thing that matters: advertise a channel only when a sender
 * exists for it. `isConfigured` is not the same as enabled, which is the rule
 * that outlived the pricing page it was written for.
 */

/**
 * Channel discipline — who gets told what, on which channel, and when.
 *
 * "Alerts are the product." Every rule here exists because breaking it costs
 * more than the alert is worth: an alert that wakes someone at 3am for a trend
 * warning does not just annoy them, it teaches them to mute the channel that the
 * $400 mistake fare will arrive on tomorrow.
 *
 * Pure and dependency-free: settings are passed in, so every branch is testable
 * without a database and the same decision can be replayed in the admin view.
 */

import {
  urgencyFor, exemptFromFrequencyCap, mayBreakQuietHours,
  type AlertKind, type AlertUrgency,
} from './alertKind';

export type Channel = 'email' | 'sms' | 'whatsapp' | 'telegram' | 'push';

/** New users start on digest and escalate themselves. */
export const DEFAULT_QUIET_START_HOUR = 22;
export const DEFAULT_QUIET_END_HOUR = 8;
/** Alerts per user per day, across all types. Mistake fares are exempt. */
export const DEFAULT_DAILY_CAP = 3;

export type AlertPolicyInput = {
  kind: AlertKind;
  /** Channels the user has configured and their tier allows. */
  availableChannels: Channel[];
  /** Per-WATCH override. "The home route to see family gets SMS; the
   *  speculative Tokyo budget watch gets digest." */
  watchChannels?: Channel[] | null;
  /** Local hour 0-23 for the user, in THEIR timezone. */
  localHour: number;
  quietHours?: { startHour: number; endHour: number } | null;
  /** Explicit opt-in, taken at setup, to be woken for mistake fares only. */
  wakeMeForMistakeFares?: boolean;
  /** Alerts already sent to this user today, excluding exempt ones. */
  sentToday: number;
  dailyCap?: number;
  /** New users default to digest; they escalate themselves to instant. */
  instantEnabled?: boolean;
  /** Days until departure, for the verdict-change urgency rule. */
  daysToDeparture?: number | null;
};

export type AlertDecision =
  | { send: true; channels: Channel[]; urgency: AlertUrgency; reason: string }
  | { send: false; defer: 'digest' | 'quiet-hours' | null; reason: string };

/** Is the clock inside quiet hours? Handles windows that wrap midnight. */
export function inQuietHours(localHour: number, q?: { startHour: number; endHour: number } | null): boolean {
  const start = q?.startHour ?? DEFAULT_QUIET_START_HOUR;
  const end = q?.endHour ?? DEFAULT_QUIET_END_HOUR;
  if (start === end) return false;
  // 22 → 8 wraps midnight; 1 → 6 does not.
  return start > end ? (localHour >= start || localHour < end) : (localHour >= start && localHour < end);
}

/**
 * Decide whether, how and on what to send.
 *
 * Order matters and is deliberate: the type's own urgency first, then the
 * user's consent, then the volume cap. A cap that silenced a mistake fare would
 * be the most expensive setting in the product, so the exemption is checked
 * before the cap, not after.
 */
export function decideAlert(input: AlertPolicyInput): AlertDecision {
  const closeToDeparture = input.daysToDeparture != null && input.daysToDeparture <= 14;
  const urgency = urgencyFor(input.kind, { closeToDeparture });

  // Per-watch override wins over the account default — that is the whole point
  // of having one. Intersected with what is actually available, so a watch
  // cannot conjure a channel the user has not set up or the tier does not allow.
  const requested = input.watchChannels?.length ? input.watchChannels : input.availableChannels;
  const channels = requested.filter(c => input.availableChannels.includes(c));

  if (channels.length === 0) {
    return { send: false, defer: null, reason: 'no channel available for this user' };
  }

  // Digest-urgency types never interrupt, whatever else is true.
  if (urgency === 'digest') {
    return { send: false, defer: 'digest', reason: `${input.kind} is a digest item` };
  }

  // New users start on digest and escalate themselves rather than being
  // started on instant and lost to fatigue.
  if (input.instantEnabled === false && urgency !== 'once') {
    return { send: false, defer: 'digest', reason: 'user is on digest; they have not enabled instant alerts' };
  }

  // Quiet hours, in the user's own timezone.
  if (inQuietHours(input.localHour, input.quietHours)) {
    if (!mayBreakQuietHours(input.kind, !!input.wakeMeForMistakeFares)) {
      return {
        send: false,
        defer: 'quiet-hours',
        reason: input.kind === 'mistake-fare'
          ? 'mistake fare during quiet hours, and the user did not opt in to being woken'
          : 'quiet hours',
      };
    }
  }

  // The volume cap, last — and never applied to the one alert worth $400.
  if (!exemptFromFrequencyCap(input.kind)) {
    const cap = input.dailyCap ?? DEFAULT_DAILY_CAP;
    if (input.sentToday >= cap) {
      return { send: false, defer: 'digest', reason: `daily alert cap of ${cap} reached` };
    }
  }

  return {
    send: true,
    // A batchable alert is still sent now; it is simply allowed to be coalesced
    // with anything else pending rather than demanding its own message.
    channels: urgency === 'batchable' ? channels.filter(c => c === 'email') .concat(channels.filter(c => c !== 'email')) : channels,
    urgency,
    reason: `${input.kind} is ${urgency}`,
  };
}

/**
 * Local hour for a user's timezone, without pulling in a date library.
 *
 * Quiet hours must be in THEIR timezone — a 3am alert is only defensible if it
 * is 3am where the alert is being read, and the server's clock is irrelevant to
 * that.
 */
export function localHourFor(timezone: string | null | undefined, nowMs = Date.now()): number {
  if (!timezone) return new Date(nowMs).getUTCHours();
  try {
    const s = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone, hour: 'numeric', hour12: false,
    }).format(new Date(nowMs));
    const h = parseInt(s, 10);
    return Number.isFinite(h) ? h % 24 : new Date(nowMs).getUTCHours();
  } catch {
    // An unknown timezone must not throw inside the send path.
    return new Date(nowMs).getUTCHours();
  }
}

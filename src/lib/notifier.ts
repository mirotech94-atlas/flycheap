import 'server-only';
import { sendFareAlert, type AlertEmailInput, type AlertEmailContext } from './email';
import { queries, type SearchRow, type FareRow } from './db';
import { fmtUSD, fmtDate } from './utils';
import { cheapestByMonth } from './explore';
import { sendExpoPushToUser, inQuietHours } from './expoPush';
import { median7dForSearch } from './priceDrops';
import { APP_URL, ADMIN_URL } from './hosts';

export type NotifyKind = 'threshold' | 'price-drop' | 'digest' | 'ready';

export type NotifyResult = {
  channel: 'email' | 'sms' | 'whatsapp' | 'telegram' | 'slack' | 'push';
  ok: boolean;
  error?: string;
  id?: string;
  skipped?: string;
};

function shortMessage(opts: {
  kind: NotifyKind;
  search: SearchRow;
  fare: FareRow;
  thresholdPerAdult: number;
  pctDrop?: number;
}): string {
  const { kind, search, fare, thresholdPerAdult, pctDrop } = opts;
  const tag = kind === 'price-drop'
    ? `📉 PRICE DROP ${pctDrop ? `−${pctDrop.toFixed(0)}%` : ''}`
    : kind === 'ready'
      ? '🎯 Your fare is ready!'
      : '✈️ Cheap fare';
  const route = `${search.origin}→${search.destination}`;
  const dates = `${fmtDate(search.depart_date)}→${fmtDate(search.return_date)}`;
  const price = fmtUSD(fare.price_per_adult_usd);
  const total = fmtUSD(fare.total_price_usd);
  const vsThresh = fare.price_per_adult_usd < thresholdPerAdult
    ? `(below ${fmtUSD(thresholdPerAdult)} target)`
    : `(+${fmtUSD(fare.price_per_adult_usd - thresholdPerAdult)})`;
  return `${tag}\nEgyptAir ${route} ${dates}\n${price}/adult ${vsThresh}\nParty total: ${total}`;
}

// ---------- Twilio (SMS + WhatsApp) ----------
export async function sendTwilio(
  channel: 'sms' | 'whatsapp',
  to: string,
  body: string,
): Promise<NotifyResult> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = channel === 'sms'
    ? process.env.TWILIO_FROM_SMS
    : process.env.TWILIO_FROM_WHATSAPP;

  if (!sid || !token || !from) {
    return { channel, ok: false, skipped: `${channel.toUpperCase()} not configured (missing Twilio env vars)` };
  }
  if (!to) return { channel, ok: false, skipped: 'no destination number set' };

  const dest = channel === 'whatsapp' && !to.startsWith('whatsapp:') ? `whatsapp:${to}` : to;
  const fromAddr = channel === 'whatsapp' && !from.startsWith('whatsapp:') ? `whatsapp:${from}` : from;

  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const auth = 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64');
  const form = new URLSearchParams({ To: dest, From: fromAddr, Body: body });

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) return { channel, ok: false, error: j.message || `HTTP ${res.status}` };
    return { channel, ok: true, id: j.sid };
  } catch (e) {
    return { channel, ok: false, error: (e as Error).message };
  }
}

// ---------- Telegram ----------
async function sendTelegram(chatId: string, body: string, parseMode?: 'Markdown' | 'HTML'): Promise<NotifyResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { channel: 'telegram', ok: false, skipped: 'TELEGRAM_BOT_TOKEN not set' };
  if (!chatId) return { channel: 'telegram', ok: false, skipped: 'no telegram chat id set' };

  try {
    const payload: Record<string, unknown> = { chat_id: chatId, text: body, disable_web_page_preview: true };
    if (parseMode) payload.parse_mode = parseMode;
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const j = await res.json().catch(() => ({}));
    if (!j.ok) return { channel: 'telegram', ok: false, error: j.description || `HTTP ${res.status}` };
    return { channel: 'telegram', ok: true, id: String(j.result?.message_id ?? '') };
  } catch (e) {
    return { channel: 'telegram', ok: false, error: (e as Error).message };
  }
}

// ---------- Founder-only Slack channels ----------
// Two channels in the FlyCheap workspace, both for the operator, never for clients:
//   'admin'         → setting alert_slack_admin_target (#admin_alerts):
//                     new signups, billing events, contact-form messages.
//   'client-mirror' → setting alert_slack_target (#client_alerts):
//                     one line per fare alert sent to any client, so the operator
//                     sees everything that went out without being a recipient.
// (alert_slack_support_target is a THIRD channel: the client-facing #support
//  room where the concierge answers human messages. Keep it separate — posting
//  founder notices there would put the operator's own messages in front of the bot.)
export type FounderSlackChannel = 'admin' | 'client-mirror';

export function founderChannelId(which: FounderSlackChannel): string {
  const key = which === 'admin' ? 'alert_slack_admin_target' : 'alert_slack_target';
  return queries.getSetting(key) ?? '';
}

export async function postFounderSlack(
  which: FounderSlackChannel,
  text: string,
  blocks?: unknown[],
): Promise<NotifyResult> {
  const channel = founderChannelId(which);
  if (!channel) return { channel: 'slack', ok: false, skipped: `${which === 'admin' ? 'alert_slack_admin_target' : 'alert_slack_target'} not set` };
  return postToSlackChannel(channel, text, blocks);
}

/** Reply inside an existing thread (chat.postMessage with thread_ts). */
export async function postToSlackThread(channel: string, threadTs: string, text: string): Promise<NotifyResult> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return { channel: 'slack', ok: false, skipped: 'SLACK_BOT_TOKEN not set' };
  if (!channel || !threadTs) return { channel: 'slack', ok: false, skipped: 'no channel/thread' };
  try {
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ channel, thread_ts: threadTs, text, unfurl_links: false }),
    });
    const j = await res.json().catch(() => ({}));
    if (!j.ok) return { channel: 'slack', ok: false, error: j.error || `HTTP ${res.status}` };
    return { channel: 'slack', ok: true, id: String(j.ts ?? '') };
  } catch (e) {
    return { channel: 'slack', ok: false, error: (e as Error).message };
  }
}

/** Post a "new signup" card to #admin_alerts. Best-effort; never throws. */
export async function notifySignupToSlack(
  user: { id: number; email: string; tier?: string | null; username?: string | null; name?: string | null },
  via: 'otp' | 'magic-link',
  ip?: string | null,
): Promise<void> {
  try {
    const who = [user.name, user.username ? `@${user.username}` : null].filter(Boolean).join(' · ');
    const adminUrl = `${ADMIN_URL}/users/${user.id}`;
    await postFounderSlack(
      'admin',
      `🎉 *New signup* — ${user.email}${who ? ` (${who})` : ''}\n` +
      `*Tier:* ${user.tier ?? 'free'} · *Via:* ${via === 'otp' ? 'email code' : 'magic link'}${ip ? ` · *IP:* ${ip}` : ''}\n` +
      `<${adminUrl}|Open in admin →>`,
    );
  } catch { /* Slack is non-critical for signup */ }
}

export type BillingEventKind =
  | 'subscription_started' | 'trial_ending' | 'payment_failed' | 'payment_received' | 'cancelled';

const BILLING_LABELS: Record<BillingEventKind, string> = {
  subscription_started: '💳 *Subscription started*',
  trial_ending:         '⏳ *Trial ends in 3 days*',
  payment_failed:       '⚠️ *Payment failed*',
  payment_received:     '💰 *Payment received*',
  cancelled:            '🚫 *Subscription cancelled*',
};

/** Post a billing event card to #admin_alerts. Best-effort; never throws. */
export async function notifyBillingToSlack(
  kind: BillingEventKind,
  user: { id: number; email: string } | number | null | undefined,
  info: {
    provider: 'stripe' | 'paypal' | 'none';
    plan?: string | null; period?: string | null;
    amount?: string | null; when?: string | null; source?: string | null;
  },
): Promise<void> {
  try {
    const u = typeof user === 'number' ? queries.getUserById(user) : user;
    if (!u) return;
    const bits = [
      info.plan ? `*Plan:* ${info.plan}${info.period ? ` / ${info.period}` : ''}` : null,
      `*Provider:* ${info.provider}`,
      info.amount ? `*Amount:* ${info.amount}` : null,
      info.when ? `*When:* ${info.when}` : null,
      info.source ? `*Source:* ${info.source}` : null,
    ].filter(Boolean).join(' · ');
    await postFounderSlack(
      'admin',
      `${BILLING_LABELS[kind]} — ${u.email}\n${bits}\n<${ADMIN_URL}/users/${u.id}|Open in admin →>`,
    );
  } catch { /* Slack is non-critical for billing */ }
}

/** Post an "account deleted" card to #admin_alerts. Call BEFORE the rows are gone. Never throws. */
export async function notifyAccountDeletedToSlack(
  user: { id: number; email: string; tier?: string | null; created_at?: string | null },
  info: { by: 'self' | 'admin'; byEmail?: string | null; routes?: number | null; ip?: string | null },
): Promise<void> {
  try {
    const ageDays = user.created_at
      ? Math.max(0, Math.round((Date.now() - Date.parse(user.created_at.replace(' ', 'T') + (user.created_at.endsWith('Z') ? '' : 'Z'))) / 86_400_000))
      : null;
    const bits = [
      `*Tier:* ${user.tier ?? 'free'}`,
      typeof info.routes === 'number' ? `*Routes:* ${info.routes}` : null,
      ageDays !== null && Number.isFinite(ageDays) ? `*Account age:* ${ageDays}d` : null,
      info.by === 'admin' ? `*By:* admin${info.byEmail ? ` (${info.byEmail})` : ''}` : '*By:* the user (Settings → Danger zone)',
      info.ip ? `*IP:* ${info.ip}` : null,
    ].filter(Boolean).join(' · ');
    await postFounderSlack('admin', `🗑️ *Account deleted* — ${user.email} (id ${user.id})\n${bits}`);
  } catch { /* Slack is non-critical */ }
}

/** "$12.34 USD" from minor units; null when unknown. */
export function fmtMinorAmount(minor: number | null | undefined, currency: string | null | undefined): string | null {
  if (typeof minor !== 'number' || !Number.isFinite(minor)) return null;
  return `$${(minor / 100).toFixed(2)} ${(currency || 'usd').toUpperCase()}`;
}

// ---------- Slack channel posting (chat.postMessage) ----------
export async function postToSlackChannel(
  channel: string,
  text: string,
  blocks?: unknown[],
): Promise<NotifyResult> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return { channel: 'slack', ok: false, skipped: 'SLACK_BOT_TOKEN not set' };
  if (!channel) return { channel: 'slack', ok: false, skipped: 'no slack channel id' };
  try {
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ channel, text, ...(blocks ? { blocks } : {}) }),
    });
    const j = await res.json().catch(() => ({}));
    if (!j.ok) return { channel: 'slack', ok: false, error: j.error || `HTTP ${res.status}` };
    return { channel: 'slack', ok: true, id: String(j.ts ?? '') };
  } catch (e) {
    return { channel: 'slack', ok: false, error: (e as Error).message };
  }
}

/** Build a luxe Block Kit "deal card" for a Slack channel alert. */
function dealBlocks(opts: { origin: string; destination: string; perAdult: number; threshold: number; search: SearchRow; fare: FareRow }): unknown[] {
  const { origin, destination, perAdult, threshold, search } = opts;
  const dates = `${search.depart_date} → ${search.return_date}`;
  return [
    { type: 'header', text: { type: 'plain_text', text: `✈︎  ${origin} → ${destination}  ·  $${perAdult.toLocaleString()}`, emoji: true } },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Per adult*\n$${perAdult.toLocaleString()}` },
        { type: 'mrkdwn', text: `*Your threshold*\n$${threshold.toLocaleString()}` },
        { type: 'mrkdwn', text: `*Dates*\n${dates}` },
        { type: 'mrkdwn', text: `*Spotted*\n<!date^${Math.floor(Date.now()/1000)}^{time_secs}|just now>` },
      ],
    },
    {
      type: 'actions',
      elements: [
        { type: 'button', text: { type: 'plain_text', text: 'Open in FlyCheap', emoji: false },
          url: `${APP_URL}/explore?from=${origin}&to=${destination}`, style: 'primary' },
        { type: 'button', text: { type: 'plain_text', text: 'Snooze this watch', emoji: false },
          value: `snooze:${origin}-${destination}` },
      ],
    },
    { type: 'context', elements: [{ type: 'mrkdwn', text: '_FlyCheap watches 700 airlines, every day. `/flycheap list` to manage._' }] },
  ];
}

/** Post a deal to every Slack channel + Telegram chat that subscribed via
 *  the bots' /watch commands. Idempotent on a per-call basis. */
export async function fanoutDealToSubscribers(opts: {
  search: SearchRow; fare: FareRow; pricePerAdult: number;
}): Promise<NotifyResult[]> {
  const { search, fare, pricePerAdult } = opts;
  const out: NotifyResult[] = [];

  // Slack channel watches
  const slackSubs = queries.matchingSlackSubscriptions(search.origin, search.destination, pricePerAdult);
  for (const sub of slackSubs) {
    const text = `Fare drop · ${search.origin} → ${search.destination} now $${pricePerAdult.toLocaleString()} (your $${sub.threshold_usd.toLocaleString()} target)`;
    const blocks = dealBlocks({ origin: search.origin, destination: search.destination, perAdult: pricePerAdult, threshold: sub.threshold_usd, search, fare });
    const r = await postToSlackChannel(sub.channel_id, text, blocks);
    if (r.ok) queries.markSlackSubscriptionAlerted(sub.id);
    out.push(r);
  }

  // Telegram chat watches
  const tgSubs = queries.matchingTelegramSubscriptions(search.origin, search.destination, pricePerAdult);
  for (const sub of tgSubs) {
    const text = `🔥 *${search.origin} → ${search.destination}* now *$${pricePerAdult.toLocaleString()}*\n_Under your $${sub.threshold_usd.toLocaleString()} target · ${search.depart_date} → ${search.return_date}_\n\n[Open in FlyCheap](${APP_URL}/explore?from=${search.origin}&to=${search.destination})`;
    const r = await sendTelegram(sub.chat_id, text, 'Markdown');
    if (r.ok) queries.markTelegramSubscriptionAlerted(sub.id);
    out.push(r);
  }

  return out;
}

/**
 * Subscription alerting — makes the Slack/Telegram bots' promise actually land.
 *
 * The bot `/watch ORIGIN DEST PRICE` commands store a subscription per channel
 * (Slack) / chat (Telegram). But those routes are NOT necessarily tracked
 * `searches`, so the normal poller never prices them. This function — run on
 * every poll cycle — walks every distinct subscribed route, looks up its
 * current cheapest fare, and fans out a deal card to any subscriber whose
 * target price is met (deduped to once per 12h via the matching queries).
 *
 * This is what the marketing video advertises: "every drop posts in the
 * channel" / "your phone buzzes the moment the price falls under your target."
 */
export async function runSubscriptionAlerts(): Promise<{ routes: number; posted: number; errors: number }> {
  const routes = queries.distinctSubscriptionRoutes();
  let posted = 0;
  let errors = 0;

  for (const { origin, destination } of routes) {
    // Cheapest current fare for this route across the next 12 months.
    let cheapest: { price: number; depart_date: string; return_date: string | null } | null = null;
    try {
      const months = await cheapestByMonth(origin, destination);
      for (const m of months) {
        if (m.price > 0 && (!cheapest || m.price < cheapest.price)) {
          cheapest = { price: m.price, depart_date: m.depart_date, return_date: m.return_date };
        }
      }
    } catch {
      errors++;
      continue;
    }
    if (!cheapest) continue;

    // Synthesize the minimal search/fare shape fanoutDealToSubscribers needs.
    // (dealBlocks only reads origin/destination/dates; fare is unused there.)
    const search = {
      origin, destination,
      depart_date: cheapest.depart_date ? cheapest.depart_date.slice(0, 10) : '',
      return_date: cheapest.return_date ? cheapest.return_date.slice(0, 10) : (cheapest.depart_date ? cheapest.depart_date.slice(0, 10) : ''),
    } as SearchRow;
    const fare = { price_per_adult_usd: Math.round(cheapest.price) } as FareRow;

    try {
      const results = await fanoutDealToSubscribers({ search, fare, pricePerAdult: Math.round(cheapest.price) });
      posted += results.filter(r => r.ok).length;
      errors += results.filter(r => !r.ok && !r.skipped).length;
    } catch {
      errors++;
    }
  }

  return { routes: routes.length, posted, errors };
}

/**
 * Context for the Going/Kayak-style alert email: the route's "normal" price
 * (7-day median — same number the anomaly detector uses), the previous alert
 * for this search (poller inserts the new alerts_sent row AFTER notify, so
 * lastAlertForSearch is still the prior one here), 30 days of daily-min
 * history for the inline sparkline, and cached ±3-day date pairs that also
 * work. Every lookup is best-effort — a missing table or a stub search
 * (id 0 from "Send test") just yields empty context.
 */
function buildAlertContext(opts: { search: SearchRow; fare: FareRow; median7d?: number | null }): AlertEmailContext {
  const { search, fare } = opts;
  const ctx: AlertEmailContext = { median7d: opts.median7d ?? null, lastAlert: null, history: [], flexDates: [] };
  if (!search.id) return ctx;
  try { if (ctx.median7d == null) ctx.median7d = median7dForSearch(search.id); } catch { /* best-effort */ }
  try {
    const last = queries.lastAlertForSearch(search.id);
    if (last) ctx.lastAlert = { price_per_adult_usd: last.price_per_adult_usd, sent_at: last.sent_at };
  } catch { /* best-effort */ }
  try {
    ctx.history = queries.fareHistoryDaily(search.id, 30).map(r => ({ day: r.day, price: r.per_adult_usd }));
  } catch { /* best-effort */ }
  try {
    ctx.flexDates = queries.flexDateOptions(search.origin, search.depart_date, search.return_date, 3)
      .filter(f => !(f.outbound_date === search.depart_date && f.return_date === search.return_date))
      .filter(f => f.per_adult_usd <= fare.price_per_adult_usd * 1.05)
      .slice(0, 3)
      .map(f => ({ depart: f.outbound_date, return: f.return_date, price: f.per_adult_usd }));
  } catch { /* best-effort */ }
  return ctx;
}

// ---------- Public: fan-out to every configured channel ----------
export async function notifyAll(opts: {
  kind: NotifyKind;
  search: SearchRow;
  fare: FareRow;
  thresholdPerAdult: number;
  pctDrop?: number;
  /** 7-day median the anomaly detector computed (price-drop alerts). Looked up when absent. */
  median7d?: number | null;
  /** Per-tenant: when set, look up the owner's email/phone/channels first. */
  ownerUserId?: number;
}): Promise<NotifyResult[]> {
  const uid = opts.ownerUserId;

  // Per-tenant resolution with fallbacks: user_settings → user.email/sender_email
  // → global settings → env. This is what makes alerts go to the right person.
  const ownerUser = uid ? queries.getUserById(uid) : null;
  const email = (uid && queries.getUserSetting(uid, 'alert_email'))
              || ownerUser?.email
              || queries.getSetting('alert_email')
              || process.env.ALERT_EMAIL
              || '';
  // SMS: prefer the verified opt-in number; fall back to legacy alert_phone only if the user has never gone through verification.
  const smsVerifiedPhone = uid ? queries.getUserSetting(uid, 'sms_phone') : undefined;
  const smsOptIn         = uid ? queries.getUserSetting(uid, 'sms_opt_in') : undefined;
  const smsVerified      = uid ? queries.getUserSetting(uid, 'sms_verified') : undefined;
  const smsEligible      = smsOptIn === 'true' && smsVerified === 'true' && !!smsVerifiedPhone;
  // A client's alert only ever goes to contacts THAT client set on their own
  // account. The platform-wide alert_phone / alert_telegram_chat_id (and the
  // env equivalents) are the founder's contacts; they apply only to ownerless
  // alerts (no uid). Without this guard every paid client's SMS/WhatsApp/
  // Telegram alert fell through to the founder's phone and Telegram.
  const phone   = smsEligible
    ? (smsVerifiedPhone as string)
    : uid
      ? (queries.getUserSetting(uid, 'alert_phone') || '')
      : (queries.getSetting('alert_phone') || process.env.ALERT_PHONE || '');
  const phoneWa = uid
    ? (queries.getUserSetting(uid, 'alert_phone_whatsapp') || phone)
    : (queries.getSetting('alert_phone_whatsapp') || process.env.ALERT_PHONE_WHATSAPP || phone);
  const tgChat  = uid
    ? (queries.getUserSetting(uid, 'alert_telegram_chat_id') || '')
    : (queries.getSetting('alert_telegram_chat_id') || process.env.ALERT_TELEGRAM_CHAT_ID || '');

  // Pro/Enterprise can use SMS/WhatsApp/Telegram; Free tier is email-only.
  const tier = ownerUser?.tier ?? 'free';
  const userChannels: string =
    (uid ? queries.getUserSetting(uid, 'alert_channels') : undefined)
    ?? queries.getSetting('alert_channels')
    ?? 'email';
  let channels = userChannels.split(',').map(s => s.trim()).filter(Boolean);
  if (tier === 'free') channels = channels.filter(c => c === 'email');

  const body = shortMessage(opts);
  const results: NotifyResult[] = [];

  if (channels.includes('email') && email) {
    const emailInput: AlertEmailInput = {
      to: email,
      search: opts.search,
      fare: opts.fare,
      thresholdPerAdult: opts.thresholdPerAdult,
      kind: (opts.kind === 'digest' || opts.kind === 'ready') ? 'threshold' : opts.kind,
      pctDrop: opts.pctDrop,
      median7d: opts.median7d,
      context: buildAlertContext({ search: opts.search, fare: opts.fare, median7d: opts.median7d }),
    };
    const r = await sendFareAlert(emailInput);
    results.push({ channel: 'email', ok: r.ok, error: r.ok ? undefined : r.error, id: r.ok ? r.id : undefined });
  }
  if (channels.includes('sms')) {
    // Toll-free verification compliance: only send SMS to a verified, opted-in number.
    if (uid && !smsEligible) {
      results.push({ channel: 'sms', ok: false, skipped: 'SMS not verified or opted out' });
    } else {
      results.push(await sendTwilio('sms', phone, body));
    }
  }
  if (channels.includes('whatsapp')) {
    results.push(await sendTwilio('whatsapp', phoneWa, body));
  }
  if (channels.includes('telegram')) {
    results.push(await sendTelegram(tgChat, body));
  }

  // Public channel/chat fan-out: anyone who subscribed via the bot commands
  // (Slack /flycheap watch, Telegram /watch) for this exact route gets pinged
  // when the per-adult price comes in under their personal threshold.
  try {
    const fanned = await fanoutDealToSubscribers({
      search: opts.search,
      fare: opts.fare,
      pricePerAdult: opts.fare.price_per_adult_usd,
    });
    results.push(...fanned);
  } catch (e) {
    results.push({ channel: 'slack', ok: false, error: (e as Error).message });
  }

  // Native push to the FlyCheap mobile app. Fires whenever the owner has
  // registered devices, push isn't disabled, and we're outside quiet hours.
  // `data` carries enough for the app to deep-link to the fare on tap.
  if (uid && queries.getUserSetting(uid, 'push_enabled') !== 'false' && !inQuietHours(uid)) {
    try {
      const route = `${opts.search.origin} → ${opts.search.destination}`;
      const title = opts.kind === 'price-drop' ? `Price drop: ${route}` : `Fare alert: ${route}`;
      const push = await sendExpoPushToUser(uid, {
        title,
        body: `${body}`,
        sound: 'alert.wav', // distinct fare-alert chime (bundled in the app)
        data: {
          type: opts.kind,
          fareId: opts.fare.id,
          searchId: opts.search.id,
          route,
          price: opts.fare.price_per_adult_usd,
          threshold: opts.thresholdPerAdult,
        },
      });
      results.push({ channel: 'push', ok: push.sent > 0, ...(push.sent ? {} : { skipped: 'no devices' }) });
    } catch (e) {
      results.push({ channel: 'push', ok: false, error: (e as Error).message });
    }
  }

  // Founder mirror → #client_alerts. Deliberately NOT pushed into `results`:
  // the poller treats "any result ok" as "the client was alerted", and a
  // successful mirror must never mask a delivery that failed for the client.
  try {
    const delivered = results.filter(r => r.ok).map(r => r.channel);
    const failed = results
      .filter(r => !r.ok && !r.skipped)
      .map(r => `${r.channel}${r.error ? ` (${r.error})` : ''}`);
    const who = ownerUser ? `${ownerUser.email} · ${tier}` : (email || 'unknown recipient');
    const kindLabel =
      opts.kind === 'price-drop' ? `Price drop${opts.pctDrop ? ` −${opts.pctDrop.toFixed(0)}%` : ''}`
      : opts.kind === 'ready' ? 'Ready alert'
      : opts.kind === 'digest' ? 'Digest'
      : 'Threshold alert';
    const route = `${opts.search.origin}→${opts.search.destination} ` +
      `${fmtDate(opts.search.depart_date)}→${fmtDate(opts.search.return_date)}`;
    await postFounderSlack(
      'client-mirror',
      `📤 *${kindLabel}* → ${who}\n` +
      `${route} · ${fmtUSD(opts.fare.price_per_adult_usd)}/adult vs ${fmtUSD(opts.thresholdPerAdult)} target\n` +
      `✅ ${delivered.length ? delivered.join(', ') : 'nothing delivered'}` +
      `${failed.length ? `\n❌ ${failed.join(', ')}` : ''}`,
    );
  } catch { /* mirror is non-critical */ }

  return results;
}

// Standalone helper for the chat tool / "Send test" button
export async function sendTestNotification(
  channel: 'email' | 'sms' | 'whatsapp' | 'telegram',
): Promise<NotifyResult> {
  const stub: SearchRow = {
    id: 0, origin: 'JFK', destination: 'CAI',
    depart_date: '2026-12-20', return_date: '2027-01-05',
    adults: 4, infants: 1, active: 1, created_at: new Date().toISOString(),
    snoozed_until: null,
    user_id: 1,
  };
  const stubFare: FareRow = {
    id: 0, search_id: 0, polled_at: new Date().toISOString(),
    total_price_usd: 3960, base_price_usd: 3600, taxes_fees_usd: 360,
    price_per_adult_usd: 900,
    outbound_flight_no: 'MS986', return_flight_no: 'MS985',
    outbound_depart_iso: '2026-12-20T12:00:00-05:00',
    return_depart_iso: '2027-01-05T05:00:00+02:00',
    raw_json: null, provider: 'travelpayouts',
  };
  const body = shortMessage({ kind: 'price-drop', search: stub, fare: stubFare, thresholdPerAdult: 1700, pctDrop: 12 })
             + '\n\n(test message from FlyCheap)';
  const phone   = queries.getSetting('alert_phone')          ?? '';
  const phoneWa = queries.getSetting('alert_phone_whatsapp') ?? phone;
  const tgChat  = queries.getSetting('alert_telegram_chat_id') ?? '';
  const email   = queries.getSetting('alert_email')          ?? '';

  switch (channel) {
    case 'email': {
      if (!email) return { channel, ok: false, skipped: 'no email set' };
      const r = await sendFareAlert({
        to: email, search: stub, fare: stubFare, thresholdPerAdult: 1700, kind: 'price-drop', pctDrop: 12,
        // Synthetic context so the test email exercises every block of the template.
        context: {
          median7d: 1023,
          lastAlert: { price_per_adult_usd: 960, sent_at: new Date(Date.now() - 3 * 86400000).toISOString() },
          history: Array.from({ length: 30 }, (_, i) => ({
            day: new Date(Date.now() - (29 - i) * 86400000).toISOString().slice(0, 10),
            price: Math.round(1040 - i * 3 + 40 * Math.sin(i / 3)),
          })).concat([{ day: new Date().toISOString().slice(0, 10), price: 900 }]),
          flexDates: [{ depart: '2026-12-18', return: '2027-01-03', price: 890 }],
        },
      });
      return { channel, ok: r.ok, error: r.ok ? undefined : r.error, id: r.ok ? r.id : undefined };
    }
    case 'sms':      return sendTwilio('sms', phone, body);
    case 'whatsapp': return sendTwilio('whatsapp', phoneWa, body);
    case 'telegram': return sendTelegram(tgChat, body);
  }
}

import 'server-only';
import { sendFareAlert, type AlertEmailInput } from './email';
import { queries, type SearchRow, type FareRow } from './db';
import { fmtUSD, fmtDate } from './utils';

export type NotifyKind = 'threshold' | 'price-drop' | 'digest';

export type NotifyResult = {
  channel: 'email' | 'sms' | 'whatsapp' | 'telegram';
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
async function sendTelegram(chatId: string, body: string): Promise<NotifyResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { channel: 'telegram', ok: false, skipped: 'TELEGRAM_BOT_TOKEN not set' };
  if (!chatId) return { channel: 'telegram', ok: false, skipped: 'no telegram chat id set' };

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: body, disable_web_page_preview: true }),
    });
    const j = await res.json().catch(() => ({}));
    if (!j.ok) return { channel: 'telegram', ok: false, error: j.description || `HTTP ${res.status}` };
    return { channel: 'telegram', ok: true, id: String(j.result?.message_id ?? '') };
  } catch (e) {
    return { channel: 'telegram', ok: false, error: (e as Error).message };
  }
}

// ---------- Public: fan-out to every configured channel ----------
export async function notifyAll(opts: {
  kind: NotifyKind;
  search: SearchRow;
  fare: FareRow;
  thresholdPerAdult: number;
  pctDrop?: number;
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
  const phone   = smsEligible
    ? (smsVerifiedPhone as string)
    : ((uid && queries.getUserSetting(uid, 'alert_phone'))          || queries.getSetting('alert_phone')          || process.env.ALERT_PHONE   || '');
  const phoneWa = (uid && queries.getUserSetting(uid, 'alert_phone_whatsapp')) || queries.getSetting('alert_phone_whatsapp') || process.env.ALERT_PHONE_WHATSAPP || phone;
  const tgChat  = (uid && queries.getUserSetting(uid, 'alert_telegram_chat_id'))|| queries.getSetting('alert_telegram_chat_id')|| process.env.ALERT_TELEGRAM_CHAT_ID || '';

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
      kind: opts.kind === 'digest' ? 'threshold' : opts.kind,
      pctDrop: opts.pctDrop,
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
             + '\n\n(test message from Cheapflight Tracker)';
  const phone   = queries.getSetting('alert_phone')          ?? '';
  const phoneWa = queries.getSetting('alert_phone_whatsapp') ?? phone;
  const tgChat  = queries.getSetting('alert_telegram_chat_id') ?? '';
  const email   = queries.getSetting('alert_email')          ?? '';

  switch (channel) {
    case 'email': {
      if (!email) return { channel, ok: false, skipped: 'no email set' };
      const r = await sendFareAlert({ to: email, search: stub, fare: stubFare, thresholdPerAdult: 1700 });
      return { channel, ok: r.ok, error: r.ok ? undefined : r.error, id: r.ok ? r.id : undefined };
    }
    case 'sms':      return sendTwilio('sms', phone, body);
    case 'whatsapp': return sendTwilio('whatsapp', phoneWa, body);
    case 'telegram': return sendTelegram(tgChat, body);
  }
}

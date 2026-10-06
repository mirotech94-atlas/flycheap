import { queries } from '@/lib/db';
import { verifyTwilioSignature } from '@/lib/twilioSignature';

export const dynamic = 'force-dynamic';

const STOP_WORDS = new Set(['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT']);
const HELP_WORDS = new Set(['HELP', 'INFO']);
const START_WORDS = new Set(['START', 'YES', 'UNSTOP']);

function twiml(message: string | null): Response {
  const xml = message
    ? `<?xml version="1.0" encoding="UTF-8"?>\n<Response><Message>${message}</Message></Response>`
    : `<?xml version="1.0" encoding="UTF-8"?>\n<Response></Response>`;
  return new Response(xml, { headers: { 'Content-Type': 'text/xml; charset=utf-8' } });
}

const forbidden = () => new Response('Forbidden', { status: 403 });

let warnedUnverified = false;

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) return forbidden();

  // Only Twilio may drive this: an unsigned STOP/START lets anyone flip a
  // user's SMS subscription by knowing their phone number.
  //
  // This used to fail OPEN when TWILIO_WEBHOOK_URL was unset, for a real
  // reason: the signature covers the exact public URL from the Twilio console,
  // the app cannot reliably reconstruct that behind the proxy, and refusing a
  // genuine STOP has carrier consequences. Fail-open was the lesser risk while
  // SMS was a live channel.
  //
  // It is not a live channel. Twilio is retired (2026-10-06, Miro's call) and
  // SMS never delivered anyway — error 30034, no A2P campaign. So there is no
  // legitimate inbound message left to protect, and the only thing the open
  // path still protects is a forged STOP flipping a stranger's subscription.
  //
  // Now: a verified signature, or nothing. If Twilio is ever reinstated, set
  // TWILIO_WEBHOOK_URL to the console URL and this starts accepting again.
  const webhookUrl = process.env.TWILIO_WEBHOOK_URL?.trim();
  if (!webhookUrl) {
    if (!warnedUnverified) {
      warnedUnverified = true;
      console.warn('[twilio] inbound refused: TWILIO_WEBHOOK_URL is not set, so no signature can be verified. Twilio is retired; set it only if SMS comes back.');
    }
    return forbidden();
  }
  {
    const params: Record<string, string[]> = {};
    for (const [k, v] of form.entries()) (params[k] ??= []).push(typeof v === 'string' ? v : '');
    if (!verifyTwilioSignature({
      authToken: process.env.TWILIO_AUTH_TOKEN,
      url: webhookUrl,
      params,
      signature: req.headers.get('x-twilio-signature'),
    })) {
      return forbidden();
    }
  }

  const from = String(form.get('From') ?? '').trim();
  const bodyRaw = String(form.get('Body') ?? '').trim();
  const body = bodyRaw.toUpperCase();

  if (!from || !body) return twiml(null);

  const userId = queries.findUserBySetting('sms_phone', from);

  if (STOP_WORDS.has(body)) {
    if (userId) queries.setUserSetting(userId, 'sms_opt_in', 'false');
    return twiml(`FlyCheap: You've been unsubscribed from SMS alerts. Reply START to re-subscribe.`);
  }

  if (HELP_WORDS.has(body)) {
    return twiml(`FlyCheap fare alerts. Manage at https://my.flycheap.live/settings. Reply STOP to cancel. Msg&data rates may apply.`);
  }

  if (START_WORDS.has(body)) {
    if (userId) {
      const wasVerified = queries.getUserSetting(userId, 'sms_verified') === 'true';
      if (wasVerified) queries.setUserSetting(userId, 'sms_opt_in', 'true');
    }
    return twiml(`FlyCheap: You're re-subscribed to SMS alerts. Reply STOP to cancel.`);
  }

  // No auto-reply to random texts (Twilio compliance: only respond to keywords).
  return twiml(null);
}

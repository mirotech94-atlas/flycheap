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
  // Enforced once TWILIO_WEBHOOK_URL is set — the signature covers the exact
  // public URL configured in the Twilio console, and behind the proxy the app
  // cannot reliably reconstruct it, so guessing would refuse real traffic
  // (including STOP, which carriers require us to honour). Until it is set the
  // check is inert and says so, once, in the log. Once set, a missing auth
  // token fails closed.
  const webhookUrl = process.env.TWILIO_WEBHOOK_URL?.trim();
  if (webhookUrl) {
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
  } else if (!warnedUnverified) {
    warnedUnverified = true;
    console.warn('[twilio] TWILIO_WEBHOOK_URL is not set — inbound SMS signatures are NOT verified. Set it to the URL in the Twilio console.');
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

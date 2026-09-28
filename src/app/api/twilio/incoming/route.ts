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

/** The public URL Twilio calls. Set TWILIO_WEBHOOK_URL to exactly what is in
 *  the Twilio console; otherwise rebuild it from the proxy's forwarded headers. */
function publicUrl(req: Request): string {
  const configured = process.env.TWILIO_WEBHOOK_URL?.trim();
  if (configured) return configured;
  const u = new URL(req.url);
  const proto = req.headers.get('x-forwarded-proto') ?? u.protocol.replace(':', '');
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? u.host;
  return `${proto}://${host}${u.pathname}${u.search}`;
}

const forbidden = () => new Response('Forbidden', { status: 403 });

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) return forbidden();

  // Only Twilio may drive this: an unsigned STOP/START would let anyone flip
  // a user's SMS subscription by knowing their phone number. No auth token
  // configured means we cannot tell, so refuse.
  const params: Record<string, string[]> = {};
  for (const [k, v] of form.entries()) (params[k] ??= []).push(typeof v === 'string' ? v : '');
  if (!verifyTwilioSignature({
    authToken: process.env.TWILIO_AUTH_TOKEN,
    url: publicUrl(req),
    params,
    signature: req.headers.get('x-twilio-signature'),
  })) {
    return forbidden();
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

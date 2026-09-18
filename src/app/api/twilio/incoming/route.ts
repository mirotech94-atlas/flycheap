import { queries } from '@/lib/db';

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

export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  if (!form) return twiml(null);

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

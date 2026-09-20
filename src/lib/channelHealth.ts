import 'server-only';
import type { Channel } from './alertPolicy';

/**
 * Which alert channels can actually deliver right now.
 *
 * The distinction this exists to enforce: TIER_LIMITS.channels says what a plan
 * PERMITS. This says what the product can SEND. They were being conflated on
 * the pricing page, which advertised WhatsApp on Pro while TWILIO_FROM_WHATSAPP
 * was unset — every WhatsApp alert would have returned "not configured".
 *
 * Mirrors the real guards in notifier.ts. If those change, this must too; the
 * test asserts they agree about the shape of the check.
 */
export function deliverableChannels(): Channel[] {
  const out: Channel[] = [];

  // Email: Resend. The sending DOMAIN may be unverified — the service falls
  // back to a verified sender — but mail does go out, so email is deliverable.
  if (process.env.RESEND_API_KEY) out.push('email');

  const twilio = !!process.env.TWILIO_ACCOUNT_SID && !!process.env.TWILIO_AUTH_TOKEN;
  if (twilio && process.env.TWILIO_FROM_SMS) out.push('sms');
  if (twilio && process.env.TWILIO_FROM_WHATSAPP) out.push('whatsapp');

  if (process.env.TELEGRAM_BOT_TOKEN) out.push('telegram');

  // Push is browser-side and needs no server credential, but it is only real
  // once VAPID keys exist for the subscription to be signed with.
  if (process.env.VAPID_PRIVATE_KEY || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) out.push('push');

  return out;
}

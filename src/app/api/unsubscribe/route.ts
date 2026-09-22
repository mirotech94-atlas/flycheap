import { NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { queries } from '@/lib/db';

export const dynamic = 'force-dynamic';

// Email-unsubscribe handler. Token is HMAC-SHA256(SHA256_SECRET || ALERT_EMAIL_SECRET || RESEND_API_KEY, email).
// Stateless — no DB lookup needed; the token itself proves the user owns the address.
// On click we set their `alert_channels` user-setting to empty (suppresses email + everything else).

function unsubSecret(): string {
  return process.env.UNSUB_SECRET
      || process.env.ALERT_EMAIL_SECRET
      || process.env.RESEND_API_KEY
      || 'default-fareintel-unsub-secret';
}

export function unsubscribeToken(email: string): string {
  return crypto.createHmac('sha256', unsubSecret())
    .update(email.trim().toLowerCase())
    .digest('base64url').slice(0, 32);
}

export function unsubscribeUrl(email: string, baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, '')}/api/unsubscribe?e=${encodeURIComponent(email)}&t=${unsubscribeToken(email)}`;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const email = (url.searchParams.get('e') ?? '').trim().toLowerCase();
  const token = url.searchParams.get('t') ?? '';
  if (!email || token !== unsubscribeToken(email)) {
    return new Response(htmlPage('Invalid unsubscribe link', `That link is malformed or has expired. If you keep getting unwanted emails, contact support@flycheap.live.`, false), {
      status: 400, headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
  const user = queries.getUserByEmail(email);
  if (!user) {
    return new Response(htmlPage('Already unsubscribed', `We couldn't find an account for ${email}. You won't receive further emails.`, true), {
      status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
  // Disable all alert channels for this user (free tier respects this; pro/enterprise can re-enable in Settings)
  queries.setUserSetting(user.id, 'alert_channels', '');
  return new Response(htmlPage(
    "You're unsubscribed",
    `${email} will no longer receive fare alerts or digests. Re-enable any time at <a href="https://my.flycheap.live/settings" style="color:#1F615D">Settings → Alerts</a>.`,
    true
  ), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

function htmlPage(title: string, body: string, ok: boolean): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
/* A standalone document: it never loads the app stylesheet, so the editorial
   palette is written out as literals here, the same way the email templates
   do it. Light only, flat, square, no shadow, no gradient. */
body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;background:#FBFAF7;margin:0;padding:60px 20px;color:#14181B}
.card{max-width:480px;margin:auto;background:#FFFFFF;border:1px solid #E6E2DA;padding:32px;text-align:center}
.icon{font-size:15px;letter-spacing:.16em;text-transform:uppercase;font-weight:600;color:${ok ? '#3E7D5A' : '#B4453C'};margin:0 0 14px}
h1{margin:0 0 10px;font-family:Newsreader,Georgia,serif;font-weight:400;font-size:28px;letter-spacing:-.02em;color:#14181B}
p{color:#3B3833;line-height:1.5;font-size:14px}
a{color:#1F615D}
a.btn{display:inline-block;background:#14181B;color:#FFFFFF;padding:12px 22px;text-decoration:none;font-weight:600;font-size:12.5px;margin-top:18px}
</style></head><body><div class="card">
<div class="icon">${ok ? 'Unsubscribed' : 'Link problem'}</div>
<h1>${title}</h1>
<p>${body}</p>
<a class="btn" href="https://flycheap.live/">Back to FlyCheap</a>
</div></body></html>`;
}

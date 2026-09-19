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
    return new Response(htmlPage('Invalid unsubscribe link', `That link is malformed or has expired. If you keep getting unwanted emails, contact support@fareintel.com.`, false), {
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
    `${email} will no longer receive fare alerts or digests. Re-enable any time at <a href="https://my.flycheap.live/settings" style="color:#0a3a6b">Settings → Alerts</a>.`,
    true
  ), { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

function htmlPage(title: string, body: string, ok: boolean): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;background:#f4f6fb;margin:0;padding:60px 20px;color:#0b1220}
.card{max-width:480px;margin:auto;background:white;border:1px solid #e5e9f1;border-radius:14px;padding:32px;box-shadow:0 8px 24px -12px rgba(15,23,42,.08);text-align:center}
.icon{width:64px;height:64px;border-radius:18px;background:${ok ? 'linear-gradient(135deg,#10b981,#059669)' : 'linear-gradient(135deg,#ef4444,#b91c1c)'};color:white;display:grid;place-items:center;margin:0 auto 16px;font-size:32px}
h1{margin:0 0 8px;font-size:24px;color:#0a3a6b}
p{color:#475569;line-height:1.5}
a.btn{display:inline-block;background:#0a3a6b;color:white;padding:12px 22px;border-radius:10px;text-decoration:none;font-weight:600;margin-top:16px}
</style></head><body><div class="card">
<div class="icon">${ok ? '✓' : '!'}</div>
<h1>${title}</h1>
<p>${body}</p>
<a class="btn" href="https://flycheap.live/">Back to FlyCheap</a>
</div></body></html>`;
}

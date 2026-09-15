import { NextResponse } from 'next/server';
import { z } from 'zod';
import { Resend } from 'resend';
import { queries } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const Body = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(200),
  subject: z.string().trim().max(120).optional(),
  message: z.string().trim().min(10).max(4000),
  // honeypot — if filled, it's a bot. Always succeed silently so it doesn't iterate.
  company: z.string().max(0).optional(),
});

function clientIp(req: Request): string {
  return (req.headers.get('x-forwarded-for') ?? '').split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || 'unknown';
}

export async function POST(req: Request) {
  const json = await req.json().catch(() => ({}));
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'Please fill name, valid email, and a message ≥ 10 chars.' }, { status: 400 });
  }
  const { name, email, subject, message, company } = parsed.data;

  // Honeypot — quietly succeed so spammers think they got through.
  if (company && company.length > 0) {
    return NextResponse.json({ ok: true });
  }

  const ip = clientIp(req);
  // Rate limit: 3 messages per IP per 10 min, 10 per email per 24h.
  if (!queries.rateLimitCheck('contact_ip', ip, 3, 600)) {
    return NextResponse.json({ ok: false, error: 'Too many messages from your network. Try again in a few minutes.' }, { status: 429 });
  }
  if (!queries.rateLimitCheck('contact_email', email.toLowerCase(), 10, 86_400)) {
    return NextResponse.json({ ok: false, error: 'Daily message limit reached for this email.' }, { status: 429 });
  }

  // Audit + email send.
  const user = await getCurrentUser();
  const supportTo = (process.env.CONTACT_INBOX || process.env.ADMIN_EMAILS?.split(',')[0]?.trim() || queries.getSetting('alert_email') || '').trim();
  if (!supportTo) {
    return NextResponse.json({ ok: false, error: 'Contact inbox not configured.' }, { status: 500 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // Still record the audit so messages aren't lost even if email is misconfigured.
    queries.insertAudit({
      user_id: user?.id ?? null, email: user?.email ?? email,
      action: 'contact.message', entity: 'contact-form',
      detail: { from: { name, email }, subject, message, ip, note: 'RESEND_API_KEY missing — message recorded only' },
      ip,
    });
    return NextResponse.json({ ok: true });
  }

  const resend = new Resend(apiKey);
  const { supportFrom } = await import('@/lib/senders');
  const from = supportFrom('FlyCheap Support');
  const subjectLine = subject ? `[Contact] ${subject}` : `[Contact] New message from ${name}`;
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;max-width:600px;margin:auto;padding:24px;color:#0f172a">
      <h2 style="color:#0a3a6b;margin:0 0 12px">New contact form message</h2>
      <table style="width:100%;border-collapse:collapse;margin:12px 0">
        <tr><td style="padding:6px 0;color:#64748b;width:120px">From</td><td style="padding:6px 0"><strong>${escapeHtml(name)}</strong> &lt;${escapeHtml(email)}&gt;</td></tr>
        ${subject ? `<tr><td style="padding:6px 0;color:#64748b">Subject</td><td style="padding:6px 0">${escapeHtml(subject)}</td></tr>` : ''}
        ${user ? `<tr><td style="padding:6px 0;color:#64748b">Signed-in as</td><td style="padding:6px 0">${escapeHtml(user.email)} (id ${user.id}, ${escapeHtml(user.tier)})</td></tr>` : '<tr><td style="padding:6px 0;color:#64748b">Signed in</td><td style="padding:6px 0">no</td></tr>'}
        <tr><td style="padding:6px 0;color:#64748b">IP</td><td style="padding:6px 0;font-family:monospace">${escapeHtml(ip)}</td></tr>
      </table>
      <div style="background:#f8fafc;border-left:3px solid #0a3a6b;padding:14px;border-radius:6px;white-space:pre-wrap;color:#0f172a">${escapeHtml(message)}</div>
      <p style="color:#94a3b8;font-size:12px;margin-top:18px">Reply directly to this email — the user&apos;s address is set as Reply-To.</p>
    </div>
  `;
  try {
    const r = await resend.emails.send({
      from, to: supportTo, subject: subjectLine, html,
      replyTo: email,
    });
    if (r.error) {
      return NextResponse.json({ ok: false, error: r.error.message }, { status: 500 });
    }
    queries.insertAudit({
      user_id: user?.id ?? null, email: user?.email ?? email,
      action: 'contact.message', entity: 'contact-form',
      detail: { from: { name, email }, subject, resend_id: r.data?.id, ip },
      ip,
    });

    // Mirror the message into #admin_alerts (founder channel, if configured).
    // Best-effort — a Slack failure must not fail the contact submission;
    // the email already went through and the audit row is durable.
    try {
      const { postFounderSlack } = await import('@/lib/notifier');
      const who = user ? `${user.email} (id ${user.id}, ${user.tier})` : 'not signed in';
      await postFounderSlack(
        'admin',
        `📨 *New support message*\n*From:* ${name} <${email}> — ${who}\n${subject ? `*Subject:* ${subject}\n` : ''}*IP:* ${ip}\n\n${message}`,
      );
    } catch {
      // swallow — Slack mirroring is non-critical
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

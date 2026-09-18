import 'server-only';
import { Resend } from 'resend';
import { queries } from './db';
import { APP_URL, ADMIN_URL } from './hosts';
import { ticketReceivedEmail, ticketReplyEmail } from './emailTemplates';

/**
 * Support-ticket side effects, shared by the contact form, the client Support
 * screen and the admin reply action. Every function is best-effort: a mail or
 * Slack failure never throws, because the ticket row is already durable by the
 * time these run.
 */

const clientThreadUrl = (ref: string) => `${APP_URL.replace(/\/$/, '')}/support/${ref}`;
const adminThreadUrl = (ref: string) => `${ADMIN_URL.replace(/\/$/, '')}/admin/tickets/${ref}`;

/** Where operator notifications land (same resolution the contact form used). */
export function operatorInbox(): string {
  return (process.env.CONTACT_INBOX
    || process.env.ADMIN_EMAILS?.split(',')[0]?.trim()
    || queries.getSetting('alert_email')
    || '').trim();
}

async function slack(channel: 'admin', text: string): Promise<void> {
  try {
    const { postFounderSlack } = await import('./notifier');
    await postFounderSlack(channel, text);
  } catch { /* Slack mirroring is non-critical */ }
}

/** Client → us: email the operator inbox + mirror to Slack, with the ref and a link to triage. */
export async function notifyOperatorNewTicket(t: {
  ref: string; name: string; email: string; subject: string; body: string; ip?: string | null;
  who?: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = operatorInbox();
  if (apiKey && to) {
    try {
      const { supportFrom } = await import('./senders');
      const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const html = `
        <div style="font-family:-apple-system,Segoe UI,sans-serif;max-width:600px;margin:auto;padding:24px;color:#0f172a">
          <h2 style="color:#0a3a6b;margin:0 0 4px">New ticket ${esc(t.ref)}</h2>
          <p style="margin:0 0 12px;color:#475569">${esc(t.subject)}</p>
          <table style="width:100%;border-collapse:collapse;margin:0 0 12px;font-size:14px">
            <tr><td style="padding:5px 0;color:#64748b;width:110px">From</td><td style="padding:5px 0"><strong>${esc(t.name)}</strong> &lt;${esc(t.email)}&gt;</td></tr>
            ${t.who ? `<tr><td style="padding:5px 0;color:#64748b">Account</td><td style="padding:5px 0">${esc(t.who)}</td></tr>` : ''}
            ${t.ip ? `<tr><td style="padding:5px 0;color:#64748b">IP</td><td style="padding:5px 0;font-family:monospace">${esc(t.ip)}</td></tr>` : ''}
          </table>
          <div style="background:#f8fafc;border-left:3px solid #0a3a6b;padding:14px;border-radius:6px;white-space:pre-wrap">${esc(t.body)}</div>
          <p style="margin:16px 0 0"><a href="${adminThreadUrl(t.ref)}" style="color:#0a3a6b;font-weight:600">Open ${esc(t.ref)} in the admin queue →</a></p>
        </div>`;
      await new Resend(apiKey).emails.send({
        from: supportFrom('FlyCheap Support'), to, replyTo: t.email,
        subject: `[${t.ref}] ${t.subject}`, html,
      });
    } catch { /* email best-effort; the ticket row is already durable */ }
  }
  await slack('admin',
    `🎫 *New support ticket ${t.ref}*\n*From:* ${t.name} <${t.email}>${t.who ? ` — ${t.who}` : ''}\n*Subject:* ${t.subject}\n\n${t.body}\n\n${adminThreadUrl(t.ref)}`);
}

/** Us → client: send the acknowledgement email for a freshly opened ticket. */
export async function sendTicketAck(t: { to: string; ref: string; name?: string; subject: string }): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;
  try {
    const { supportFrom } = await import('./senders');
    const built = ticketReceivedEmail({ ref: t.ref, name: t.name, subject: t.subject, threadUrl: clientThreadUrl(t.ref), appUrl: APP_URL });
    await new Resend(apiKey).emails.send({ from: supportFrom('FlyCheap Support'), to: t.to, subject: built.subject, html: built.html });
  } catch { /* ack is best-effort */ }
}

/** Us → client: an operator's reply. Returns the Resend id so the caller can store it on the message row. */
export async function sendTicketReply(t: { to: string; ref: string; name?: string; replyBody: string }): Promise<string | null> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  try {
    const { supportFrom, ADDR } = await import('./senders');
    const built = ticketReplyEmail({ ref: t.ref, name: t.name, replyBody: t.replyBody, threadUrl: clientThreadUrl(t.ref), appUrl: APP_URL });
    const r = await new Resend(apiKey).emails.send({
      from: supportFrom('FlyCheap Support'), to: t.to, replyTo: ADDR.support,
      subject: built.subject, html: built.html,
    });
    return r.data?.id ?? null;
  } catch { return null; }
}

/** Client replied in-app: ping the operator so they see it without polling the queue. */
export async function notifyOperatorClientReply(t: { ref: string; name: string; body: string }): Promise<void> {
  await slack('admin', `💬 *Reply on ${t.ref}* from ${t.name}\n\n${t.body}\n\n${adminThreadUrl(t.ref)}`);
}

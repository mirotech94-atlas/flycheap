import 'server-only';
import { Resend } from 'resend';
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

/** Where operator ticket notifications land. Tickets go to the support mailbox
 *  by default; override with TICKETS_INBOX if it should route elsewhere. */
export function operatorInbox(): string {
  return (process.env.TICKETS_INBOX || 'support@flycheap.live').trim();
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
      const { renderEmail, emailRows, emailButton, EMAIL_TOKENS: T } = await import('./emailLayout');
      const html = renderEmail({
        kind: 'support',
        appUrl: APP_URL,
        preheader: `New ticket ${t.ref}: ${t.subject}`,
        headline: `New ticket ${t.ref}`,
        body: [
          `<p style="font-family:${T.SANS};font-size:15px;line-height:1.6;color:${T.INK};margin:0 0 14px">${esc(t.subject)}</p>`,
          emailRows([
            ['From', `${esc(t.name)} &lt;${esc(t.email)}&gt;`],
            ...(t.who ? [['Account', esc(t.who)] as [string, string]] : []),
            ...(t.ip ? [['IP', esc(t.ip)] as [string, string]] : []),
          ]),
          `<div style="margin:16px 0;padding:12px 16px;background:${T.SURFACE_2};border-left:2px solid ${T.INK};font-family:${T.SANS};font-size:14px;line-height:1.6;color:${T.INK};white-space:pre-wrap">${esc(t.body)}</div>`,
          `<div style="margin:6px 0 0">${emailButton(`Open ${t.ref} in the admin queue`, adminThreadUrl(t.ref))}</div>`,
        ].join(''),
        footerNote: 'Internal notice — every new support ticket reaches the operator this way.',
      });
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

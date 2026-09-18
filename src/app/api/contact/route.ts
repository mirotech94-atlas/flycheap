import { NextResponse } from 'next/server';
import { z } from 'zod';
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

  const user = await getCurrentUser();
  const who = user ? `${user.email} (id ${user.id}, ${user.tier})` : 'not signed in';
  const ticketSubject = subject?.trim() || `Message from ${name}`;

  // Persist as a durable ticket FIRST — this is the record of truth. Email and
  // Slack are best-effort notifications layered on top, so a mail outage can't
  // lose a customer's message.
  const { ref, id } = queries.createTicket({
    user_id: user?.id ?? null, name, email, subject: ticketSubject, body: message, ip,
  });
  queries.insertAudit({
    user_id: user?.id ?? null, email: user?.email ?? email,
    action: 'ticket.open', entity: 'ticket', detail: { ref, id, subject: ticketSubject, ip },
    ip,
  });

  const { notifyOperatorNewTicket, sendTicketAck } = await import('@/lib/tickets');
  await notifyOperatorNewTicket({ ref, name, email, subject: ticketSubject, body: message, ip, who });
  await sendTicketAck({ to: email, ref, name, subject: ticketSubject });

  return NextResponse.json({ ok: true, ref });
}

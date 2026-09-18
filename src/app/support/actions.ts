'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { queries } from '@/lib/db';
import { notifyOperatorNewTicket, notifyOperatorClientReply, sendTicketAck } from '@/lib/tickets';

/** Client opens a ticket from the in-app Support screen. */
export async function openTicket(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/support');

  const subject = String(formData.get('subject') || '').trim().slice(0, 120);
  const message = String(formData.get('message') || '').trim();
  // The textarea is `required`, so the browser blocks an empty send; only guard
  // against a whitespace-only body here — no minimum-length nag.
  if (!message) redirect('/support');

  // Same abuse ceiling as the public form: 10 tickets per account per day.
  if (!queries.rateLimitCheck('ticket_user', String(user.id), 10, 86_400)) {
    redirect('/support?error=limit');
  }

  const name = user.name || user.email.split('@')[0];
  const finalSubject = subject || `Message from ${name}`;
  const { ref } = queries.createTicket({
    user_id: user.id, name, email: user.email, subject: finalSubject, body: message, ip: null,
  });
  queries.insertAudit({
    user_id: user.id, email: user.email,
    action: 'ticket.open', entity: 'ticket', detail: { ref, subject: finalSubject, via: 'support-tab' }, ip: null,
  });

  await notifyOperatorNewTicket({ ref, name, email: user.email, subject: finalSubject, body: message, who: `${user.email} (id ${user.id}, ${user.tier})` });
  await sendTicketAck({ to: user.email, ref, name, subject: finalSubject });

  redirect(`/support/${ref}`);
}

/** Client replies within their own ticket thread. */
export async function clientReply(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect('/login?next=/support');

  const ref = String(formData.get('ref') || '');
  const body = String(formData.get('body') || '').trim();
  const ticket = queries.getTicketByRef(ref);
  // Ownership: a client can only post to their own ticket.
  if (!ticket || ticket.user_id !== user.id || body.length < 1) redirect('/support');

  queries.addTicketMessage({ ticket_id: ticket.id, author: 'client', body });
  await notifyOperatorClientReply({ ref: ticket.ref, name: ticket.name, body });
  revalidatePath(`/support/${ref}`);
}

'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentUser, isAdmin } from '@/lib/auth';
import { queries, type TicketStatus } from '@/lib/db';
import { sendTicketReply } from '@/lib/tickets';

async function assertAdmin() {
  const user = await getCurrentUser();
  if (!isAdmin(user)) throw new Error('unauthorized');
}

const STATUSES: TicketStatus[] = ['open', 'in_progress', 'waiting', 'resolved'];

/** Operator reply: append to the thread first (durable), then email the client. */
export async function replyToTicket(formData: FormData) {
  await assertAdmin();
  const ref = String(formData.get('ref') || '');
  const body = String(formData.get('body') || '').trim();
  const ticket = queries.getTicketByRef(ref);
  if (!ticket || !body) return;

  // Store the message before sending, so a mail failure leaves a durable reply.
  const msgId = queries.addTicketMessage({ ticket_id: ticket.id, author: 'operator', body });
  const emailId = await sendTicketReply({ to: ticket.email, ref: ticket.ref, name: ticket.name, replyBody: body });
  if (emailId) queries.setMessageEmailId(msgId, emailId);
  revalidatePath(`/admin/tickets/${ref}`);
  revalidatePath('/admin/tickets');
}

export async function setTicketStatus(formData: FormData) {
  await assertAdmin();
  const ref = String(formData.get('ref') || '');
  const status = String(formData.get('status') || '') as TicketStatus;
  if (!STATUSES.includes(status)) return;
  const ticket = queries.getTicketByRef(ref);
  if (!ticket) return;
  queries.setTicketStatus(ticket.id, status);
  revalidatePath(`/admin/tickets/${ref}`);
  revalidatePath('/admin/tickets');
}

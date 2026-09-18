import { describe, it, expect, beforeAll } from 'vitest';
import { bootTempDb } from './helpers/tempDb';

let db: Awaited<ReturnType<typeof bootTempDb>>;
beforeAll(async () => { db = await bootTempDb(); });

describe('support tickets', () => {
  it('createTicket assigns an FC-#### ref and stores the first client message', () => {
    const { id, ref } = db.queries.createTicket({
      name: 'Dana Flyer', email: 'dana@example.com', subject: 'Alerts stopped', body: 'No emails since Tuesday.',
    });
    expect(ref).toMatch(/^FC-\d+$/);
    const t = db.queries.getTicketByRef(ref)!;
    expect(t.id).toBe(id);
    expect(t.status).toBe('open');
    expect(t.last_reply_by).toBe('client');
    const msgs = db.queries.getTicketMessages(id);
    expect(msgs).toHaveLength(1);
    expect(msgs[0].author).toBe('client');
    expect(msgs[0].body).toBe('No emails since Tuesday.');
  });

  it('an operator reply moves open → in_progress and records the email id', () => {
    const { id, ref } = db.queries.createTicket({ name: 'Sam', email: 'sam@example.com', subject: 'Q', body: 'Question here.' });
    const msgId = db.queries.addTicketMessage({ ticket_id: id, author: 'operator', body: 'On it.' });
    db.queries.setMessageEmailId(msgId, 'resend_abc123');
    const t = db.queries.getTicketByRef(ref)!;
    expect(t.status).toBe('in_progress');
    expect(t.last_reply_by).toBe('operator');
    const last = db.queries.getTicketMessages(id).at(-1)!;
    expect(last.email_id).toBe('resend_abc123');
  });

  it('a client reply reopens a resolved ticket', () => {
    const { id, ref } = db.queries.createTicket({ name: 'Kai', email: 'kai@example.com', subject: 'X', body: 'Broken thing.' });
    db.queries.setTicketStatus(id, 'resolved');
    db.queries.addTicketMessage({ ticket_id: id, author: 'client', body: 'Still broken.' });
    expect(db.queries.getTicketByRef(ref)!.status).toBe('open');
  });

  it('setting waiting stays waiting until the customer replies', () => {
    const { id, ref } = db.queries.createTicket({ name: 'Lee', email: 'lee@example.com', subject: 'Y', body: 'Need info.' });
    db.queries.setTicketStatus(id, 'waiting');
    // operator note does not auto-flip a waiting ticket
    db.queries.addTicketMessage({ ticket_id: id, author: 'operator', body: 'Any update?' });
    expect(db.queries.getTicketByRef(ref)!.status).toBe('waiting');
    // customer reply reopens it
    db.queries.addTicketMessage({ ticket_id: id, author: 'client', body: 'Here it is.' });
    expect(db.queries.getTicketByRef(ref)!.status).toBe('open');
  });

  it('listUserTickets scopes to the owner and counts messages', () => {
    const uid = db.queries.upsertUserByEmail('holder@example.com').id;
    const a = db.queries.createTicket({ user_id: uid, name: 'H', email: 'holder@example.com', subject: 'Mine', body: 'first' });
    db.queries.addTicketMessage({ ticket_id: a.id, author: 'operator', body: 'reply' });
    const mine = db.queries.listUserTickets(uid);
    const row = mine.find(t => t.ref === a.ref)!;
    expect(row).toBeTruthy();
    expect(row.message_count).toBe(2);
    // a ticket owned by nobody must not appear in this user's list
    const orphan = db.queries.createTicket({ name: 'Anon', email: 'anon@example.com', subject: 'Anon', body: 'x' });
    expect(mine.some(t => t.ref === orphan.ref)).toBe(false);
  });

  it('ticketStatusCounts tallies each state', () => {
    const counts = db.queries.ticketStatusCounts();
    expect(counts.open).toBeGreaterThanOrEqual(1);
    expect(typeof counts.resolved).toBe('number');
    expect(typeof counts.in_progress).toBe('number');
  });
});

import { NextResponse } from 'next/server';
import { queries } from '@/lib/db';
import { verifySvixSignature } from '@/lib/webhookSignature';

export const dynamic = 'force-dynamic';

/**
 * Resend delivery webhooks — the funnel's `delivered` and `opened` stages.
 *
 * Nothing in our own database can know whether an email arrived or was opened;
 * only the ESP can tell us. Until this existed the funnel showed both stages as
 * explicitly not-instrumented, which was honest but left a hole exactly where
 * "we sent 73 alerts" turns into "and how many were actually read".
 *
 * SECURITY: this is a URL anyone on the internet can POST to. Every request is
 * signature-verified before a single byte is trusted — an unverified endpoint
 * would let anyone mark alerts delivered and opened, and the numbers this exists
 * to produce would become fiction that looks exactly like data. When no signing
 * secret is configured the endpoint refuses everything rather than falling open.
 */

type ResendEvent = {
  type?: string;
  created_at?: string;
  data?: { email_id?: string; to?: string[] | string; created_at?: string };
};

export async function POST(req: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET ?? '';
  if (!secret) {
    // Deliberately not 200. A silently-accepting endpoint is worse than a
    // missing one, because the dashboard would fill with unverified events.
    console.warn('[webhooks/resend] refused: RESEND_WEBHOOK_SECRET is not set');
    return NextResponse.json({ error: 'webhook not configured' }, { status: 503 });
  }

  // The RAW body. Re-serialising the parsed JSON changes bytes and breaks the
  // signature, which is the classic way this check gets silently disabled.
  const payload = await req.text();

  const verdict = verifySvixSignature({
    payload,
    svixId: req.headers.get('svix-id'),
    svixTimestamp: req.headers.get('svix-timestamp'),
    svixSignature: req.headers.get('svix-signature'),
    secret,
  });
  if (!verdict.ok) {
    console.warn(`[webhooks/resend] rejected: ${verdict.reason}`);
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  let event: ResendEvent;
  try {
    event = JSON.parse(payload) as ResendEvent;
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }

  const type = event.type ?? '';
  const messageId = event.data?.email_id ?? null;
  const to = Array.isArray(event.data?.to) ? event.data?.to?.[0] : event.data?.to;
  const occurredAt = event.created_at ?? event.data?.created_at ?? new Date().toISOString();

  // Svix's message id is the idempotency key; the ESP retries on any non-2xx.
  const eventId = req.headers.get('svix-id') ?? `${type}:${messageId}:${occurredAt}`;

  try {
    const r = queries.recordEmailEvent({
      event_id: eventId,
      event_type: type,
      message_id: messageId,
      recipient: to ?? null,
      occurred_at: occurredAt,
      raw_json: payload.slice(0, 4000),
    });
    // 200 even for a duplicate or an event about a message we never recorded
    // (a chain send, a digest): a non-2xx makes Resend retry forever for
    // something that is not a failure.
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    console.error('[webhooks/resend] store failed', (e as Error).message);
    // A real failure DOES deserve a retry.
    return NextResponse.json({ error: 'store failed' }, { status: 500 });
  }
}

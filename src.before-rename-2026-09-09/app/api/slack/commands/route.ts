import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { queries } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Slack slash command endpoint. Configured in the Slack app settings as
 *   /flycheap  →  https://flycheap.18dn.com/api/slack/commands
 *
 * Subcommands (the part after /flycheap):
 *   /flycheap watch ORIGIN DEST PRICE     — subscribe this channel
 *   /flycheap unwatch ORIGIN DEST         — remove a subscription
 *   /flycheap list                        — show the channel's watches
 *   /flycheap help                        — usage
 *
 * Slack POSTs application/x-www-form-urlencoded and requires signature
 * verification using SLACK_SIGNING_SECRET (v0 scheme: HMAC-SHA256 over
 * "v0:{timestamp}:{body}", compared to header X-Slack-Signature).
 */

function verifySlackSignature(body: string, ts: string | null, sig: string | null): boolean {
  const secret = process.env.SLACK_SIGNING_SECRET;
  if (!secret || !ts || !sig) return false;
  // Reject replay-style requests older than 5 minutes
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(ts)) > 60 * 5) return false;
  const base = `v0:${ts}:${body}`;
  const expected = 'v0=' + crypto.createHmac('sha256', secret).update(base).digest('hex');
  // timingSafeEqual requires equal-length Buffers
  const a = Buffer.from(expected);
  const b = Buffer.from(sig);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function ephemeral(text: string, blocks?: unknown[]) {
  return NextResponse.json({
    response_type: 'ephemeral',
    text,
    ...(blocks ? { blocks } : {}),
  });
}

function isIATA(s: string): boolean {
  return /^[A-Z]{3}$/.test(s);
}

const HELP = [
  '*FlyCheap · channel watches*',
  '',
  '`/flycheap watch JFK LIS 450`   subscribe this channel to alerts under $450',
  '`/flycheap unwatch JFK LIS`     remove that subscription',
  '`/flycheap list`                show this channel\'s active watches',
].join('\n');

export async function POST(req: Request) {
  const raw = await req.text();
  const ok = verifySlackSignature(raw,
    req.headers.get('x-slack-request-timestamp'),
    req.headers.get('x-slack-signature'));
  if (!ok) return NextResponse.json({ error: 'invalid signature' }, { status: 401 });

  const form = new URLSearchParams(raw);
  const text = (form.get('text') || '').trim();
  const teamId = form.get('team_id') || '';
  const channelId = form.get('channel_id') || '';
  const userId = form.get('user_id') || '';

  const tokens = text.split(/\s+/).filter(Boolean);
  const sub = (tokens.shift() || 'help').toLowerCase();

  if (sub === 'help' || sub === '') return ephemeral(HELP);

  if (sub === 'watch') {
    if (tokens.length < 3) return ephemeral('Usage: `/flycheap watch ORIGIN DEST PRICE` — e.g. `/flycheap watch JFK LIS 450`');
    const origin = tokens[0].toUpperCase();
    const destination = tokens[1].toUpperCase();
    const threshold = Number(tokens[2].replace(/[\$,]/g, ''));
    if (!isIATA(origin)) return ephemeral(`❌ Origin "${tokens[0]}" isn't a valid 3-letter airport code.`);
    if (!isIATA(destination)) return ephemeral(`❌ Destination "${tokens[1]}" isn't a valid 3-letter airport code.`);
    if (!Number.isFinite(threshold) || threshold <= 0) return ephemeral(`❌ Price "${tokens[2]}" doesn't parse as a number.`);

    queries.upsertSlackSubscription({
      team_id: teamId, channel_id: channelId,
      origin, destination, threshold_usd: threshold,
      created_by_slack_user: userId,
    });
    return ephemeral(`✅ Watching *${origin} → ${destination}*. I'll post in this channel when the fare drops below *$${threshold.toLocaleString()}*.`);
  }

  if (sub === 'unwatch') {
    if (tokens.length < 2) return ephemeral('Usage: `/flycheap unwatch ORIGIN DEST` — e.g. `/flycheap unwatch JFK LIS`');
    const origin = tokens[0].toUpperCase();
    const destination = tokens[1].toUpperCase();
    const result = queries.deleteSlackSubscription(channelId, origin, destination);
    const changes = (result as { changes?: number }).changes ?? 0;
    return ephemeral(changes > 0
      ? `🗑 Stopped watching *${origin} → ${destination}* in this channel.`
      : `Hmm, this channel wasn't watching *${origin} → ${destination}*.`);
  }

  if (sub === 'list') {
    const subs = queries.listSlackSubscriptions(channelId);
    if (subs.length === 0) return ephemeral('No active watches in this channel yet. Try `/flycheap watch JFK LIS 450`.');
    const lines = subs.map(s => `• *${s.origin} → ${s.destination}* under *$${s.threshold_usd.toLocaleString()}*`).join('\n');
    return ephemeral(`*Active watches in this channel*\n${lines}`);
  }

  return ephemeral(`Unknown command \`${sub}\`. ${HELP}`);
}

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import Anthropic from '@anthropic-ai/sdk';
import { queries } from '@/lib/db';
import { postToSlackChannel } from '@/lib/notifier';

export const dynamic = 'force-dynamic';

// ---------------------------------------------------------------------------
// Slack Events API endpoint — powers the AI support agent in the #support
// channel. When a human posts a message there, the bot answers in a thread
// using Claude, so clients get help even when the operator is offline.
//
// Slack app config required (see deploy notes):
//   - Event Subscriptions → Request URL: https://flycheap.18dn.com/api/slack/events
//   - Subscribe to bot event: message.channels
//   - Bot scopes: chat:write, channels:history  → reinstall app
//   - SLACK_SIGNING_SECRET in .env.local
// ---------------------------------------------------------------------------

const SUPPORT_SYSTEM_PROMPT = `You are the FlyCheap Tracker support agent, responding inside the team's Slack #support channel. A customer has posted a question; the human operator may be unavailable, so you answer on their behalf.

About FlyCheap Tracker:
- A fare-watching app that polls 1,000+ airlines (via Travelpayouts/Aviasales, Amadeus, Duffel, Kiwi, Google Flights via SerpAPI, SearchAPI) and alerts users when fares drop.
- Users add tracked routes; the scheduler polls them and emails/Slacks/Telegrams an alert when a fare falls below their threshold or ≥30% below the route's median (mistake-fare radar).
- Key pages: Dashboard (executive brief, best fares worldwide, live feed, route intelligence, fare heatmap, carbon ledger), Explore (interactive 3D globe + satellite map, trending deals), Offers (flights + hotels combined), Hotels (search + price-by-month chart + neighborhood grid), Searches (add/manage tracked routes, multi-origin, airport typeahead), Settings (alert channels, providers, digests, share link).
- Alert channels: email, Slack, Telegram, WhatsApp, Instagram DM, SMS. Free tier is email-only; paid tiers unlock the rest.
- Digests: daily, weekly, monthly, 6-month, annual — all previewable + PDF-exportable in Settings.
- Booking: every "Book" button routes through an affiliate redirect; users can pick the provider (Aviasales, Trip.com, Skyscanner, WayAway, Hotellook).

Style:
- Be warm, concise, and genuinely helpful. 1-4 sentences usually.
- If it's a billing/account-specific issue, or something you genuinely can't resolve, say you've flagged it for the operator to follow up personally.
- Never invent specific fare prices or make promises about deals — speak generally about how the app works.
- You're in Slack: plain text, light markdown (*bold*), no big headers.`;

// In-memory dedup of Slack event IDs. Slack retries deliveries; the app is a
// long-running Node process so a Set survives between requests. Capped so it
// can't grow unbounded.
const seenEvents = new Set<string>();
function rememberEvent(id: string): boolean {
  if (seenEvents.has(id)) return false;
  seenEvents.add(id);
  if (seenEvents.size > 2000) {
    // drop oldest ~500 by rebuilding from the tail
    const keep = Array.from(seenEvents).slice(-1500);
    seenEvents.clear();
    keep.forEach(k => seenEvents.add(k));
  }
  return true;
}

function verifySlackSignature(rawBody: string, timestamp: string, signature: string): boolean {
  const secret = process.env.SLACK_SIGNING_SECRET;
  if (!secret) return false;
  // Reject anything older than 5 minutes (replay protection).
  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) return false;
  const base = `v0:${timestamp}:${rawBody}`;
  const hmac = 'v0=' + crypto.createHmac('sha256', secret).update(base).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(signature));
  } catch {
    return false;
  }
}

// Pull the existing thread so follow-up questions stay coherent. Only called
// for replies inside an existing thread (not first messages) so the common
// "new question" path stays as fast as possible. The bot's own past replies
// become assistant turns; everyone else's messages are user turns.
async function fetchThreadHistory(
  channel: string,
  threadTs: string,
): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
  const botToken = process.env.SLACK_BOT_TOKEN;
  if (!botToken) return [];
  try {
    const res = await fetch(
      `https://slack.com/api/conversations.replies?channel=${channel}&ts=${threadTs}&limit=20`,
      { headers: { Authorization: `Bearer ${botToken}` } },
    );
    const j = await res.json().catch(() => ({}));
    if (!j.ok || !Array.isArray(j.messages)) return [];
    // Any message with a bot_id is from the support bot → assistant turn;
    // everything else is a human → user turn.
    return j.messages
      .filter((m: any) => typeof m.text === 'string' && m.text.trim())
      .map((m: any) => ({
        role: (m.bot_id ? 'assistant' : 'user') as 'user' | 'assistant',
        content: String(m.text).slice(0, 2000),
      }));
  } catch {
    return [];
  }
}

async function answerInThread(
  channel: string,
  threadTs: string,
  question: string,
  opts: { isThreadReply: boolean },
) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    await postToSlackChannelThread(channel, threadTs,
      'Thanks for the message — our team will follow up shortly. (AI assist is temporarily unavailable.)');
    return;
  }
  try {
    const client = new Anthropic({ apiKey });
    // First message in a thread → answer immediately (fastest path).
    // Reply inside an existing thread → pull thread context for coherence.
    let messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    if (opts.isThreadReply) {
      const history = await fetchThreadHistory(channel, threadTs);
      messages = history.length
        ? history
        : [{ role: 'user', content: question }];
      // Ensure the final turn is the user's latest question.
      if (messages[messages.length - 1]?.role !== 'user') {
        messages.push({ role: 'user', content: question });
      }
    } else {
      messages = [{ role: 'user', content: question }];
    }
    const res = await client.messages.create({
      // Haiku 4.5 — fast enough to typically reply in ~1-2s, plenty capable
      // for app-support Q&A.
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 500,
      system: SUPPORT_SYSTEM_PROMPT,
      messages,
    });
    const text = res.content
      .flatMap(b => (b.type === 'text' ? [b.text] : []))
      .join('\n')
      .trim();
    await postToSlackChannelThread(channel, threadTs,
      text || 'Thanks for reaching out — our team will follow up shortly.');
  } catch (e) {
    console.error('[slack-support] LLM reply failed:', (e as Error).message);
    await postToSlackChannelThread(channel, threadTs,
      'Thanks for the message — I’ve flagged this for the team to follow up personally.');
  }
}

// postToSlackChannel posts to a channel root; for support replies we want them
// threaded under the customer's message. Thin wrapper around chat.postMessage.
async function postToSlackChannelThread(channel: string, threadTs: string, text: string) {
  const botToken = process.env.SLACK_BOT_TOKEN;
  if (!botToken) return;
  try {
    await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { Authorization: `Bearer ${botToken}`, 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ channel, thread_ts: threadTs, text, unfurl_links: false }),
    });
  } catch (e) {
    console.error('[slack-support] post failed:', (e as Error).message);
  }
}

export async function POST(req: Request) {
  const rawBody = await req.text();
  const timestamp = req.headers.get('x-slack-request-timestamp') ?? '';
  const signature = req.headers.get('x-slack-signature') ?? '';

  let payload: any;
  try { payload = JSON.parse(rawBody); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }

  // Slack's one-time endpoint verification handshake.
  if (payload.type === 'url_verification') {
    // The challenge handshake is unsigned by design — echo it straight back.
    return NextResponse.json({ challenge: payload.challenge });
  }

  // Every other request must carry a valid signature.
  if (!verifySlackSignature(rawBody, timestamp, signature)) {
    return NextResponse.json({ ok: false, error: 'bad signature' }, { status: 401 });
  }

  // Ignore Slack's automatic retries — we ack fast enough that a retry just
  // means the original 200 was slow to register.
  if (req.headers.get('x-slack-retry-num')) {
    return NextResponse.json({ ok: true });
  }

  if (payload.type === 'event_callback' && payload.event) {
    const ev = payload.event;
    const eventId: string = payload.event_id ?? `${ev.channel}:${ev.ts}`;
    const supportChannel = queries.getSetting('alert_slack_support_target') ?? '';

    const isHumanMessage =
      ev.type === 'message' &&
      !ev.bot_id &&
      !ev.subtype &&
      typeof ev.text === 'string' &&
      ev.text.trim().length > 0 &&
      ev.channel === supportChannel;

    if (isHumanMessage && rememberEvent(eventId)) {
      // Ack Slack immediately (must be <3s), process the LLM reply in the
      // background — this is a long-running Node server so a detached
      // promise is safe.
      const isThreadReply = Boolean(ev.thread_ts && ev.thread_ts !== ev.ts);
      const threadTs: string = ev.thread_ts || ev.ts;
      void answerInThread(ev.channel, threadTs, ev.text, { isThreadReply });
    }
  }

  // Always ack fast.
  return NextResponse.json({ ok: true });
}

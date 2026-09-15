import { NextResponse } from 'next/server';
import { queries } from '@/lib/db';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Telegram bot webhook. Telegram POSTs every incoming message here.
 *
 * Supported commands (sent as plain text by users in a DM with the bot):
 *   /start                          — welcome + how-to
 *   /watch ORIGIN DEST PRICE        — subscribe this chat to alerts under PRICE
 *   /unwatch ORIGIN DEST            — remove a subscription
 *   /list                           — show this chat's subscriptions
 *   /help                           — same as /start
 *
 * Set webhook (one-time) by hitting:
 *   POST {site}/api/telegram/webhook?action=setWebhook
 * which calls Telegram's setWebhook API pointing back at this same route.
 *
 * Security: Telegram supports a secret_token in setWebhook; if
 * TELEGRAM_WEBHOOK_SECRET is set, we require Telegram's
 * X-Telegram-Bot-Api-Secret-Token header to match before processing.
 */

const TELEGRAM_API = 'https://api.telegram.org';

function envBotToken(): string | null {
  const t = process.env.TELEGRAM_BOT_TOKEN;
  return t && t.length > 0 ? t : null;
}

async function tgSend(chatId: string | number, text: string, parseMode: 'Markdown' | 'HTML' = 'Markdown') {
  const token = envBotToken();
  if (!token) return { ok: false, error: 'TELEGRAM_BOT_TOKEN unset' };
  const r = await fetch(`${TELEGRAM_API}/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: parseMode, disable_web_page_preview: true }),
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok && j.ok, error: j.description };
}

function isIATA(s: string): boolean {
  return /^[A-Z]{3}$/.test(s);
}

/** Parse a /watch JFK LIS 450 (case-insensitive, $ allowed on price). */
function parseWatch(args: string[]): { origin: string; destination: string; threshold: number } | string {
  if (args.length < 3) return 'Usage: `/watch ORIGIN DEST PRICE` — e.g. `/watch JFK LIS 450`';
  const origin = args[0].toUpperCase();
  const destination = args[1].toUpperCase();
  const priceStr = args[2].replace(/[\$,]/g, '');
  const threshold = Number(priceStr);
  if (!isIATA(origin)) return `❌ Origin "${args[0]}" isn't a valid 3-letter airport code.`;
  if (!isIATA(destination)) return `❌ Destination "${args[1]}" isn't a valid 3-letter airport code.`;
  if (!Number.isFinite(threshold) || threshold <= 0) return `❌ Price "${args[2]}" doesn't parse as a number.`;
  return { origin, destination, threshold };
}

const WELCOME = [
  '👋 *Welcome to FlyCheap Alerts!*',
  '',
  'I watch 700 airlines so you don\'t have to. Tell me a route + your target price, and I\'ll ping this chat the moment a fare drops below it.',
  '',
  '*Commands*',
  '`/watch JFK LIS 450`  — alert me when JFK → Lisbon goes below $450',
  '`/list`               — show your active watches',
  '`/unwatch JFK LIS`    — stop watching that route',
  '`/help`               — show this message again',
  '',
  'Add as many routes as you like.',
].join('\n');

async function handleUpdate(update: { message?: { chat?: { id?: number | string; first_name?: string }; from?: { id?: number | string; username?: string; first_name?: string }; text?: string } }) {
  const msg = update.message;
  if (!msg || !msg.chat?.id || !msg.text) return;
  const chatId = String(msg.chat.id);
  const fromUser = msg.from?.username ? `@${msg.from.username}` : (msg.from?.id ? String(msg.from.id) : null);
  const firstName = msg.from?.first_name || msg.chat?.first_name || null;
  const text = msg.text.trim();

  // Slash command parsing (Telegram strips the @botname suffix on direct mentions like "/watch@bot")
  const tokens = text.split(/\s+/);
  const head = tokens[0].toLowerCase().split('@')[0];   // "/watch@flycheap_alerts_bot" → "/watch"
  const args = tokens.slice(1);

  if (head === '/start' || head === '/help') {
    await tgSend(chatId, WELCOME);
    return;
  }

  if (head === '/watch') {
    const parsed = parseWatch(args);
    if (typeof parsed === 'string') { await tgSend(chatId, parsed); return; }
    queries.upsertTelegramSubscription({
      chat_id: chatId,
      origin: parsed.origin, destination: parsed.destination,
      threshold_usd: parsed.threshold,
      created_by_tg_user: fromUser, first_name: firstName,
    });
    await tgSend(chatId, `✅ Watching *${parsed.origin} → ${parsed.destination}*. I'll ping you when it drops below *$${parsed.threshold.toLocaleString()}*.`);
    return;
  }

  if (head === '/unwatch') {
    if (args.length < 2) { await tgSend(chatId, 'Usage: `/unwatch ORIGIN DEST` — e.g. `/unwatch JFK LIS`'); return; }
    const origin = args[0].toUpperCase();
    const destination = args[1].toUpperCase();
    const result = queries.deleteTelegramSubscription(chatId, origin, destination);
    const changes = (result as { changes?: number }).changes ?? 0;
    await tgSend(chatId, changes > 0
      ? `🗑 Stopped watching *${origin} → ${destination}*.`
      : `Hmm, I wasn't watching *${origin} → ${destination}* on this chat.`);
    return;
  }

  if (head === '/list') {
    const subs = queries.listTelegramSubscriptions(chatId);
    if (subs.length === 0) {
      await tgSend(chatId, 'You don\'t have any active watches yet. Try `/watch JFK LIS 450`.');
      return;
    }
    const body = subs.map(s => `• *${s.origin} → ${s.destination}* under *$${s.threshold_usd.toLocaleString()}*`).join('\n');
    await tgSend(chatId, `*Your active watches*\n${body}`);
    return;
  }

  // Anything else: a polite hint, but only once per chat per minute to avoid spam.
  await tgSend(chatId, 'I don\'t recognize that. Try `/start` for the command list.');
}

/** Trigger Telegram setWebhook so the bot points at this route. */
async function setWebhook(siteUrl: string): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  const token = envBotToken();
  if (!token) return { ok: false, error: 'TELEGRAM_BOT_TOKEN unset' };
  const webhookUrl = `${siteUrl.replace(/\/$/, '')}/api/telegram/webhook`;
  const body: Record<string, unknown> = {
    url: webhookUrl,
    allowed_updates: ['message'],
    drop_pending_updates: true,
  };
  if (process.env.TELEGRAM_WEBHOOK_SECRET) body.secret_token = process.env.TELEGRAM_WEBHOOK_SECRET;
  const r = await fetch(`${TELEGRAM_API}/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok && j.ok, result: j };
}

export async function POST(req: Request) {
  // Admin-triggered setWebhook (no body needed)
  const url = new URL(req.url);
  if (url.searchParams.get('action') === 'setWebhook') {
    const proto = req.headers.get('x-forwarded-proto') ?? 'https';
    const host  = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? 'flycheap.18dn.com';
    const result = await setWebhook(`${proto}://${host}`);
    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  }

  // Validate Telegram secret-token if configured
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (secret) {
    const got = req.headers.get('x-telegram-bot-api-secret-token');
    if (got !== secret) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }

  const update = await req.json().catch(() => null);
  if (!update) return NextResponse.json({ ok: true }); // ignore bad payloads quietly
  // Process asynchronously but reply OK immediately so Telegram doesn't retry.
  handleUpdate(update).catch(err => {
    // Best-effort: log and move on.
    console.error('[telegram-webhook] handleUpdate error:', err);
  });
  return NextResponse.json({ ok: true });
}

export function GET() {
  return NextResponse.json({ ok: true, route: 'telegram/webhook',
    hint: 'POST ?action=setWebhook to register with Telegram.' });
}

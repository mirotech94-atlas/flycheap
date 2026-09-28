import 'server-only';
import { queries } from '@/lib/db';
import { startRun, finishRun } from '../shared/storage';
import { isDryRun } from '../shared/client';

// Social drain (phase 3). Posts APPROVED queue rows to their channel, then
// marks them posted/failed. Telegram only — via raw fetch to the Bot API (no
// SDK). X is skipped until OAuth1 creds exist. Per-channel daily caps enforced.
//
// Safety: in DRY_RUN nothing is sent — the drain logs what it WOULD post. A
// real post also requires TELEGRAM_BOT_TOKEN + TELEGRAM_CHANNEL_ID; without the
// channel id the Telegram leg is inert and rows stay 'approved'.

const TG_DAILY_CAP = 12;
const X_DAILY_CAP = 4;

async function postTelegram(token: string, chatId: string, text: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      signal: AbortSignal.timeout(10_000),
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown', disable_web_page_preview: false }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.ok) return { ok: false, error: `telegram ${res.status}: ${json.description ?? 'unknown'}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function runSocialDrain(): Promise<{
  runId: number; dryRun: boolean;
  results: Array<{ id: number; channel: string; posted: boolean; note: string }>;
}> {
  const dryRun = isDryRun();
  const runId = startRun('social-drain', null, dryRun);
  const startMs = Date.now();
  const results: Array<{ id: number; channel: string; posted: boolean; note: string }> = [];

  try {
    const tgToken = (process.env.TELEGRAM_BOT_TOKEN ?? '').trim();
    const tgChat = (process.env.TELEGRAM_CHANNEL_ID ?? '').trim();
    const approved = queries.socialQueueByStatus('approved', 50);

    let tgPosted = 0;
    for (const row of approved) {
      if (row.channel === 'x') {
        results.push({ id: row.id, channel: 'x', posted: false, note: 'X posting not configured (no OAuth1 creds) — left approved' });
        continue;
      }
      if (row.channel !== 'telegram') {
        results.push({ id: row.id, channel: row.channel, posted: false, note: 'unknown channel — left approved' });
        continue;
      }
      if (tgPosted >= TG_DAILY_CAP) {
        results.push({ id: row.id, channel: 'telegram', posted: false, note: 'daily cap reached — deferred' });
        continue;
      }
      if (!tgToken || !tgChat) {
        results.push({ id: row.id, channel: 'telegram', posted: false, note: 'TELEGRAM_BOT_TOKEN/CHANNEL_ID not set — inert, left approved' });
        continue;
      }
      if (dryRun) {
        results.push({ id: row.id, channel: 'telegram', posted: false, note: 'DRY_RUN — would post, left approved' });
        continue;
      }
      const res = await postTelegram(tgToken, tgChat, row.body);
      if (res.ok) {
        queries.markSocialPosted(row.id);
        tgPosted++;
        results.push({ id: row.id, channel: 'telegram', posted: true, note: 'posted' });
      } else {
        queries.markSocialFailed(row.id, res.error ?? 'send failed');
        results.push({ id: row.id, channel: 'telegram', posted: false, note: res.error ?? 'send failed' });
      }
    }

    void X_DAILY_CAP;
    const posted = results.filter(r => r.posted).length;
    finishRun(runId, { ok: true, durationMs: Date.now() - startMs, summary: `${posted} posted · ${approved.length} approved scanned · DRY_RUN=${dryRun}`, output: { results } });
    return { runId, dryRun, results };
  } catch (e) {
    finishRun(runId, { ok: false, durationMs: Date.now() - startMs, error: (e as Error).message });
    throw e;
  }
}

import 'server-only';
import { z } from 'zod';
import { queries } from '@/lib/db';
import { MODELS, completeJSON, hasApiKey, isDryRun, pingModel } from '../shared/client';
import { startRun, finishRun } from '../shared/storage';
import { BRAND_VOICE, voiceFlags } from '../shared/voice';

// Social poster (phase 2). Turns verified curated picks into channel-specific
// posts and queues them with status='queued'. Nothing is posted here — the
// operator approves in /admin/queue and a later phase drains approved rows.
// Idempotent: UNIQUE(pick_id,channel) means re-runs never duplicate.

const CHANNELS = ['x', 'telegram'] as const;
type Channel = (typeof CHANNELS)[number];

const PostSchema = z.object({ body: z.string().min(5).max(900) });

const BASE = 'https://flycheap.live';

function bookUrl(pick: { origin: string; destination: string; outbound_date: string; return_date: string }, channel: Channel) {
  // Aviasales search deep-link (the surface our /go redirect attributes).
  const to = `https://www.aviasales.com/search/${pick.origin}${pick.outbound_date.slice(5).replace('-', '')}${pick.destination}${pick.return_date.slice(5).replace('-', '')}1`;
  return `${BASE}/go?to=${encodeURIComponent(to)}&surface=agent-social&channel=${channel}`;
}

function channelRules(channel: Channel): string {
  if (channel === 'x') {
    return [
      'Write ONE X (Twitter) post.',
      '- Hard max 250 characters (a link is appended separately, do not include it).',
      '- Format: PRICE route · dates · % off median.',
      '- One ✈️ emoji max. No hashtags unless natural (#flightdeal ok). One line, use · separators.',
    ].join('\n');
  }
  return [
    'Write ONE Telegram channel post.',
    '- 3-5 short lines, markdown ok.',
    '- Lead with the price on its own bold line.',
    '- Include trip length and % below median. Do NOT include the link (appended separately).',
  ].join('\n');
}

function dealJson(pick: { origin: string; destination: string; outbound_date: string; return_date: string; per_adult_usd: number; trip_length_days: number | null }) {
  // Recompute the real % below median from the live cache. The curator's
  // `score` is an internal 0-100 quality rank, NOT a discount — never expose it
  // as a percentage or the post cites a fabricated number.
  const median = queries.agentRouteMedian(pick.origin, pick.destination);
  const pctBelowMedian = median && median > 0
    ? Math.round(((median - pick.per_adult_usd) / median) * 100)
    : null;
  return JSON.stringify({
    origin: pick.origin,
    destination: pick.destination,
    outbound_date: pick.outbound_date,
    return_date: pick.return_date,
    per_adult_usd: Math.round(pick.per_adult_usd),
    trip_length_days: pick.trip_length_days,
    route_median_usd: median ? Math.round(median) : null,
    pct_below_median: pctBelowMedian,
  });
}

export async function runSocialPoster(opts: { perChannelLimit?: number } = {}): Promise<{
  runId: number; model: string; dryRun: boolean; queued: number;
  posts: Array<{ channel: Channel; pickId: number; body: string; flags: string[] }>;
}> {
  const dryRun = isDryRun();
  const model = MODELS.curator; // sonnet, shared snapshot
  if (!hasApiKey()) throw new Error('ANTHROPIC_API_KEY not set — social poster cannot run');

  const runId = startRun('social-poster', model, dryRun);
  const startMs = Date.now();
  const posts: Array<{ channel: Channel; pickId: number; body: string; flags: string[] }> = [];

  try {
    let pinged = false;
    for (const channel of CHANNELS) {
      const picks = queries.picksAwaitingQueue(channel, opts.perChannelLimit ?? 6);
      if (picks.length === 0) continue;
      if (!pinged) {
        if (!(await pingModel(model))) throw new Error(`model ping failed: ${model}`);
        pinged = true;
      }
      for (const pick of picks) {
        const out = await completeJSON({
          model,
          system: `${BRAND_VOICE}\n\n${channelRules(channel)}\n\nNever invent details — use only the DEAL JSON. The ONLY percentage you may cite is pct_below_median (omit it if null). Never present any other number as a percentage. Return {"body":"<post text>"}.`,
          user: `DEAL JSON:\n${dealJson(pick)}`,
          schema: PostSchema,
          // Room for the post body after the gpt-oss reasoning tokens (kept
          // low via reasoningEffort in complete()); a starved budget returns
          // empty content that Groq rejects as json_validate_failed.
          maxTokens: 700,
          // Tolerate the model using a different key (post/text/content/tweet)
          // or returning a bare string instead of {body}.
          normalize: (v) => {
            if (typeof v === 'string') return { body: v };
            if (v && typeof v === 'object') {
              const o = v as Record<string, unknown>;
              if (typeof o.body === 'string') return o;
              const alt = ['post', 'text', 'content', 'message', 'tweet'].find(k => typeof o[k] === 'string');
              if (alt) return { body: o[alt] };
            }
            return v;
          },
        });
        const link = bookUrl(pick, channel);
        const body = `${out.body}\n${link}`;
        const flags = voiceFlags(out.body);
        // Always queued (never approved) — operator gate. Idempotent insert.
        queries.enqueueSocialPost({ pick_id: pick.id, channel, body });
        posts.push({ channel, pickId: pick.id, body, flags });
      }
    }

    const summary = `${posts.length} posts queued (${posts.filter(p => p.channel === 'x').length} X, ${posts.filter(p => p.channel === 'telegram').length} TG) · status=queued · DRY_RUN=${dryRun}`;
    finishRun(runId, { ok: true, durationMs: Date.now() - startMs, summary, output: { posts } });
    return { runId, model, dryRun, queued: posts.length, posts };
  } catch (e) {
    finishRun(runId, { ok: false, durationMs: Date.now() - startMs, error: (e as Error).message });
    throw e;
  }
}

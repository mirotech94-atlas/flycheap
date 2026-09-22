import 'server-only';
import { MODELS, complete, hasApiKey, isDryRun, pingModel } from '../shared/client';
import { getInsightsSnapshot } from '../shared/data';
import { startRun, finishRun } from '../shared/storage';
import { BRAND_VOICE } from '../shared/voice';
import { isConfigured as voiceConfigured, synthesize, speakable } from '@/lib/elevenlabs';
import { sendOperatorBrief } from '@/lib/email';
import type { InsightsResult } from '../shared/types';

// Insights reporter (phase 1). Daily ~8am ET: turn the 24h operational snapshot
// into a ~250-word operator brief and email it to the owner. Owner-only — this
// is internal, so it emails regardless of DRY_RUN (DRY_RUN only gates public
// broadcasting, which this agent never does).

function buildPrompt(s: ReturnType<typeof getInsightsSnapshot>): string {
  return [
    'Write a ~250-word daily operator brief for the FlyCheap founder. You are the on-call analyst.',
    'Lead with the single most important thing. Cover: traffic/signups, polling & alert volume,',
    'provider/API health (flag if error rate looks high), deal coverage, and ONE concrete suggestion.',
    'Be direct and numeric. No headers, no bullet lists — flowing short paragraphs.',
    '',
    'LAST 24H SNAPSHOT (JSON):',
    JSON.stringify(s, null, 2),
  ].join('\n');
}

export async function runInsights(): Promise<InsightsResult> {
  const dryRun = isDryRun();
  const model = MODELS.insights;
  if (!hasApiKey()) throw new Error('ANTHROPIC_API_KEY not set — insights cannot run');

  const snapshot = getInsightsSnapshot();
  const runId = startRun('insights', model, dryRun);
  const startMs = Date.now();

  try {
    if (!(await pingModel(model))) throw new Error(`model ping failed: ${model}`);

    const brief = await complete({
      model,
      system: `${BRAND_VOICE}\n\nYou write concise internal ops briefs. The reader is the founder; be candid.`,
      user: buildPrompt(snapshot),
      maxTokens: 700,
    });

    const to = (process.env.AGENT_ADMIN_EMAIL ?? '').trim();
    let emailed = false;
    let emailNote = '';
    if (!to) {
      emailNote = 'AGENT_ADMIN_EMAIL not set — brief generated but not emailed';
    } else {
      const today = new Date().toISOString().slice(0, 10);
      // Spoken brief — only when ElevenLabs is configured, never a reason for
      // the email itself to fail: a narration error is noted and the text
      // brief still goes out.
      let audio: { filename: string; content: Buffer } | undefined;
      let audioNote = '';
      if (voiceConfigured() && !dryRun) {
        try {
          const spoken = await synthesize(speakable(brief), { model: 'eleven_multilingual_v2', format: 'mp3_22050_32', stability: 0.6 });
          audio = { filename: `flycheap-ops-brief-${today}.mp3`, content: spoken.audio };
          audioNote = ` · narrated (${Math.round(spoken.audio.length / 1024)} KB)`;
        } catch (e) {
          audioNote = ` · narration failed: ${(e as Error).message.slice(0, 80)}`;
        }
      }
      const res = await sendOperatorBrief({ to, subject: `FlyCheap ops brief — ${today}`, body: brief, audio });
      emailed = res.ok;
      emailNote = (res.ok ? `emailed to ${to} (id=${res.id})` : `email failed: ${res.error}`) + audioNote;
    }

    finishRun(runId, {
      ok: true,
      durationMs: Date.now() - startMs,
      summary: `${brief.split(/\s+/).length} words · ${emailNote} · DRY_RUN=${dryRun}`,
      output: { brief, snapshot, emailed, emailTo: to || null },
    });

    return { runId, model, dryRun, brief, emailed, emailTo: to || null };
  } catch (e) {
    finishRun(runId, { ok: false, durationMs: Date.now() - startMs, error: (e as Error).message });
    throw e;
  }
}

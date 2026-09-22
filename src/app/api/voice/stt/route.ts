import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/apiGuard';
import { queries } from '@/lib/db';
import { isConfigured, transcribe } from '@/lib/elevenlabs';

export const dynamic = 'force-dynamic';

/**
 * POST multipart { audio } → { text }. The concierge's microphone.
 *
 * GUARD: middleware.ts does not run on api/ routes; signed-in only, and
 * rate-limited — Scribe is metered by the hour of audio. Uploads are capped
 * at 4 MB, which is over a minute of opus; the widget records a single
 * utterance, so a real request is a small fraction of that.
 *
 * 503 when not configured: the widget falls back to the browser's own speech
 * recognition, exactly as before.
 */
const MAX_BYTES = 4 * 1024 * 1024;

export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;
  if (!isConfigured()) return NextResponse.json({ error: 'voice not configured' }, { status: 503 });
  if (!queries.rateLimitCheck('voice-stt', String(auth.user.id), 40, 300)) {
    return NextResponse.json({ error: 'Too many requests. Try again in a few minutes.' }, { status: 429 });
  }

  let file: File | null = null;
  let lang = '';
  try {
    const form = await req.formData();
    const f = form.get('audio');
    if (f instanceof File) file = f;
    lang = String(form.get('language') ?? '').trim().slice(0, 8);
  } catch { /* fall through */ }
  if (!file || file.size === 0) return NextResponse.json({ error: 'audio required' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'audio too large' }, { status: 413 });

  try {
    const r = await transcribe(file, { languageCode: lang || undefined, mime: file.type || undefined });
    return NextResponse.json({ ok: true, text: r.text, language: r.language ?? null });
  } catch (e) {
    queries.logError({ source: 'voice-stt', message: (e as Error).message });
    return NextResponse.json({ error: 'transcription unavailable' }, { status: 502 });
  }
}

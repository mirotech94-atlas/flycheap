import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/apiGuard';
import { queries } from '@/lib/db';
import { isConfigured, synthesize, speakable } from '@/lib/elevenlabs';

export const dynamic = 'force-dynamic';

/**
 * POST { text } → audio/mpeg. The concierge's spoken reply.
 *
 * GUARD: middleware.ts does not run on api/ routes, so this handler is the
 * only thing protecting it. Signed-in only — TTS is metered per character on
 * the ElevenLabs account, so an open endpoint is an open wallet. Rate-limited
 * per user on top for the same reason.
 *
 * 503 when ElevenLabs is not configured: the widget treats that as "use the
 * browser voice", which is what it did before this route existed.
 */
export async function POST(req: Request) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.response;
  if (!isConfigured()) return NextResponse.json({ error: 'voice not configured' }, { status: 503 });
  if (!queries.rateLimitCheck('voice-tts', String(auth.user.id), 60, 300)) {
    return NextResponse.json({ error: 'Too many requests. Try again in a few minutes.' }, { status: 429 });
  }

  let text = '';
  try { text = String(((await req.json()) as { text?: unknown }).text ?? ''); } catch { /* fall through */ }
  text = text.trim();
  if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 });
  // A concierge reply is a paragraph or two. Anything longer is a mistake or
  // an abuse attempt, and either way should not be billed.
  if (text.length > 2000) text = text.slice(0, 2000);

  try {
    const { audio, contentType } = await synthesize(speakable(text), { model: 'eleven_flash_v2_5' });
    return new Response(new Uint8Array(audio), {
      status: 200,
      headers: { 'Content-Type': contentType, 'Cache-Control': 'private, no-store', 'Content-Length': String(audio.length) },
    });
  } catch (e) {
    queries.logError({ source: 'voice-tts', message: (e as Error).message });
    return NextResponse.json({ error: 'voice unavailable' }, { status: 502 });
  }
}

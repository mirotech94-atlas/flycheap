/**
 * ElevenLabs — the one place the app talks to it.
 *
 * Three consumers: the concierge's spoken replies (ChatWidget → /api/voice/tts),
 * the concierge's microphone (ChatWidget → /api/voice/stt), and the daily ops
 * brief as an audio file (insights agent). Everything here is server-only; the
 * key never reaches the browser.
 *
 * `isConfigured()` is the switch. When the key is absent every caller falls
 * back to what it did before — the browser's own speech engines, or no audio
 * — so a missing key degrades quietly rather than failing. `isConfigured`
 * means the env var is set, nothing more (CLAUDE.md: isConfigured ≠ enabled).
 */

const BASE = 'https://api.elevenlabs.io/v1';

export function isConfigured(): boolean {
  return !!(process.env.ELEVENLABS_API_KEY || '').trim();
}

function key(): string {
  const k = (process.env.ELEVENLABS_API_KEY || '').trim();
  if (!k) throw new Error('ELEVENLABS_API_KEY is not set');
  return k;
}

/** The concierge voice. Override per environment; the default is the model's
 *  own "Sarah" — a calm, clear, mid-register voice that reads fares without
 *  sounding like an ad. Set ELEVENLABS_VOICE_ID to any voice from the
 *  library, including a cloned one. */
export function conciergeVoiceId(): string {
  return (process.env.ELEVENLABS_VOICE_ID || '').trim() || 'EXAVITQu4vr4xnSDxMaL';
}

/** Multilingual v2 reads the mixed IATA-code / price / date content cleanly and
 *  covers the eight app locales without a per-language voice. Flash is ~3x
 *  cheaper and lower latency; the concierge uses it for short replies. */
export type TtsModel = 'eleven_multilingual_v2' | 'eleven_flash_v2_5' | 'eleven_turbo_v2_5';

export type TtsOptions = {
  voiceId?: string;
  model?: TtsModel;
  /** 'mp3_44100_128' is the sweet spot for playback; 'mp3_22050_32' for the
   *  brief attachment where size matters more than fidelity. */
  format?: 'mp3_44100_128' | 'mp3_22050_32' | 'mp3_44100_64';
  stability?: number;
  similarity?: number;
  /** ElevenLabs reads "JFK" as a word unless told otherwise; the concierge
   *  passes its text through `speakable()` first. */
};

/** Text → MP3 bytes. Throws on any non-2xx so callers can fall back. */
export async function synthesize(text: string, opts: TtsOptions = {}): Promise<{ audio: Buffer; contentType: string }> {
  const voice = opts.voiceId || conciergeVoiceId();
  const format = opts.format || 'mp3_44100_128';
  const res = await fetch(`${BASE}/text-to-speech/${encodeURIComponent(voice)}?output_format=${format}`, {
    method: 'POST',
    headers: { 'xi-api-key': key(), 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({
      text,
      model_id: opts.model || 'eleven_flash_v2_5',
      voice_settings: {
        stability: opts.stability ?? 0.5,
        similarity_boost: opts.similarity ?? 0.75,
        style: 0,
        use_speaker_boost: true,
      },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`elevenlabs tts ${res.status}: ${detail.slice(0, 200)}`);
  }
  return { audio: Buffer.from(await res.arrayBuffer()), contentType: 'audio/mpeg' };
}

/** Audio bytes → transcript, via Scribe. Accepts whatever the browser's
 *  MediaRecorder produced (webm/opus, mp4, wav). */
export async function transcribe(audio: Blob | Buffer, opts: { languageCode?: string; mime?: string } = {}): Promise<{ text: string; language?: string }> {
  const form = new FormData();
  const blob = audio instanceof Blob ? audio : new Blob([new Uint8Array(audio)], { type: opts.mime || 'audio/webm' });
  form.append('file', blob, 'speech.webm');
  form.append('model_id', 'scribe_v1');
  if (opts.languageCode) form.append('language_code', opts.languageCode);
  form.append('tag_audio_events', 'false');
  const res = await fetch(`${BASE}/speech-to-text`, {
    method: 'POST',
    headers: { 'xi-api-key': key() },
    body: form,
    signal: AbortSignal.timeout(45_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`elevenlabs stt ${res.status}: ${detail.slice(0, 200)}`);
  }
  const j = await res.json() as { text?: string; language_code?: string };
  return { text: (j.text || '').trim(), language: j.language_code };
}

/**
 * Make fare copy read aloud the way a person would say it. Airport codes are
 * spelled letter by letter, prices become "five hundred and thirty six
 * dollars", and the arrow becomes "to". Applied to spoken text only; the
 * written reply on screen is untouched.
 */
export function speakable(text: string): string {
  return text
    // "$536" / "$1,023" → the number in words is left to the model, but the
    // symbol must go: ElevenLabs says "dollar sign five thirty six" otherwise.
    .replace(/\$\s?([\d,]+)(\.\d+)?/g, (_m, whole: string) => `${whole.replace(/,/g, '')} dollars`)
    // JFK → CAI  ⇒  "J F K to C A I"
    .replace(/\b([A-Z]{3})\s*(?:→|->|—>|-)\s*([A-Z]{3})\b/g, (_m, a: string, b: string) => `${a.split('').join(' ')} to ${b.split('').join(' ')}`)
    // Any remaining bare IATA code in caps
    .replace(/\b([A-Z]{3})\b/g, (m: string) => /^(THE|AND|FOR|NOW|YOU|USD|MAX|MIN|NEW|LOW|TOP|ALL|OFF|PER|VIA|SAT|SUN|MON|TUE|WED|THU|FRI|JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)$/.test(m) ? m : m.split('').join(' '))
    .replace(/→/g, ' to ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

'use client';

/**
 * Voice Console — full-viewport overlay for hands-free conversation with FarePilot.
 *
 * Activates when the user enables "Voice mode" from the chat widget. While
 * active:
 *   - Microphone runs in continuous listening mode
 *   - After ~3 seconds of silence the user's question auto-sends
 *   - The reply is shown LARGE on this overlay (not in the small chat bubble)
 *   - The globe arcs to whatever cities FarePilot mentions
 *   - If FarePilot's reply references a /routes/<x>-<y> or /destinations/<iata>
 *     URL we know exists, a "Take me there" chip lets the user navigate
 *
 * Echo prevention: while TTS is speaking, the mic is muted by the parent
 * (ChatWidget). Resumes after onend.
 *
 * The console intentionally does NOT replace the small ChatWidget — it
 * overlays. Toggle off and you're back to the text-first UI with full
 * history intact.
 */

import { useEffect, useMemo } from 'react';
import { useGlobe } from '@/lib/globeStore';
import { ConciergeAvatar } from './ConciergeAvatar';

export type NavChip = { label: string; href: string };

export function VoiceConsole({
  open,
  onClose,
  liveTranscript,
  latestUserMessage,
  latestReply,
  pending,
  navChips,
  voiceTtsOn,
  onToggleTts,
  alwaysListen,
  onToggleAlwaysListen,
}: {
  open: boolean;
  onClose: () => void;
  /** Interim STT result while user is still speaking. */
  liveTranscript: string;
  /** Last complete user message (after silence timer fires). */
  latestUserMessage: string | null;
  /** Most recent assistant reply. */
  latestReply: string | null;
  pending: boolean;
  navChips: NavChip[];
  voiceTtsOn: boolean;
  onToggleTts: () => void;
  alwaysListen: boolean;
  onToggleAlwaysListen: () => void;
}) {
  const globe = useGlobe();

  const avatarMode: 'idle' | 'thinking' | 'listening' | 'speaking' =
    globe.speaking ? 'speaking'
    : globe.listening ? 'listening'
    : pending ? 'thinking'
    : 'idle';

  // Force globe expanded while console is open — it's the centerpiece here.
  useEffect(() => {
    if (open) globe.setCollapsed(false);
  }, [open, globe]);

  // Keyboard escape closes the console.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const statusBlurb = useMemo(() => {
    if (avatarMode === 'listening') {
      return liveTranscript ? `Listening… "${liveTranscript}"` : 'I\'m listening. Take your time.';
    }
    if (avatarMode === 'thinking') return 'Checking the fare data…';
    if (avatarMode === 'speaking') return 'Replying out loud…';
    return alwaysListen ? 'Mic is open. Just ask.' : 'Tap the mic and ask.';
  }, [avatarMode, liveTranscript, alwaysListen]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 no-print bg-slate-950/85 backdrop-blur-2xl flex flex-col motion-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label="Voice console"
    >
      {/* Top bar — title + close */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <ConciergeAvatar mode={avatarMode} size="lg" />
          <div>
            <div className="font-display font-semibold text-white text-lg tracking-tight">FarePilot · Voice Console</div>
            <div className="text-xs text-white/60 mt-0.5">{statusBlurb}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleAlwaysListen}
            className={`text-[11px] uppercase tracking-[0.14em] font-semibold px-3 py-1.5 rounded-full border transition ${
              alwaysListen
                ? 'bg-red-500/20 border-red-400/40 text-red-100'
                : 'bg-white/5 border-white/15 text-white/70 hover:text-white hover:bg-white/10'
            }`}
            aria-pressed={alwaysListen}
            title="Continuous mic. After ~3s of silence your question auto-sends."
          >
            {alwaysListen ? '● Mic always on' : '○ Mic always on'}
          </button>
          <button
            type="button"
            onClick={onToggleTts}
            className={`text-[11px] uppercase tracking-[0.14em] font-semibold px-3 py-1.5 rounded-full border transition ${
              voiceTtsOn
                ? 'bg-amber-300/20 border-amber-300/40 text-amber-100'
                : 'bg-white/5 border-white/15 text-white/70 hover:text-white hover:bg-white/10'
            }`}
            aria-pressed={voiceTtsOn}
          >
            {voiceTtsOn ? '🔊 Replies out loud' : '🔈 Silent replies'}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-white/70 hover:text-white text-xs uppercase tracking-[0.14em] font-semibold px-3 py-1.5 rounded-full bg-white/5 border border-white/15 hover:bg-white/10 transition"
            aria-label="Close voice console (Esc)"
          >
            Esc · Close
          </button>
        </div>
      </header>

      {/* Body: left = transcript, center spacer for globe (which is its own
          fixed-position component), right = reply */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 px-6 py-6 overflow-hidden">
        {/* LEFT: what the user said + nav chips */}
        <aside className="bg-white/[0.03] border border-white/10 rounded-2xl p-5 overflow-y-auto">
          <div className="text-[10px] uppercase tracking-[0.18em] text-white/40 font-semibold mb-3">You said</div>
          {liveTranscript || latestUserMessage ? (
            <p className="text-white text-lg leading-relaxed font-light">
              {liveTranscript || latestUserMessage}
            </p>
          ) : (
            <p className="text-white/40 text-sm italic">
              {alwaysListen
                ? 'Mic is open. Start talking — your question auto-sends after a short pause.'
                : 'Tap the mic button in the chat panel below to ask.'}
            </p>
          )}

          {navChips.length > 0 && (
            <>
              <div className="text-[10px] uppercase tracking-[0.18em] text-white/40 font-semibold mt-6 mb-3">
                Open in app
              </div>
              <div className="flex flex-col gap-2">
                {navChips.map(c => (
                  <a
                    key={c.href}
                    href={c.href}
                    className="block text-sm font-medium text-emerald-300 hover:text-emerald-200 hover:bg-emerald-300/5 border border-emerald-300/20 hover:border-emerald-300/40 rounded-lg px-3 py-2 transition"
                  >
                    {c.label} <span className="text-white/40 text-xs ml-1">{c.href}</span>
                  </a>
                ))}
              </div>
            </>
          )}
        </aside>

        {/* CENTER: just empty space — the GlobeHUD already renders fixed-position bottom-right
            and naturally fills this column visually because of its z-stack. */}
        <div className="hidden lg:block" />

        {/* RIGHT: FarePilot's reply, large */}
        <aside className="bg-white/[0.03] border border-white/10 rounded-2xl p-5 overflow-y-auto">
          <div className="text-[10px] uppercase tracking-[0.18em] text-white/40 font-semibold mb-3 flex items-center justify-between">
            <span>FarePilot</span>
            {pending && (
              <span className="text-emerald-300/80 normal-case tracking-normal text-[11px] font-normal">working on it…</span>
            )}
          </div>
          {latestReply ? (
            <p className="text-white text-xl leading-[1.6] font-light whitespace-pre-wrap">
              {latestReply}
            </p>
          ) : pending ? (
            <div className="inline-flex gap-1.5 mt-2">
              <span className="w-2 h-2 rounded-full bg-white/40 animate-bounce" />
              <span className="w-2 h-2 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '120ms' }} />
              <span className="w-2 h-2 rounded-full bg-white/40 animate-bounce" style={{ animationDelay: '240ms' }} />
            </div>
          ) : (
            <p className="text-white/40 text-sm italic">
              Ask anything — fare check, best month to fly, where to go on a budget. Try: <em>&ldquo;Where can I fly cheap from JFK next month?&rdquo;</em>
            </p>
          )}
        </aside>
      </div>

      {/* Footer hint */}
      <footer className="px-6 py-3 border-t border-white/10 text-[11px] text-white/40 flex items-center justify-between">
        <span>The globe in the corner lights up routes as FarePilot mentions them.</span>
        <span className="font-mono uppercase tracking-[0.18em]">Voice console · v1</span>
      </footer>
    </div>
  );
}

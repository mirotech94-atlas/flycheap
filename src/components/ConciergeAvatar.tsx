'use client';

/**
 * Animated avatar for FarePilot, the concierge persona.
 *
 * Renders a circular badge containing a 5-bar audio waveform that lives in
 * one of four states:
 *
 *   - idle      → slow, gentle breathing wave (1.8s cycle)
 *   - thinking  → soft mid-amplitude pulse while a reply is loading
 *   - listening → erratic, mic-active wave (0.6s cycle) when the user is
 *                 talking; red accent ring
 *   - speaking  → tighter, higher-amplitude wave when TTS is reading the
 *                 reply aloud; teal accent ring
 *
 * State is passed in from the consumer (ChatWidget) so the same component
 * can render the launcher button, the chat-panel header, and per-message
 * bubbles — each in the right state at the right time.
 *
 * The mark is a pair of aviator wings — FarePilot is a pilot — that gently
 * breathe, faster while thinking/listening/speaking, with a per-mode ring
 * glow. Premium and on-name, rather than a generic chat bubble.
 */

type Mode = 'idle' | 'thinking' | 'listening' | 'speaking';
type Size = 'sm' | 'md' | 'lg';

const DIMENSIONS: Record<Size, { box: number; ring: string; pad: number }> = {
  sm: { box: 28, ring: 'ring-1', pad: 0 },
  md: { box: 44, ring: 'ring-1', pad: 0 },
  lg: { box: 64, ring: 'ring-2', pad: 0 },
};

export function ConciergeAvatar({
  mode = 'idle',
  size = 'md',
  className = '',
  ariaLabel = 'FarePilot, your travel concierge',
}: {
  mode?: Mode;
  size?: Size;
  className?: string;
  ariaLabel?: string;
}) {
  const d = DIMENSIONS[size];

  // Per-mode ring + glow tones. Tailwind classes resolved at build time, so
  // we list them here rather than building strings dynamically (which would
  // get purged).
  const ringTone =
    mode === 'speaking' ? 'ring-[var(--nc-teal)]/70 shadow-[0_0_18px_rgba(111,179,201,0.50)]'
    : mode === 'listening' ? 'ring-red-300/70 shadow-[0_0_18px_rgba(239,68,68,0.5)]'
    : mode === 'thinking' ? 'ring-emerald-300/60 shadow-[0_0_14px_rgba(16,185,129,0.45)]'
    : 'ring-white/30 shadow-[0_0_10px_rgba(255,255,255,0.18)]';

  // Animation classes — defined in the inline <style> block below so we
  // don't depend on globals.css edits.
  const waveClass = `nadia-wave nadia-wave--${mode}`;

  return (
    <div
      role="img"
      aria-label={ariaLabel}
      className={`relative inline-grid place-items-center rounded-full ${d.ring} ${ringTone} bg-brand-gradient transition-shadow duration-300 ${className}`}
      style={{ width: d.box, height: d.box }}
    >
      <svg viewBox="0 0 64 64" width="72%" height="72%" className={waveClass} aria-hidden="true">
        {/* Aviator wings — FarePilot. Gold on the navy badge. */}
        <path d="M31 32 C22 26.5 14.5 27.5 7 33 C16.5 33 24 34 31 34.4 Z" fill="var(--nc-teal)" />
        <path d="M33 32 C42 26.5 49.5 27.5 57 33 C47.5 33 40 34 33 34.4 Z" fill="var(--nc-teal)" />
        <circle cx="32" cy="32" r="7.5" fill="none" stroke="var(--nc-teal)" strokeWidth="2.2" />
        <circle cx="32" cy="32" r="2.6" fill="var(--nc-teal)" />
      </svg>
      {/* Online indicator — a tiny pulse dot bottom-right, only for sm/md */}
      {size !== 'lg' && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 rounded-full ring-2 ring-brand-700 ${
            mode === 'listening' ? 'bg-red-400 animate-pulse'
            : mode === 'speaking' ? 'bg-amber-300 animate-pulse'
            : 'bg-emerald-400'
          }`}
          style={{ width: size === 'sm' ? 8 : 10, height: size === 'sm' ? 8 : 10 }}
          aria-hidden
        />
      )}

      {/* Scoped animation styles. Per-bar phase + per-mode amplitude/speed.
          Keeps the avatar self-contained so it can be lifted into any page
          without touching globals.css. */}
      <style jsx>{`
        .nadia-wave { transform-origin: center; will-change: transform; }
        .nadia-wave--idle      { animation: wing-breathe 3s   ease-in-out infinite; }
        .nadia-wave--thinking  { animation: wing-breathe 1.4s ease-in-out infinite; }
        .nadia-wave--listening { animation: wing-breathe 0.7s ease-in-out infinite; }
        .nadia-wave--speaking  { animation: wing-breathe 0.5s ease-in-out infinite; }
        @keyframes wing-breathe {
          0%, 100% { transform: scale(0.97); opacity: 0.92; }
          50%      { transform: scale(1.05); opacity: 1; }
        }
      `}</style>
    </div>
  );
}


/** The bare aviator-wings glyph in `currentColor` — for buttons/labels that
 *  don't want the full circular badge (e.g. the chat launcher). */
export function WingsMark({ size = 22, className = '' }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} fill="none" className={className} aria-hidden="true">
      <path d="M31 32 C22 26.5 14.5 27.5 7 33 C16.5 33 24 34 31 34.4 Z" fill="currentColor" />
      <path d="M33 32 C42 26.5 49.5 27.5 57 33 C47.5 33 40 34 33 34.4 Z" fill="currentColor" />
      <circle cx="32" cy="32" r="7.5" fill="none" stroke="currentColor" strokeWidth="2.4" />
      <circle cx="32" cy="32" r="2.6" fill="currentColor" />
    </svg>
  );
}

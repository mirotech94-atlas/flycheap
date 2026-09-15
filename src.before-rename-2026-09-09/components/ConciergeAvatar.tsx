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
 *                 reply aloud; brand-gold accent ring
 *
 * State is passed in from the consumer (ChatWidget) so the same component
 * can render the launcher button, the chat-panel header, and per-message
 * bubbles — each in the right state at the right time.
 *
 * Why a waveform: a corporate ✈️ emoji or compass mark says "chatbot." A
 * live waveform that reacts to the conversation says "actual voice
 * assistant." It's the visual cue users already trust from Siri, Alexa,
 * ChatGPT voice — and it earns the "premium" framing the rest of the
 * design system is reaching for.
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
    mode === 'speaking' ? 'ring-amber-300/70 shadow-[0_0_18px_rgba(212,175,55,0.55)]'
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
      <svg
        viewBox="0 0 48 48"
        width="100%"
        height="100%"
        className={waveClass}
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="nadia-bar" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0.7" />
          </linearGradient>
        </defs>
        {/* 5 vertical bars, centered. Each bar's scaleY is driven by the
            CSS keyframes below, with a per-bar phase delay so the wave reads
            as a continuous motion rather than 5 in unison. transform-box
            keeps the scale anchored to each bar's own center. */}
        <g style={{ transformOrigin: 'center', transformBox: 'fill-box' as unknown as 'fill-box' }}>
          {[12, 18, 24, 30, 36].map((cx, i) => (
            <rect
              key={cx}
              x={cx - 1.4}
              y={20}
              width={2.8}
              height={8}
              rx={1.4}
              fill="url(#nadia-bar)"
              className={`nadia-bar nadia-bar--${i}`}
              style={{ transformOrigin: `${cx}px 24px`, transformBox: 'fill-box' as unknown as 'fill-box' }}
            />
          ))}
        </g>
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
        .nadia-wave .nadia-bar {
          will-change: transform;
          animation: nadia-bounce 1.8s ease-in-out infinite;
          transform-origin: center;
          transform-box: fill-box;
        }
        .nadia-bar--0 { animation-delay: 0s; }
        .nadia-bar--1 { animation-delay: 0.12s; }
        .nadia-bar--2 { animation-delay: 0.24s; }
        .nadia-bar--3 { animation-delay: 0.36s; }
        .nadia-bar--4 { animation-delay: 0.48s; }

        /* idle — gentle breathing */
        .nadia-wave--idle .nadia-bar { animation-duration: 1.8s; }

        /* thinking — slightly faster + reduced amplitude */
        .nadia-wave--thinking .nadia-bar {
          animation-name: nadia-pulse;
          animation-duration: 1.1s;
        }

        /* listening — erratic, faster, full amplitude */
        .nadia-wave--listening .nadia-bar {
          animation-name: nadia-listen;
          animation-duration: 0.6s;
        }

        /* speaking — rhythmic, taller bars, brand-gold flash */
        .nadia-wave--speaking .nadia-bar {
          animation-name: nadia-speak;
          animation-duration: 0.45s;
        }

        @keyframes nadia-bounce {
          0%, 100% { transform: scaleY(0.6); opacity: 0.78; }
          50%      { transform: scaleY(1.2); opacity: 1; }
        }
        @keyframes nadia-pulse {
          0%, 100% { transform: scaleY(0.75); }
          50%      { transform: scaleY(1.15); }
        }
        @keyframes nadia-listen {
          0%   { transform: scaleY(0.4); }
          25%  { transform: scaleY(1.4); }
          50%  { transform: scaleY(0.7); }
          75%  { transform: scaleY(1.55); }
          100% { transform: scaleY(0.5); }
        }
        @keyframes nadia-speak {
          0%, 100% { transform: scaleY(0.5); }
          50%      { transform: scaleY(1.7); }
        }
      `}</style>
    </div>
  );
}

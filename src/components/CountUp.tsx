'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Animate a number from 0 (or any start) up to `value` over `duration` ms.
 *
 * - Uses `requestAnimationFrame` and an `easeOutCubic` curve so the
 *   number decelerates as it approaches the target — feels natural, not
 *   robotic.
 * - Skips the animation if the user has `prefers-reduced-motion`.
 * - Format slot lets callers control thousands separators, currency, etc.
 *
 * Usage:
 *   <CountUp value={591} prefix="$" />
 *   <CountUp value={1.234} decimals={2} suffix="%" />
 *   <CountUp value={1234567} format={(n) => Math.round(n).toLocaleString()} />
 */
export function CountUp({
  value,
  duration = 900,
  start = 0,
  decimals = 0,
  prefix = '',
  suffix = '',
  format,
  className,
}: {
  value: number;
  duration?: number;
  start?: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  format?: (n: number) => string;
  className?: string;
}) {
  const [display, setDisplay] = useState<number>(start);
  const startedRef = useRef(false);

  useEffect(() => {
    // Respect reduced-motion: snap to final value.
    const reduced = typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) { setDisplay(value); return; }

    // Only animate on first mount; subsequent value changes snap (avoid
    // re-animating when SSR-streamed numbers update via revalidate).
    if (startedRef.current) { setDisplay(value); return; }
    startedRef.current = true;

    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const elapsed = now - t0;
      const t = Math.min(1, elapsed / duration);
      // easeOutCubic
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(start + (value - start) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
      else setDisplay(value);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, start]);

  const text = format
    ? format(display)
    : `${prefix}${display.toLocaleString('en-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}${suffix}`;

  return <span className={className}>{text}</span>;
}

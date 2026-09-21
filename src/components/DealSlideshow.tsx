'use client';

import { Children, useCallback, useEffect, useRef, useState } from 'react';

/**
 * Auto-advancing slideshow with a horizontal slide transition.
 * Server-rendered slides are passed as children (same pattern as DealCarousel):
 * each child becomes one full-width slide. Pauses on hover/touch, arrows +
 * dot navigation, wraps around. Respects prefers-reduced-motion.
 */
export function DealSlideshow({
  children,
  intervalMs = 5000,
  heightClass = 'h-[340px] md:h-[380px]',
  label = 'Deals slideshow',
}: {
  children: React.ReactNode;
  intervalMs?: number;
  heightClass?: string;
  label?: string;
}) {
  const slides = Children.toArray(children);
  const count = slides.length;
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const reducedMotion = useRef(false);

  useEffect(() => {
    try {
      reducedMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {}
  }, []);

  const go = useCallback((next: number) => {
    setIdx(((next % count) + count) % count);
  }, [count]);

  useEffect(() => {
    if (count <= 1 || paused || reducedMotion.current) return;
    const t = setInterval(() => setIdx(i => (i + 1) % count), intervalMs);
    return () => clearInterval(t);
  }, [count, paused, intervalMs]);

  if (count === 0) return null;

  return (
    <div
      className="relative group/show"
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
    >
      {/* Track */}
      <div className={`overflow-hidden ${heightClass}`}>
        <div
          className="flex h-full transition-transform duration-700 ease-[cubic-bezier(.22,.61,.36,1)]"
          style={{ transform: `translateX(-${idx * 100}%)` }}
        >
          {slides.map((s, i) => (
            <div
              key={i}
              className="w-full h-full shrink-0"
              aria-hidden={i !== idx}
            >
              {s}
            </div>
          ))}
        </div>
      </div>

      {/* Arrows */}
      {count > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous slide"
            onClick={() => go(idx - 1)}
            className="ed-show-arrow left-3 opacity-0 group-hover/show:opacity-100 focus:opacity-100"
          >‹</button>
          <button
            type="button"
            aria-label="Next slide"
            onClick={() => go(idx + 1)}
            className="ed-show-arrow right-3 opacity-0 group-hover/show:opacity-100 focus:opacity-100"
          >›</button>
        </>
      )}

      {/* Dots + progress */}
      {count > 1 && (
        <div className="ed-show-dots">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Go to slide ${i + 1}`}
              onClick={() => go(i)}
              className={`ed-show-dot${i === idx ? ' active' : ''}`}
            />
          ))}
        </div>
      )}

      {/* Slide counter */}
      {count > 1 && (
        <div className="ed-show-count">
          {idx + 1} / {count}
        </div>
      )}
    </div>
  );
}

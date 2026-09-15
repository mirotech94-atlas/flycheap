'use client';

import { useState, type ReactNode } from 'react';

type Slide = {
  key: string;
  label: string;
  content: ReactNode;
};

export function PriceHistoryCarousel({ slides }: { slides: Slide[] }) {
  const [idx, setIdx] = useState(0);
  if (slides.length === 0) return null;
  const safe = Math.min(idx, slides.length - 1);
  const cur = slides[safe];
  const prev = () => setIdx(i => (i - 1 + slides.length) % slides.length);
  const next = () => setIdx(i => (i + 1) % slides.length);

  return (
    <div className="card relative overflow-hidden">
      <div className="card-head">
        <div>
          <div className="eyebrow">Price intelligence</div>
          <h2 className="!mb-0">
            {cur.label}
            <span className="ml-2 text-xs text-slate-400 font-normal">{safe + 1} / {slides.length}</span>
          </h2>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={prev}
            disabled={slides.length < 2}
            aria-label="Previous"
            className="btn btn-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >‹</button>
          <button
            type="button"
            onClick={next}
            disabled={slides.length < 2}
            aria-label="Next"
            className="btn btn-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >›</button>
        </div>
      </div>

      <div className="motion-fade-in" key={cur.key}>
        {cur.content}
      </div>

      {slides.length > 1 && (
        <div className="flex items-center justify-center gap-1.5 mt-3 pt-3 border-t border-slate-200/60 dark:border-slate-700">
          {slides.map((s, i) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setIdx(i)}
              aria-label={`Go to ${s.label}`}
              className={`h-1.5 rounded-full transition-all ${
                i === safe ? 'w-8 bg-brand' : 'w-1.5 bg-slate-300 dark:bg-slate-700 hover:bg-slate-400'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

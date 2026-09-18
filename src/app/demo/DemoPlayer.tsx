'use client';

import { useRef, useState } from 'react';

export type Chapter = { t: number; label: string; desc: string };

function fmt(s: number) {
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

export function DemoPlayer({ src, poster, chapters }: { src: string; poster: string; chapters: Chapter[] }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [active, setActive] = useState(0);

  function seek(t: number, i: number) {
    const v = ref.current;
    if (!v) return;
    v.currentTime = t;
    v.play().catch(() => {});
    setActive(i);
  }

  function onTime() {
    const v = ref.current;
    if (!v) return;
    let i = 0;
    for (let c = 0; c < chapters.length; c++) if (v.currentTime >= chapters[c].t) i = c;
    if (i !== active) setActive(i);
  }

  return (
    <div className="fc-demo-layout">
      <div className="fc-demo-stage">
        <div className="fc-l-preview-chrome">
          <div className="dots"><div className="dot" /><div className="dot" /><div className="dot" /></div>
          <div className="url">flycheap.live / <strong>live demo</strong></div>
        </div>
        <video
          ref={ref}
          src={src}
          poster={poster}
          controls
          playsInline
          preload="metadata"
          onTimeUpdate={onTime}
        />
      </div>
      <div className="fc-demo-chapters">
        <div className="fc-demo-chapters-head">Chapters · click to jump</div>
        {chapters.map((c, i) => (
          <button
            key={c.t}
            type="button"
            className={`fc-demo-chapter${i === active ? ' active' : ''}`}
            onClick={() => seek(c.t, i)}
          >
            <span className="ts">{fmt(c.t)}</span>
            <span className="body">
              <span className="label">{c.label}</span>
              <span className="desc">{c.desc}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

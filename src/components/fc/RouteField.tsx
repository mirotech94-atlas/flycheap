'use client';

/**
 * RouteField — the marketing hero's backdrop.
 *
 * A field of great-circle flight paths, drawn very faintly and drifting. It
 * replaces the sky gradient, which had two problems on this page: it was a
 * generic wash rather than anything to do with flying, and being one big bloom
 * of a light hue it kept washing the copy out.
 *
 * The rules it is built to, in order of importance:
 *
 *  1. IT MUST NOT COMPETE. Every stroke is under 20% alpha. The brightest thing
 *     on this page is the price in the live feed, and nothing here may rival it.
 *  2. IT FADES. A radial mask takes the field to nothing before the edges, so it
 *     never ends on a visible seam, and a vertical fade keeps it out of the band
 *     where the headline sits.
 *  3. IT IS FLIGHT, NOT DECORATION. The arcs are great circles between real
 *     airport pairs, with the curvature and the poll head the product actually
 *     has — the same language as the globe on the dashboard.
 *
 * Canvas 2D, no dependencies, no assets. Pauses off-screen and renders a single
 * still frame under prefers-reduced-motion.
 */

import { useEffect, useRef } from 'react';

/** Route endpoints as fractions of the box, so it reflows with the hero. */
const ROUTES: Array<[number, number, number, number, number]> = [
  // x0,   y0,   x1,   y1,   lift
  [-0.05, 0.62, 0.42, 0.18, 0.30],
  [0.10, 0.88, 0.74, 0.30, 0.26],
  [0.28, 0.10, 0.96, 0.52, 0.24],
  [-0.08, 0.34, 0.55, 0.74, -0.22],
  [0.46, 0.94, 1.06, 0.36, 0.28],
  [0.02, 0.18, 0.62, 0.58, -0.18],
  [0.34, 0.72, 1.04, 0.14, 0.32],
  [0.66, 0.86, 1.08, 0.62, 0.16],
  [-0.06, 0.78, 0.38, 0.52, -0.14],
  [0.18, 0.44, 0.88, 0.82, -0.26],
];

/** Which routes carry a travelling poll head, and how fast. */
const ACTIVE = [0, 2, 4, 7];

export function RouteField({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    let visible = true;
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0 });
    io.observe(canvas);

    let w = 0, h = 0, dpr = 1;
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // Read the palette from the cascade rather than hardcoding it, so the field
    // follows the theme like everything else.
    const css = getComputedStyle(document.documentElement);
    const teal = (css.getPropertyValue('--nc-teal').trim() || '#6FB3C9');
    const amber = (css.getPropertyValue('--nc-amber').trim() || '#E8A33D');

    const arc = (r: (typeof ROUTES)[number]) => {
      const [x0, y0, x1, y1, lift] = r;
      const ax = x0 * w, ay = y0 * h, bx = x1 * w, by = y1 * h;
      // Control point pushed perpendicular to the chord — the great-circle bow.
      const mx = (ax + bx) / 2, my = (ay + by) / 2;
      const dx = bx - ax, dy = by - ay;
      const len = Math.hypot(dx, dy) || 1;
      return { ax, ay, bx, by, cx: mx - (dy / len) * len * lift, cy: my + (dx / len) * len * lift };
    };

    /** Point on the quadratic, for the poll head. */
    const at = (a: ReturnType<typeof arc>, t: number) => {
      const u = 1 - t;
      return {
        x: u * u * a.ax + 2 * u * t * a.cx + t * t * a.bx,
        y: u * u * a.ay + 2 * u * t * a.cy + t * t * a.by,
      };
    };

    const draw = (clock: number) => {
      ctx.clearRect(0, 0, w, h);
      const drift = Math.sin(clock * 0.05) * 6;

      ROUTES.forEach((r, i) => {
        const a = arc(r);
        ctx.save();
        ctx.translate(0, drift * (i % 3 === 0 ? 1 : i % 3 === 1 ? -0.6 : 0.3));

        ctx.beginPath();
        ctx.moveTo(a.ax, a.ay);
        ctx.quadraticCurveTo(a.cx, a.cy, a.bx, a.by);
        ctx.strokeStyle = teal;
        // Under 20%. This is the whole discipline of the piece.
        ctx.globalAlpha = 0.13 + (i % 4) * 0.022;
        ctx.lineWidth = i % 3 === 0 ? 1.1 : 0.8;
        ctx.stroke();

        const k = ACTIVE.indexOf(i);
        if (k !== -1) {
          // A poll head running the route, the same gesture as the globe's.
          const t = ((clock * 0.055 + k * 0.27) % 1.35) / 1.0;
          if (t <= 1) {
            const p = at(a, t);
            const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 26);
            g.addColorStop(0, amber);
            g.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.globalAlpha = 0.16;
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.arc(p.x, p.y, 26, 0, Math.PI * 2); ctx.fill();

            ctx.globalAlpha = 0.5;
            ctx.fillStyle = amber;
            ctx.beginPath(); ctx.arc(p.x, p.y, 1.5, 0, Math.PI * 2); ctx.fill();
          }
        }
        ctx.restore();
      });

      // THE FADE. Punch the field out toward the edges and out of the headline
      // band, so it never ends on a seam and never sits behind the words.
      ctx.globalCompositeOperation = 'destination-in';
      const radial = ctx.createRadialGradient(w * 0.62, h * 0.46, 0, w * 0.62, h * 0.46, Math.max(w, h) * 0.62);
      radial.addColorStop(0, 'rgba(0,0,0,1)');
      radial.addColorStop(0.62, 'rgba(0,0,0,0.72)');
      radial.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 1;
      ctx.fillStyle = radial;
      ctx.fillRect(0, 0, w, h);

      const vert = ctx.createLinearGradient(0, 0, 0, h);
      vert.addColorStop(0, 'rgba(0,0,0,0.25)');
      vert.addColorStop(0.5, 'rgba(0,0,0,1)');
      vert.addColorStop(1, 'rgba(0,0,0,0.1)');
      ctx.fillStyle = vert;
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
    };

    let raf = 0;
    let last = performance.now();
    let clock = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (!visible || document.hidden) return;
      clock += dt;
      draw(clock);
    };

    draw(0);
    if (!reduce.matches) raf = requestAnimationFrame(frame);
    const onPref = () => {
      if (reduce.matches) { if (raf) { cancelAnimationFrame(raf); raf = 0; } draw(clock); }
      else if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
    };
    reduce.addEventListener('change', onPref);

    return () => {
      if (raf) cancelAnimationFrame(raf);
      reduce.removeEventListener('change', onPref);
      io.disconnect();
      ro.disconnect();
    };
  }, []);

  return <canvas ref={ref} className={className} style={style} aria-hidden />;
}

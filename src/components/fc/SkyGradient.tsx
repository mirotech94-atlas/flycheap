'use client';

/**
 * SkyGradient — night sky behind the hero.
 *
 * Adapted from the GetLayers gradient "firmament" (getlayers.ai/?layer=firmament).
 * Its contract is { mutable: ["skin"], preserve: ["motion"] }: the five colours below
 * are ours to set, the motion math in the frame loop is the vendor's and is copied
 * verbatim — it is frame-rate-independent and clamps the clock so an alt-tab costs a
 * pause rather than a lurch. Do not "tidy" it.
 *
 * Retinted to night-cabin per docs/design/getlayers.md §4: --nc-teal takes the accent
 * role at the top of the curve. --nc-amber is deliberately ABSENT — amber is reserved
 * for fares and primary actions, and a gradient is decoration by definition.
 *
 * Pure WebGL2: one fullscreen triangle, one fragment shader. No library, no assets,
 * no network. It sizes to its parent box, pauses off-screen, and renders a single
 * static frame under prefers-reduced-motion.
 */

import { useEffect, useRef } from 'react';

const CONFIG = {
  // ---- skin: night-cabin. Bottom of the curve is the cabin dark, top is dawn teal.
  bgColor: '#0B1220',   // --nc-dark
  colorA:  '#131C2E',   // --nc-deck
  colorB:  '#1B2740',   // --nc-deck-2
  colorC:  '#33506E',   // steel mid, deck-2 -> teal
  colorD:  '#6FB3C9',   // --nc-teal — "dawn through the window"

  // ---- motion + field: vendor defaults. `speed` is the house value, shared across
  //      every GetLayers gradient; it is not re-tuned per file.
  speed: 0.33, tilt: 3.1, lean: 0.045, horizon: 0.3, breathe: 0.055,
  spread: 1.05, curve: 1.7, warp: 0.13, scale: 0.55, drift: 0.085,
  roughness: 0.42, lacunarity: 2.05, contrast: 1.06, midpoint: 0.46,
  sink: 0.16, glow: 0.2, grain: 0, grainAnim: 0, dither: 1.35,
  vignette: 0.5, steer: 0.16, raise: 0.22, pourRadius: 0.55, pour: 0.42,
  smear: 0.6, infuse: 0.16,

  cursor: 1,
  parallax: 0.0017,
  maxDpr: 1,
};

const VERT = `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
out vec4 fragColor;

uniform vec2  iResolution;
uniform float iTime;
uniform vec2  iMouse;          // aspect-corrected units, same space as uv
uniform vec2  iLead;           // the pointer's lead node — ahead of iMouse while the hand moves
uniform float uPourRadius, uPour, uSmear, uInfuse;

uniform vec3  uBg, uColorA, uColorB, uColorC, uColorD;
uniform float uSpeed, uTilt, uLean, uHorizon, uBreathe, uSpread;
uniform float uCurve, uWarp, uScale, uDrift, uRoughness, uLacunarity;
uniform float uContrast, uMidpoint, uSink, uGlow, uGrain, uDither;
uniform float uVignette, uSteer, uRaise, uParallax;

#define OCTAVES 3

vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

float snoise(vec2 p) {
  const float K1 = 0.366025404, K2 = 0.211324865;
  vec2 i = floor(p + (p.x + p.y) * K1);
  vec2 a = p - i + (i.x + i.y) * K2;
  float m = step(a.y, a.x);
  vec2 o = vec2(m, 1.0 - m);
  vec2 b = a - o + K2;
  vec2 c = a - 1.0 + 2.0 * K2;
  vec3 h = max(0.5 - vec3(dot(a, a), dot(b, b), dot(c, c)), 0.0);
  vec3 n = h * h * h * h * vec3(dot(a, hash2(i)), dot(b, hash2(i + o)), dot(c, hash2(i + 1.0)));
  return dot(n, vec3(70.0));
}

float fbm(vec2 p) {
  float v = 0.0, amp = 0.5;
  for (int i = 0; i < OCTAVES; i++) {
    v += amp * snoise(p);
    p *= uLacunarity;
    amp *= uRoughness;
  }
  return v;
}

vec3 ramp4(float t) {
  vec3 c = mix(uColorA, uColorB, smoothstep(0.00, 0.36, t));
  c = mix(c, uColorC, smoothstep(0.32, 0.70, t));
  c = mix(c, uColorD, smoothstep(0.66, 1.00, t));
  return c;
}

// triangular-PDF dither — the only reliable cure for 8-bit gradient banding
float triDither(vec2 fc) {
  float a = fract(sin(dot(fc, vec2(12.9898, 78.233))) * 43758.5453);
  float b = fract(sin(dot(fc + 17.0, vec2(12.9898, 78.233))) * 43758.5453);
  return (a + b - 1.0) / 255.0;
}

vec2 rot(vec2 p, float a) { float s = sin(a), c = cos(a); return mat2(c, -s, s, c) * p; }


// THE SIMPLEST THING IN THE COLLECTION, ON PURPOSE. One axis, one ramp along it, and a single
// field at a single scale allowed thirteen per cent of a say. Everything that makes a sky is in
// the CURVE: above one it crushes the ground and leaves the top a long, slow rolloff, which is
// the whole difference between this and the linear ramp a stylesheet would give you. The other
// thing that separates them is the dither, because a screen-wide smooth ramp in a dark blue is
// the exact worst case an eight-bit framebuffer has.

// ---- house grain. ONE look across the collection: an integer hash (no sin() streaks),
// triangular so it reads as film rather than static, weighted into the midtones so it
// never crusts a black or a white. Static by default; uGrainAnim re-seeds it 24×/s.
uniform float uGrainAnim;
float houseGrain(vec2 fc) {
  uvec2 q = uvec2(fc) * uvec2(1597334677u, 3812015801u)
          + uint(floor(iTime * 24.0 * uGrainAnim)) * 2654435769u;
  uint n = q.x ^ q.y; n = n * 1664525u + 1013904223u; n ^= n >> 16u; n *= 2246822519u; n ^= n >> 13u;
  float a = float(n & 0xffffu) / 65535.0;
  n *= 3266489917u; n ^= n >> 16u;
  float b = float(n & 0xffffu) / 65535.0;
  return a + b - 1.0;
}
void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * iResolution) / iResolution.y;
  float t = iTime * uSpeed;


  // ---- transfusion. The hand is not a lens and not a shift: it is a pour. Across a wide,
  // soft well the field's own coordinates are drawn INTO the cursor, so colour pools there
  // instead of sliding past; the stroke (lead minus body) drags that pool along the line
  // of travel, like pigment pulled by a wet brush; and the tone under the hand is infused
  // with the top of the palette. All of it rides on iMouse's lag, which is what makes it
  // arrive a beat late and settle — felt, not tracked.
  vec2 tfD = uv - iMouse;
  vec2 tfStroke = iLead - iMouse;
  float tfR2 = max(1e-4, uPourRadius * uPourRadius);
  float tfWell = exp(-dot(tfD, tfD) / tfR2);
  float tfWide = exp(-dot(tfD, tfD) / (tfR2 * 3.0));
  vec2 tfPour = -tfD * tfWell * uPour + tfStroke * tfWide * uSmear;
  float tfInfuse = tfWide * uInfuse * (0.55 + 0.45 * smoothstep(0.0, 0.12, length(tfStroke)));
  vec2 p = uv + tfPour - iMouse * uParallax;

  float a = uTilt + sin(t * 0.11) * uLean + iMouse.x * uSteer;
  float axis = dot(p, vec2(cos(a), sin(a)));
  float horizon = uHorizon + sin(t * 0.08 + 1.9) * uBreathe - iMouse.y * uRaise;

  float air = fbm(p * uScale + vec2(t * uDrift, -t * uDrift * 0.6));
  float h = clamp(0.5 + (axis - horizon) * uSpread + air * uWarp + tfInfuse, 0.0, 1.0);

  float f = pow(h, max(0.05, uCurve));
  f = clamp((f - uMidpoint) * uContrast + 0.5, 0.0, 1.0);


  vec3 col = ramp4(f);
  col += uColorD * uGlow * pow(f, 4.0);
  col = mix(uBg, col, smoothstep(0.0, max(0.01, uSink), f) * 0.90 + 0.10);

  col *= 1.0 - uVignette * dot(uv, uv);
  { float hgL = clamp(dot(col, vec3(0.299, 0.587, 0.114)), 0.0, 1.0);
    col += houseGrain(gl_FragCoord.xy) * uGrain * mix(1.0, 4.0 * hgL * (1.0 - hgL), 0.6); }
  col += triDither(gl_FragCoord.xy) * uDither;

  fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

export function SkyGradient({
  className,
  style,
  config,
}: {
  className?: string;
  style?: React.CSSProperties;
  /**
   * Per-placement overrides, merged over CFG. The defaults are tuned for a
   * TALL hero with its copy on the left — `tilt: 3.1` lays the axis on its side
   * so the bloom pools left rather than at the zenith. A short, centre-aligned
   * hero needs the bloom back at the top, or it falls outside the box entirely
   * and the canvas reads as flat black.
   */
  config?: Partial<typeof CONFIG>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const CFG = { ...CONFIG, ...(config ?? {}) };

    const gl = canvas.getContext('webgl2', {
      alpha: false, antialias: false, depth: false, stencil: false,
      powerPreference: 'high-performance',
    });
    // No WebGL2 (older Safari, blocked GPU): the CSS background behind the canvas
    // is the night-cabin dark, so the hero degrades to a flat ground and nothing breaks.
    if (!gl) return;

    const hexToVec3 = (hex: string): [number, number, number] => {
      const h = hex.replace('#', '');
      const n = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
      return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    };

    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) || 'shader');
      return sh;
    };

    let program: WebGLProgram;
    try {
      program = gl.createProgram()!;
      gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
      gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || 'link');
    } catch {
      return;   // never take the page down for a backdrop
    }
    gl.useProgram(program);
    gl.bindVertexArray(gl.createVertexArray());

    const LOC: Record<string, WebGLUniformLocation | null> = {};
    const loc = (n: string) => (n in LOC ? LOC[n] : (LOC[n] = gl.getUniformLocation(program, n)));
    const u1f = (n: string, v: number) => gl.uniform1f(loc(n), v);
    const u2f = (n: string, x: number, y: number) => gl.uniform2f(loc(n), x, y);
    const u3c = (n: string, hex: string) => { const c = hexToVec3(hex); gl.uniform3f(loc(n), c[0], c[1], c[2]); };

    let dpr = 1;
    // Sizes to the PARENT BOX, not the window — this is a section backdrop, not a
    // full-screen scene, which is the one structural change from the vendor source.
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, CFG.maxDpr);
      const w = Math.max(1, Math.round(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      gl.viewport(0, 0, w, h);
      gl.useProgram(program);
      u2f('iResolution', w, h);
    };

    const applyConfig = () => {
      gl.useProgram(program);
      gl.useProgram(program)
      u3c('uBg', CFG.bgColor)
      u3c('uColorA', CFG.colorA)
      u3c('uColorB', CFG.colorB)
      u3c('uColorC', CFG.colorC)
      u3c('uColorD', CFG.colorD)
      u1f('uSpeed', CFG.speed)
      u1f('uTilt', CFG.tilt)
      u1f('uLean', CFG.lean)
      u1f('uHorizon', CFG.horizon)
      u1f('uBreathe', CFG.breathe)
      u1f('uSpread', CFG.spread)
      u1f('uCurve', CFG.curve)
      u1f('uWarp', CFG.warp)
      u1f('uScale', CFG.scale)
      u1f('uDrift', CFG.drift)
      u1f('uRoughness', CFG.roughness)
      u1f('uLacunarity', CFG.lacunarity)
      u1f('uContrast', CFG.contrast)
      u1f('uMidpoint', CFG.midpoint)
      u1f('uSink', CFG.sink)
      u1f('uGlow', CFG.glow)
      u1f('uGrain', CFG.grain)
      u1f('uGrainAnim', CFG.grainAnim)
      u1f('uDither', CFG.dither)
      u1f('uVignette', CFG.vignette)
      u1f('uSteer', CFG.steer)
      u1f('uRaise', CFG.raise)
      u1f('uParallax', CFG.parallax)
      u1f('uPourRadius', CFG.pourRadius)
      u1f('uPour', CFG.pour)
      u1f('uSmear', CFG.smear)
      u1f('uInfuse', CFG.infuse)
      resize()
      resize();
    };

    const mouse = { x: 0, y: 0, tx: 0, ty: 0, ax: 0, ay: 0, rest: { x: 0, y: 0 } };
    const aim = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const a = r.width / r.height;
      mouse.tx = ((e.clientX - r.left) / r.width - 0.5) * a;
      mouse.ty = 0.5 - (e.clientY - r.top) / r.height;
    };
    window.addEventListener('pointermove', aim, { passive: true });

    const ro = new ResizeObserver(() => resize());
    ro.observe(canvas);

    let visible = true;
    const io = new IntersectionObserver(es => { visible = es[0].isIntersecting; }, { threshold: 0 });
    io.observe(canvas);

    applyConfig();
    gl.drawArrays(gl.TRIANGLES, 0, 3);   // one draw before reveal, so we never fade onto a blank canvas

    // Reduced motion: the single frame above IS the result. The vendor's own choreography
    // notes warn that a shader loop is not covered by an animation library's global skip —
    // so we stop it here rather than assuming something upstream will.
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    let raf = 0;
    const t0 = performance.now();
    let prevT = t0, clock = 0;

    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
        /* PACING — one clamped clock drives everything below it.
           `ms` is the real frame interval pinned to [4.17, 50] and `s` is that interval measured
           in 60 Hz frames, so every ease and every spring in this loop advances by elapsed TIME
           rather than by frame count — the same follow-lag on a 60, 120 or 144 Hz panel instead
           of a chase that doubles in speed when the monitor does. The upper clamp on `s` is what
           stops a dropped frame or a GC pause from flinging the chain across the screen in one
           step, and it sits low enough that no damping term can ever overshoot into a wobble.
           The shader clock is accumulated from the SAME clamped interval instead of read off the
           wall clock — rAF stops in a background tab but wall time does not, and handing the
           shader that gap is exactly what makes a field lurch on the way back. Clamped, an
           alt-tab costs a pause and never a jump. */
        const raw = now - prevT
        prevT = now
        if (!visible || document.hidden) return
        const ms = raw > 50 ? 50 : raw < 4.167 ? 4.167 : raw
        const s = ms > 36.7 ? 2.2 : ms * 0.06
        clock += ms * 0.001
      
        /* Two poles, not one. A single lerp can only decelerate INTO its target: a direction
           change hinges on a corner and the tail of every move reads as dead weight. A quick lead
           node feeding a slower body swings through the turn and coasts for a beat after the hand
           stops — the field chases the cursor instead of hanging off it. Both rates scale with
           `s`, so the lag is the same at 60 Hz and at 144. */
        const kLead = 0.105 * s, kBody = 0.043 * s
        mouse.ax += (mouse.tx - mouse.ax) * kLead
        mouse.ay += (mouse.ty - mouse.ay) * kLead
        mouse.x  += (mouse.ax - mouse.x)  * kBody
        mouse.y  += (mouse.ay - mouse.y)  * kBody
      
        u1f('iTime', clock)
        /* cursor 0: the hand is ignored and the pointer eases back to where it rested — the
           gradient goes fully ambient. Nothing else changes, so it can be flipped live. */
        if (mouse.rest === undefined) mouse.rest = { x: mouse.tx, y: mouse.ty }
        if (!CFG.cursor) { mouse.tx = mouse.rest.x; mouse.ty = mouse.rest.y }
        u2f('iMouse', mouse.x, mouse.y)
        u2f('iLead', mouse.ax, mouse.ay)
        gl.drawArrays(gl.TRIANGLES, 0, 3)
    };

    const start = () => { if (!raf && !reduced.matches) { prevT = performance.now(); raf = requestAnimationFrame(frame); } };
    const stop = () => { if (raf) { cancelAnimationFrame(raf); raf = 0; } };
    const onPref = () => (reduced.matches ? stop() : start());
    reduced.addEventListener('change', onPref);
    start();

    return () => {
      stop();
      reduced.removeEventListener('change', onPref);
      window.removeEventListener('pointermove', aim);
      ro.disconnect();
      io.disconnect();
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, []);

  return <canvas ref={canvasRef} className={className} style={style} aria-hidden />;
}

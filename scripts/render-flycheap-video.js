const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');

const W = 1080;
const H = 1920;
const FPS = 10;
const DURATION = 30;
const FRAMES = FPS * DURATION;
const OUT_DIR = path.join(process.cwd(), 'social', 'flycheap-new-design-frames');

const colors = {
  ink: '#0a1426',
  navy: '#0a3a6b',
  navy2: '#0d2540',
  navy3: '#061a35',
  gold: '#d4af37',
  goldSoft: '#f0d674',
  emerald: '#1f8a5b',
  crimson: '#c1426b',
  cream: '#faf7ef',
  paper: '#f5f1e8',
  muted: '#5b6678',
  faint: '#8a93a6',
};

function esc(v) {
  return String(v)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function ease(x) {
  const t = Math.max(0, Math.min(1, x));
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function fade(t, start, end) {
  return ease((t - start) / (end - start));
}

function sceneOpacity(t, start, end, fadeSeconds = 0.8) {
  const enter = fade(t, start, start + fadeSeconds);
  const exit = end >= DURATION ? 1 : 1 - fade(t, end - fadeSeconds, end);
  return Math.max(0, Math.min(1, enter * exit));
}

function line(x1, y1, x2, y2, stroke = colors.gold, width = 2, opacity = 1) {
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${width}" opacity="${opacity}" />`;
}

function text(value, x, y, size, fill = colors.cream, weight = 500, opts = {}) {
  const family = opts.serif
    ? "Georgia, 'Times New Roman', serif"
    : opts.mono
      ? "'JetBrains Mono', ui-monospace, monospace"
      : "Manrope, Inter, Arial, sans-serif";
  return `<text x="${x}" y="${y}" font-family="${family}" font-size="${size}" font-weight="${weight}" fill="${fill}" opacity="${opts.opacity ?? 1}" text-anchor="${opts.anchor ?? 'start'}" letter-spacing="${opts.spacing ?? 0}">${esc(value)}</text>`;
}

function pill(label, x, y, w, fill, stroke = 'none') {
  return `
    <rect x="${x}" y="${y}" width="${w}" height="46" rx="23" fill="${fill}" stroke="${stroke}" />
    ${text(label, x + w / 2, y + 30, 20, fill === colors.ink ? colors.cream : colors.ink, 700, { anchor: 'middle' })}
  `;
}

function card(x, y, w, h, fill = 'rgba(255,255,255,.08)', stroke = 'rgba(255,255,255,.12)') {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="18" fill="${fill}" stroke="${stroke}" />`;
}

function background() {
  const grid = [];
  for (let x = 0; x <= W; x += 72) grid.push(line(x, 0, x, H, 'rgba(255,255,255,.035)', 1));
  for (let y = 0; y <= H; y += 72) grid.push(line(0, y, W, y, 'rgba(255,255,255,.035)', 1));
  return `
    <rect width="${W}" height="${H}" fill="${colors.cream}" />
    <rect width="${W}" height="${H}" fill="url(#bg)" />
    <circle cx="900" cy="210" r="470" fill="${colors.gold}" opacity=".08" />
    <circle cx="120" cy="1680" r="520" fill="#3fd6c8" opacity=".06" />
    <g>${grid.join('')}</g>
  `;
}

function chrome(t) {
  const pulse = 0.45 + Math.sin(t * 4) * 0.15;
  return `
    <g transform="translate(58 58)">
      <rect x="0" y="0" width="74" height="74" rx="18" fill="url(#mark)" />
      <rect x="9" y="9" width="56" height="56" rx="12" fill="none" stroke="${colors.gold}" opacity=".45" />
      ${text('FC', 37, 48, 25, colors.gold, 800, { anchor: 'middle', serif: true })}
      ${text('FlyCheap', 96, 38, 38, colors.cream, 500, { serif: true })}
      ${text('Tracker', 260, 38, 38, colors.gold, 400, { serif: true })}
      ${text('FARE INTELLIGENCE · v2.4', 98, 70, 16, 'rgba(250,247,239,.58)', 600, { mono: true, spacing: 2 })}
    </g>
    <g transform="translate(735 68)">
      <circle cx="0" cy="16" r="7" fill="${colors.emerald}" opacity="${pulse}" />
      ${text('POLLING LIVE', 22, 22, 18, 'rgba(250,247,239,.7)', 600, { mono: true, spacing: 1.5 })}
    </g>
  `;
}

function sceneIntro(t) {
  const a = sceneOpacity(t, 0, 7);
  return `
    <g opacity="${a}" transform="translate(0 ${40 - a * 40})">
      ${text('New design is live', 70, 280, 28, colors.gold, 700, { mono: true, spacing: 2 })}
      ${text('FlyCheap now feels', 70, 410, 76, colors.cream, 400, { serif: true })}
      ${text('like a fare-trading desk.', 70, 500, 76, colors.gold, 400, { serif: true })}
      ${text('Live deals, route intelligence, watchlists, and booking signals in one cleaner dashboard.', 72, 585, 30, 'rgba(250,247,239,.72)', 500)}
      ${card(70, 710, 940, 430)}
      ${text('EXECUTIVE BRIEF · WEEKLY SNAPSHOT', 108, 770, 22, colors.gold, 700, { mono: true, spacing: 2 })}
      ${text('57', 108, 902, 142, colors.gold, 500, { serif: true })}
      ${text('sub-$700 round trips found', 300, 855, 44, colors.cream, 500, { serif: true })}
      ${text('Your route drops. FlyCheap catches it first.', 304, 910, 28, 'rgba(250,247,239,.7)', 500)}
      ${pill('Book cheapest → $701', 108, 990, 305, colors.gold)}
      ${pill('Add a new watch', 438, 990, 260, 'rgba(250,247,239,.12)', 'rgba(250,247,239,.18)')}
    </g>
  `;
}

function globe(cx, cy, r, t) {
  const arcs = [];
  for (let i = 0; i < 8; i += 1) {
    const ang = t * 0.45 + i * Math.PI / 4;
    const x1 = cx + Math.cos(ang) * r * 0.15;
    const y1 = cy + Math.sin(ang) * r * 0.5;
    const x2 = cx + Math.cos(ang + 1.6) * r * 0.78;
    const y2 = cy + Math.sin(ang + 1.6) * r * 0.42;
    arcs.push(`<path d="M ${x1} ${y1} Q ${cx} ${cy - r * 0.8} ${x2} ${y2}" stroke="${colors.gold}" stroke-width="3" fill="none" opacity="${0.25 + i * 0.055}" />`);
  }
  return `
    <g>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="rgba(10,58,107,.52)" stroke="rgba(212,175,55,.32)" stroke-width="2" />
      <ellipse cx="${cx}" cy="${cy}" rx="${r * .86}" ry="${r * .34}" fill="none" stroke="rgba(250,247,239,.14)" />
      <ellipse cx="${cx}" cy="${cy}" rx="${r * .46}" ry="${r * .88}" fill="none" stroke="rgba(250,247,239,.12)" />
      <path d="M ${cx-r*.8} ${cy-r*.12} C ${cx-r*.1} ${cy-r*.32}, ${cx+r*.24} ${cy+r*.14}, ${cx+r*.76} ${cy-r*.2}" stroke="rgba(250,247,239,.18)" fill="none" stroke-width="2" />
      ${arcs.join('')}
      <circle cx="${cx + Math.cos(t * 1.7) * r * .66}" cy="${cy + Math.sin(t * 1.2) * r * .28}" r="8" fill="${colors.goldSoft}" />
    </g>
  `;
}

function sceneDashboard(t) {
  const a = sceneOpacity(t, 7, 14);
  const rows = ['JFK → AMS   $701   −$999', 'EWR → AMS   $701   −$999', 'JFK → ATH   $560   −$1140', 'JFK → CAI   $591   −$298'];
  return `
    <g opacity="${a}" transform="translate(0 ${45 - a * 45})">
      ${text('Live fare intelligence', 70, 285, 68, colors.cream, 400, { serif: true })}
      ${text('Best deals, live feed, and a 12-month scan now sit together.', 72, 345, 28, 'rgba(250,247,239,.7)', 500)}
      ${globe(744, 610, 230, t)}
      ${card(70, 455, 430, 170)}
      ${text('Cheapest right now', 104, 520, 22, 'rgba(250,247,239,.62)', 600)}
      ${text('$701', 104, 595, 70, colors.gold, 600, { serif: true })}
      ${text('▼ $131', 310, 590, 26, colors.emerald, 800)}
      ${card(70, 665, 610, 430)}
      ${text('BEST FARES WORLDWIDE', 104, 725, 21, colors.gold, 700, { mono: true, spacing: 2 })}
      ${rows.map((r, i) => `
        <rect x="104" y="${765 + i * 74}" width="540" height="54" rx="12" fill="${i % 2 ? 'rgba(250,247,239,.07)' : 'rgba(250,247,239,.11)'}" />
        ${text(`0${i + 1}`, 126, 800 + i * 74, 18, colors.gold, 700, { mono: true })}
        ${text(r, 180, 800 + i * 74, 25, colors.cream, 700, { mono: true })}
      `).join('')}
      ${card(70, 1150, 940, 235)}
      ${text('LIVE FARE FEED', 104, 1210, 21, colors.gold, 700, { mono: true, spacing: 2 })}
      ${text('JFK → CDG · $431 · 1 stop', 104, 1270, 31, colors.cream, 700)}
      ${text('EWR → BCN · $439 · 1 stop', 104, 1320, 31, colors.cream, 700)}
    </g>
  `;
}

function heatmap(x, y) {
  const cells = [];
  for (let i = 0; i < 42; i += 1) {
    const col = i % 7;
    const row = Math.floor(i / 7);
    const hue = i % 6 < 2 ? colors.emerald : i % 6 < 4 ? colors.gold : '#c48b3a';
    cells.push(`<rect x="${x + col * 54}" y="${y + row * 54}" width="42" height="42" rx="8" fill="${hue}" opacity="${0.25 + (i % 5) * 0.13}" />`);
  }
  return cells.join('');
}

function sceneIntelligence(t) {
  const a = sceneOpacity(t, 14, 21);
  return `
    <g opacity="${a}" transform="translate(0 ${45 - a * 45})">
      ${text('Route intelligence', 70, 285, 70, colors.cream, 400, { serif: true })}
      ${text('Patterns, calendar heatmaps, and carbon context make each alert easier to act on.', 72, 350, 28, 'rgba(250,247,239,.7)', 500)}
      ${card(70, 455, 940, 365)}
      ${text('ROUTE DNA', 112, 520, 22, colors.gold, 700, { mono: true, spacing: 2 })}
      ${text('JFK ↔ CAI', 112, 600, 62, colors.cream, 500, { serif: true })}
      ${text('Cheap day Wed  ·  Cheap hour 18:00  ·  Best trip 7d', 112, 660, 28, 'rgba(250,247,239,.72)', 600)}
      ${text('Recommendation: book within the next 74 days.', 112, 735, 31, colors.goldSoft, 700)}
      ${card(70, 880, 440, 420)}
      ${text('FARE HEATMAP', 112, 940, 22, colors.gold, 700, { mono: true, spacing: 2 })}
      ${heatmap(112, 980)}
      ${card(560, 880, 450, 420)}
      ${text('CARBON BUDGET', 602, 940, 22, colors.gold, 700, { mono: true, spacing: 2 })}
      ${text('7,370', 602, 1060, 90, colors.cream, 600, { serif: true })}
      ${text('kg CO2e', 832, 1058, 30, 'rgba(250,247,239,.64)', 700)}
      ${text('Offset estimate: $88', 602, 1140, 32, colors.goldSoft, 700)}
    </g>
  `;
}

function sceneIntegrations(t) {
  const a = sceneOpacity(t, 21, 26);
  const ping = 0.55 + Math.sin(t * 5) * 0.25;
  return `
    <g opacity="${a}" transform="translate(0 ${45 - a * 45})">
      ${text('Next: alerts where you work', 70, 280, 56, colors.cream, 400, { serif: true })}
      ${text('Slack + Telegram APIs are coming soon for drops, support, and assistance.', 72, 345, 27, 'rgba(250,247,239,.72)', 500)}
      ${card(70, 480, 940, 320)}
      <circle cx="180" cy="620" r="78" fill="#4A154B" />
      ${text('Slack', 180, 632, 33, '#ffffff', 800, { anchor: 'middle' })}
      ${text('Team channels for fare alerts', 315, 594, 35, colors.cream, 700)}
      ${text('Route drops, digests, and support threads in-channel.', 315, 650, 25, 'rgba(250,247,239,.66)', 500)}
      ${card(70, 860, 940, 320)}
      <circle cx="180" cy="1000" r="78" fill="#2AABEE" />
      ${text('TG', 180, 1014, 40, '#ffffff', 800, { anchor: 'middle', mono: true })}
      ${text('Telegram alerts on the go', 315, 974, 35, colors.cream, 700)}
      ${text('Instant pings and support from wherever you travel.', 315, 1030, 25, 'rgba(250,247,239,.66)', 500)}
      <circle cx="890" cy="612" r="28" fill="${colors.emerald}" opacity="${ping}" />
      <circle cx="890" cy="992" r="28" fill="${colors.emerald}" opacity="${ping}" />
    </g>
  `;
}

function sceneClose(t) {
  const a = sceneOpacity(t, 26, 30);
  return `
    <g opacity="${a}" transform="translate(0 ${40 - a * 40})">
      ${text('The dashboard got sharper.', 70, 430, 74, colors.cream, 400, { serif: true })}
      ${text('The alerts are about to get faster.', 70, 520, 74, colors.gold, 400, { serif: true })}
      ${text('Visit flycheap.live', 70, 650, 38, 'rgba(250,247,239,.78)', 700)}
      ${card(70, 820, 940, 300)}
      ${text('COMING SOON', 112, 890, 22, colors.gold, 700, { mono: true, spacing: 2 })}
      ${text('Slack + Telegram alerts', 112, 980, 52, colors.cream, 700, { serif: true })}
      ${text('Plus more ways to contact us for support or assistance with anything.', 112, 1040, 29, 'rgba(250,247,239,.7)', 500)}
      ${pill('flycheap.live', 260, 1260, 560, colors.gold)}
    </g>
  `;
}

function svgFor(frame) {
  const t = frame / FPS;
  const progress = t / DURATION;
  return `<?xml version="1.0" encoding="UTF-8"?>
  <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${colors.navy2}" />
        <stop offset=".58" stop-color="${colors.ink}" />
        <stop offset="1" stop-color="${colors.navy3}" />
      </linearGradient>
      <linearGradient id="mark" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${colors.navy}" />
        <stop offset="1" stop-color="${colors.navy3}" />
      </linearGradient>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="22" stdDeviation="25" flood-color="#000000" flood-opacity=".28"/>
      </filter>
    </defs>
    ${background()}
    ${chrome(t)}
    ${sceneIntro(t)}
    ${sceneDashboard(t)}
    ${sceneIntelligence(t)}
    ${sceneIntegrations(t)}
    ${sceneClose(t)}
    <rect x="70" y="1774" width="940" height="6" rx="3" fill="rgba(250,247,239,.12)" />
    <rect x="70" y="1774" width="${940 * progress}" height="6" rx="3" fill="${colors.gold}" />
    ${text('FlyCheap Tracker · New dashboard + upcoming Slack and Telegram support', 70, 1828, 22, 'rgba(250,247,239,.55)', 600)}
  </svg>`;
}

async function main() {
  await fs.rm(OUT_DIR, { recursive: true, force: true });
  await fs.mkdir(OUT_DIR, { recursive: true });
  for (let i = 0; i < FRAMES; i += 1) {
    const name = `frame-${String(i).padStart(4, '0')}.png`;
    await sharp(Buffer.from(svgFor(i))).png().toFile(path.join(OUT_DIR, name));
    if (i % 75 === 0) console.log(`rendered ${i}/${FRAMES}`);
  }
  console.log(`rendered ${FRAMES} frames to ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

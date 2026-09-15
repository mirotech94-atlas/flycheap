/* Records each demo scene of the live FlyCheap site as a webm via Playwright. */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

const BASE = 'https://flycheap.18dn.com';
const TOKEN = fs.readFileSync(path.join(__dirname, 'session-token.txt'), 'utf8').trim();
const OUT = path.join(__dirname, 'scenes');
const sleep = ms => new Promise(r => setTimeout(r, ms));

// scene name -> [audio seconds, action fn]
// video budget = audio + 0.8s tail
async function smoothScroll(page, px, ms) {
  const steps = Math.max(1, Math.round(ms / 90));
  const per = px / steps;
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, per);
    await sleep(90);
  }
}

async function tryHover(page, sel, ms = 900) {
  try {
    const el = page.locator(sel).first();
    await el.hover({ timeout: 1500 });
    await sleep(ms);
  } catch { /* keep rolling */ }
}

const SCENES = {
  '01-welcome': [30.9, async page => {
    await page.goto(BASE + '/welcome', { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
    await sleep(3500);
    await smoothScroll(page, 500, 4000);
    await sleep(1500);
    await smoothScroll(page, 600, 4500);   // ticker + trust strip
    await sleep(1500);
    await smoothScroll(page, 700, 5000);   // how it works
    await tryHover(page, '.fc-l-howit-step:nth-child(2)', 1500);
    await smoothScroll(page, 500, 4000);
  }],
  '02-dashboard': [32.8, async page => {
    await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
    await sleep(4500);
    await tryHover(page, '.fc-kpi:nth-child(1)', 1200);
    await tryHover(page, '.fc-kpi:nth-child(2)', 1200);
    await tryHover(page, '.fc-kpi:nth-child(3)', 1200);
    await smoothScroll(page, 350, 3000);
    await sleep(2500);                      // globe
    await smoothScroll(page, 450, 3500);
    await sleep(2500);                      // live feed
    await smoothScroll(page, -200, 1500);
    await sleep(2000);
  }],
  '03-deals': [31.3, async page => {
    await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
    await sleep(2000);
    try {
      await page.locator('.fc-deals-table').first().scrollIntoViewIfNeeded({ timeout: 3000 });
    } catch { await smoothScroll(page, 900, 2500); }
    await sleep(2000);
    await tryHover(page, '.fc-deals-table tbody tr:nth-child(1)', 1400);
    await tryHover(page, '.fc-deals-table tbody tr:nth-child(2)', 1400);
    await tryHover(page, '.fc-deals-table tbody tr:nth-child(3)', 1200);
    // open the Book cross-shop dropdown
    try {
      const book = page.locator('.fc-deals-table tbody tr').first().getByText(/book/i).first();
      await book.click({ timeout: 2500 });
      await sleep(4000);
      await page.keyboard.press('Escape');
    } catch { await sleep(4000); }
    await sleep(1500);
    await smoothScroll(page, 150, 1200);
  }],
  '04-calendar': [30.0, async page => {
    await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
    await sleep(2000);
    try {
      await page.locator('.fc-calendar, .fc-cal-grid').first().scrollIntoViewIfNeeded({ timeout: 4000 });
    } catch { await smoothScroll(page, 2200, 3500); }
    await sleep(2200);
    await tryHover(page, '.fc-cal-cell.l4', 1200);
    await tryHover(page, '.fc-cal-cell.l5', 1200);
    await sleep(1200);
    // pan left to the route DNA / buy-wait card
    try {
      await page.locator('.fc-dna').first().scrollIntoViewIfNeeded({ timeout: 3000 });
    } catch { /* ok */ }
    await tryHover(page, '.fc-dna-reco', 1500);
    await sleep(2500);
  }],
  '05-explore': [20.9, async page => {
    await page.goto(BASE + '/explore', { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
    await sleep(5000);
    await smoothScroll(page, 450, 3500);
    await sleep(2500);
    await smoothScroll(page, 450, 3500);
    await sleep(1500);
  }],
  '06-alerts': [33.0, async page => {
    await page.goto(BASE + '/searches', { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
    await sleep(4500);
    await smoothScroll(page, 400, 3500);
    await sleep(2500);
    await smoothScroll(page, 400, 3500);
    await page.goto(BASE + '/settings', { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
    await sleep(3000);
    await smoothScroll(page, 500, 4000);   // alert channel toggles
    await sleep(2500);
  }],
  '07-concierge': [22.6, async page => {
    await page.goto(BASE + '/', { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {});
    await sleep(2000);
    try {
      await page.locator('[aria-label="Open chat"]').click({ timeout: 4000 });
      await sleep(1500);
      const input = page.locator('input[placeholder="Ask anything…"], textarea[placeholder="Ask anything…"]').first();
      await input.click({ timeout: 3000 });
      await input.pressSequentially('Cheapest 2 weeks to Cairo in September under $800/adult?', { delay: 45 });
      await sleep(600);
      await page.locator('[aria-label="Send"]').click({ timeout: 2500 });
      await sleep(11000);                  // let the answer stream in
    } catch (e) {
      console.log('concierge fallback:', e.message);
      await sleep(12000);
    }
  }],
  '08-pricing': [31.2, async page => {
    await page.goto(BASE + '/welcome#pricing', { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
    await sleep(3000);
    await tryHover(page, '.fc-l-tier:nth-child(1)', 2000);
    await tryHover(page, '.fc-l-tier.featured', 2600);
    await tryHover(page, '.fc-l-tier:nth-child(3)', 2000);
    await sleep(1500);
    await smoothScroll(page, 900, 5000);   // FAQ
    await sleep(1500);
    await smoothScroll(page, 900, 5000);   // final CTA
    await sleep(2500);
  }],
};

(async () => {
  const only = process.argv[2] ? process.argv.slice(2) : Object.keys(SCENES);
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  for (const name of only) {
    const [audioSec, fn] = SCENES[name];
    const budget = (audioSec + 0.8) * 1000;
    console.log(`— recording ${name} (${(budget / 1000).toFixed(1)}s)`);
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      recordVideo: { dir: OUT, size: { width: 1280, height: 800 } },
      colorScheme: 'light',
    });
    await ctx.addCookies([{
      name: 'fareintel_session', value: TOKEN,
      domain: '.18dn.com', path: '/', secure: true, httpOnly: true, sameSite: 'Lax',
    }]);
    const page = await ctx.newPage();
    const t0 = Date.now();
    try { await fn(page); } catch (e) { console.log(`  scene error (continuing): ${e.message}`); }
    const left = budget - (Date.now() - t0);
    if (left > 0) await sleep(left);
    const video = page.video();
    await ctx.close();
    const p = await video.path();
    fs.renameSync(p, path.join(OUT, `${name}.webm`));
    console.log(`  saved ${name}.webm (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  }
  await browser.close();
  console.log('all scenes recorded');
})();

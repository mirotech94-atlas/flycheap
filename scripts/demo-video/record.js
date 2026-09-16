/* Records each demo scene of the live FlyCheap site as a webm via Playwright. */
const { chromium } = require('playwright-core');
const fs = require('fs');
const path = require('path');

// flycheap.live cutover: bare domain = marketing, my. = signed-in app.
const MKT = 'https://flycheap.live';
const APP = 'https://my.flycheap.live';
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

// The prod box has been restarting every ~10-15min today (deploy-in-progress
// elsewhere) — a plain goto during that ~90s window lands on a 502.
// Health-check BEFORE recording starts, so retries never burn the scene's
// recorded time budget on 502 screens.
async function waitUntilHealthy(url, tries = 8) {
  for (let i = 0; i < tries; i++) {
    try {
      const resp = await fetch(url, { redirect: 'manual' });
      if (resp.status < 500) return true;
      console.log(`  health check ${url} -> ${resp.status}, waiting (${i + 1}/${tries})`);
    } catch (e) {
      console.log(`  health check ${url} failed (${e.message}), waiting (${i + 1}/${tries})`);
    }
    await sleep(10000);
  }
  console.log(`  ${url} still unhealthy after ${tries} checks — recording anyway`);
  return false;
}

async function resilientGoto(page, url) {
  // NOTE: health is checked once up front per scene (see main loop) so this
  // stays a single plain goto — checking here would burn recorded seconds.
  try {
    // 'load' not 'networkidle': several pages here (welcome, pricing,
    // integrations) hold a persistent connection (live ticker/feed) that
    // never goes idle, which was masquerading as repeated timeouts.
    return await page.goto(url, { waitUntil: 'load', timeout: 20000 });
  } catch (e) {
    console.log(`  goto ${url} failed: ${e.message}`);
  }
}

const SCENES = {
  '01-welcome': [30.9, async page => {
    await resilientGoto(page, MKT + '/welcome');
    await sleep(3500);
    await smoothScroll(page, 500, 4000);
    await sleep(1500);
    await smoothScroll(page, 600, 4500);   // ticker + trust strip
    await sleep(1500);
    await smoothScroll(page, 700, 5000);   // how it works
    await tryHover(page, '.fc-l-howit-step:nth-child(2)', 1500);
    await smoothScroll(page, 500, 4000);
  }, { healthUrl: MKT + '/welcome' }],
  '02-dashboard': [32.8, async page => {
    // The exec dashboard (KPI strip, globe, deals table, calendar) is the app root.
    await resilientGoto(page, APP + '/');
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
  }, { healthUrl: APP + '/' }],
  '03-deals': [31.3, async page => {
    await resilientGoto(page, APP + '/');
    await sleep(2000);
    try {
      await page.locator('.fc-deals-table').first().scrollIntoViewIfNeeded({ timeout: 3000 });
    } catch { await smoothScroll(page, 900, 2500); }
    await sleep(2000);
    await tryHover(page, '.fc-deals-table tbody tr:nth-child(1)', 1400);
    await tryHover(page, '.fc-deals-table tbody tr:nth-child(2)', 1400);
    await tryHover(page, '.fc-deals-table tbody tr:nth-child(3)', 1200);
    // open the book/check-fare cross-shop link on the top row
    try {
      const book = page.locator('.fc-deals-table tbody tr').first().getByText(/check fare|book/i).first();
      await book.click({ timeout: 2500 });
      await sleep(4000);
      await page.keyboard.press('Escape');
    } catch { await sleep(4000); }
    await sleep(1500);
    await smoothScroll(page, 150, 1200);
  }, { healthUrl: APP + '/' }],
  '04-calendar': [30.1, async page => {
    await resilientGoto(page, APP + '/');
    await sleep(2000);
    try {
      await page.locator('.fc-calendar, .fc-cal-grid').first().scrollIntoViewIfNeeded({ timeout: 4000 });
    } catch { await smoothScroll(page, 2200, 3500); }
    await sleep(2200);
    await tryHover(page, '.fc-cal-cell.l4', 1200);
    await tryHover(page, '.fc-cal-cell.l5', 1200);
    await sleep(1200);
    // pan to the route DNA / buy-wait card
    try {
      await page.locator('.fc-dna').first().scrollIntoViewIfNeeded({ timeout: 3000 });
    } catch { /* ok */ }
    await tryHover(page, '.fc-dna-reco', 1500);
    await sleep(2500);
  }, { healthUrl: APP + '/' }],
  '05-explore': [20.9, async page => {
    await resilientGoto(page, APP + '/explore');
    await sleep(5000);
    await smoothScroll(page, 450, 3500);
    await sleep(2500);
    await smoothScroll(page, 450, 3500);
    await sleep(1500);
  }, { healthUrl: APP + '/explore' }],
  '06-alerts': [36.7, async page => {
    await resilientGoto(page, APP + '/searches');
    await sleep(4000);
    await smoothScroll(page, 400, 3000);
    await sleep(2000);
    // Real self-serve Slack/Telegram integration — public join links + /watch command.
    await resilientGoto(page, MKT + '/integrations');
    await sleep(3000);
    await tryHover(page, 'section.grid > a.card:nth-child(1)', 1300);
    await tryHover(page, 'section.grid > a.card:nth-child(2)', 1300);
    await smoothScroll(page, 500, 3000);   // "Set up in 2 minutes" command cards
    await sleep(2500);
    await smoothScroll(page, 400, 3000);
    await sleep(1500);
  }, { healthUrl: APP + '/searches' }],
  '07-concierge': [22.6, async page => {
    await resilientGoto(page, APP + '/');
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
  }, { healthUrl: APP + '/' }],
  '08-pricing': [42.7, async page => {
    // Pricing moved off /welcome#pricing onto its own /pricing page. Recorded
    // logged OUT deliberately: signed in as the owner this shows account
    // management (Downgrade/Your current plan), not the real "Get early
    // access" funnel a prospective customer sees.
    await resilientGoto(page, MKT + '/pricing');
    await sleep(3000);
    await tryHover(page, '.grid.md\\:grid-cols-2.lg\\:grid-cols-3 > div:nth-child(1)', 1800);
    await tryHover(page, '.grid.md\\:grid-cols-2.lg\\:grid-cols-3 > div:nth-child(2)', 2400);
    await tryHover(page, '.grid.md\\:grid-cols-2.lg\\:grid-cols-3 > div:nth-child(3)', 1800);
    await sleep(1000);
    await smoothScroll(page, 700, 4000);   // comparison table
    await sleep(1800);
    await smoothScroll(page, 700, 4000);   // billing card
    await sleep(2000);
  }, { loggedOut: true, healthUrl: MKT + '/pricing' }],
};

(async () => {
  const only = process.argv[2] ? process.argv.slice(2) : Object.keys(SCENES);
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  for (const name of only) {
    const [audioSec, fn, opts] = SCENES[name];
    const budget = (audioSec + 0.8) * 1000;
    if (opts?.healthUrl) await waitUntilHealthy(opts.healthUrl);
    console.log(`— recording ${name} (${(budget / 1000).toFixed(1)}s)`);
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      recordVideo: { dir: OUT, size: { width: 1280, height: 800 } },
      colorScheme: 'light',
    });
    if (!opts?.loggedOut) {
      await ctx.addCookies([{
        name: 'fareintel_session', value: TOKEN,
        domain: '.flycheap.live', path: '/', secure: true, httpOnly: true, sameSite: 'Lax',
      }]);
    }
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

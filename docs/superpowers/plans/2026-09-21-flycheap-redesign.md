# FlyCheap Three-Surface Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace night-cabin with the handoff's 22-token editorial design on marketing (`/early-access`), the client portal (10 tabs) and admin (16 views), in light and dark, with zero IA/route/label/logic change, then delete the `[data-fc-theme]` machinery.

**Architecture:** A new token layer (`:root` light, `html[data-theme="dark"]` swap) is installed FIRST and the three legacy token families (`--nc-*`, `--fc-*`, `--dc-*`) are *aliased onto it* so nothing goes black mid-migration. Each surface is then converted class-by-class to a small shared stylesheet of editorial primitives (`.ed-*`), audited for contrast in both themes, and deployed before the next surface begins. Legacy blocks are deleted only after a filesystem grep proves no consumer remains. Two vitest guards turn the hard constraints (no hex in components; no radius/shadow/gradient in CSS) into CI failures.

**Tech Stack:** Next.js 16 App Router (Turbopack), React 19, Tailwind (utilities remain for layout only), `next/font/google`, vitest, SQLite via `src/lib/db.ts` (untouched), deploy via `~/.flycheap/deploy` / `deploy/deploy.sh`.

**Spec:** `docs/design/handoff/README.md` (copied from the bundle in Task 0.1) — the token table, type scale, layout skeleton, feature-block catalogue and **button inventory** live there and are the checklist every surface task verifies against.

## Global Constraints

Copied verbatim from the spec and the brief; every task implicitly includes these.

- **No IA, route, feature or logic changes.** Every tab, every button, every CTA label stays exactly where it is. The README button inventory is a checklist; each surface task greps for every label after conversion.
- **Design tokens only.** Every colour is a CSS custom property from the 22-token table. **No hardcoded hex anywhere — including component props.** Allowlisted exceptions: third-party brand marks only (`src/app/integrations/page.tsx` Slack/Telegram logo paths), recorded in `tests/noHardcodedHex.test.ts`.
- **Light and dark both ship. Dark is a pure token swap. Persist the choice** (cookie `fc-theme` + `localStorage`, so SSR renders the right theme with no flash).
- **Border-radius 0 everywhere.** Only exceptions: status dots, the range thumb, the toggle knob. **No shadows, no gradients.** Rules and whitespace separate.
- **Fonts:** Public Sans 400/500/600/700 (UI), Newsreader 300/400/500 (headings, numbers), IBM Plex Mono 400/500 (labels, axes, badges).
- **Type scale (exact):** page title Newsreader 400 42px / 1.02 / −0.025em; section title 23px / −0.015em; KPI 34px, metric band 46px / −0.02em; body Public Sans 13–14px / 1.4–1.6; eyebrows/labels/axes/badges IBM Plex Mono 9.5–11px uppercase / 0.14–0.2em; marketing H1 `clamp(40px, 5.2vw, 68px)` / −0.03em.
- **Geometry:** rules 1px; table header rule `1px solid var(--ink)`; portal/admin main padding `44px 48px 80px`; marketing 32px horizontal, 1200px max; tile grids 1px gap over `--rule`; spaced grids 14–20px; marketing columns 32–40px.
- **Buttons:** primary `background var(--btn-bg); color var(--btn-fg); padding 10px 16px; 12.5px/600`; secondary `background var(--surface); 1px solid var(--rule-strong); color var(--ink-soft)`; row CTA primary fill `7px 13px; 11.5px/600` right-aligned in its own grid track; tile CTA `1px solid currentColor`, transparent, `6px 11px; 11px/600`; marketing hero/CTA `13px 22px; 14px/600`. Hover: opacity ~0.72. No transforms.
- **Heatmap / month-grid intensities:** `color-mix(in srgb, var(--accent) N%, var(--surface))`, N 12–100.
- **Amber is a legitimate secondary series** in this system; the night-cabin amber-reserved-for-fares rule is retired.
- **Deploy via `deploy/deploy.sh` only** (`~/.flycheap/deploy`); a bare `next build` is refused. Myron owns the deploy token; each surface ends at an MR + deploy gate, not an auto-deploy.
- **Verify the computed token, not the vibe.** After each surface run the §8 audit in BOTH themes and confirm zero results.
- **Contrast audit** (from `docs/design/getlayers.md` §8, run in the in-app browser console on every enumerated route):
  ```js
  const L=c=>{const cs=/^color\(srgb/.test(c);const m=c.replace(/^color\(srgb\s*/,'').match(/[\d.]+/g);if(!m)return null;let[r,g,b]=m.slice(0,3).map(Number);if(cs){r*=255;g*=255;b*=255}
  if(m[3]!==undefined&&+m[3]<0.3)return null;const f=v=>{v/=255;return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4};
  return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b)};
  const B=e=>{while(e){const l=L(getComputedStyle(e).backgroundColor);if(l!==null)return l;e=e.parentElement}return 0};
  [...document.querySelectorAll('body *')].filter(e=>[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()))
   .map(e=>{const f=L(getComputedStyle(e).color);if(f===null)return null;const b=B(e);
    return {e,r:(Math.max(f,b)+.05)/(Math.min(f,b)+.05)}}).filter(x=>x&&x.r<4.5);
  ```

## Facts established during orientation (do not re-derive)

- **Main worktree:** `/Users/mac/Documents/Code/AI Projects/flycheap-live-preview` at `1a64e16` (synced to `gitlab/main` 2026-09-21). GitLab `main` is protected → work on a branch, open an MR.
- **`/welcome` is retired.** The apex serves **`/early-access`** (`src/app/early-access/page.tsx`, 305 lines; `EarlyAccessForm.tsx`, 99). Its styles are the `dc-*` block, `src/app/globals.css:3185–4204` (153 rules).
- **`globals.css` is 4304 lines.** Token sites: legacy `:root` at line 10; night-cabin `:root` at 3528 (`--nc-dark` 3529); `--fc-*` remaps at 3663 (`.fc-shell[cabin]`) and 3740 (`.fc-landing[cabin]`). Theme-scoped rule ranges: 705–712, 2079–2326, 2782–2940, 3038–3055, 3175–3178, 3478–3486, 3662–3888, 3931–4034, 4139–4146.
- **`data-fc-theme` declarers (tsx):** `layout.tsx:151` (`<html data-fc-theme="coal">`) and `:89` (themeBoot); `page.tsx:609`; `demo`, `trial-terms`, `terms`, `about`, `checkout`, `credits` pages; `login/page.tsx:113,133`; `FcTweaks.tsx:26,29`.
- **`FcTweaks`** (`src/components/FcTweaks.tsx`, 36 lines) pins root to `coal`, adds `.dark`, writes three localStorage keys. Imported at `layout.tsx:9`, rendered inside `<HideOnEmbed>`. Referenced in `ClientChrome.tsx`.
- **Fonts today** (`layout.tsx:19–38`): Inter (`--font-sans`), Plus_Jakarta_Sans (`--font-display`), JetBrains_Mono (`--font-mono`), Fraunces (`--font-fc-display`), Archivo (`--font-cabin`), Manrope (`--font-fc-sans`).
- **Portal chrome:** `ClientSidebar.tsx` (318 lines) renders: mobile toggle button (:129), brand `Link` (:150) + `Logo` (:158), tier badge (:174), **Admin portal link when `isAdmin`** (:177–182, label `nav.adminPortal`), `/login` link (:188), nav links, `LanguageMenu` (:286). `NavLinks.tsx` exports `NavLinks()` over `LINKS: Array<{href; key: keyof AppNavDict}>` (10 entries, labels from `useAppI18n().nav`). `ExecutiveTopBar.tsx` (105 lines) is a second, older top bar with brand + links + `/settings` and `/login` chips.
- **Admin chrome:** `src/app/admin/layout.tsx` (326 lines) — `.admin-shell` fixed div with an inline **gradient** background (:41–46), `<AdminSidebar email>` (:47), header `.ad-glass-bar` (:50–70) with breadcrumb + `Live · production` + `Founder access`, `<main className="admin-main …">` (:72), `<AdminFarePilotWidget>` (:77), then an inline `<style>` block. `AdminSidebar.tsx` nav (lines 14–41): Command centre `/admin` · Fare truth `/admin/trust` · Economics · Funnel · Revenue · Click stream `/admin/clicks` · Acquisition `/admin/signups` · Accounts `/admin/users` · Fare engine `/admin/health` · Support tickets `/admin/tickets` · Content queue `/admin/queue` · Errors · Integrations · Settings.
- **README's 13 admin views ↔ routes:** Command centre=`/admin`, Fare truth=`/admin/trust`, Economics, Funnel, Revenue, Click stream=`/admin/clicks`, Acquisition=`/admin/signups`, Accounts=`/admin/users`, Fare engine=`/admin/health`, Content queue=`/admin/queue`, Errors, Integrations, Settings. **Not in the README:** `/admin/tickets`, `/admin/affiliate`, `/admin/farepilot`, `/admin/users/[id]`, `/admin/tickets/[ref]` — these get shared chrome + skeleton + tokens, no bespoke feature block.
- **Hardcoded hex in JSX props: 72 occurrences.** Highest: `DemoCarousel.tsx` (41), `WorldMap.tsx` (14), `WhiteLabelSettings.tsx` (11), `SvgGlobe.tsx` (9), `GlobeHUD.tsx` (7), `m/verify/page.tsx` (7), `Logo.tsx` (6), `InteractiveGlobe.tsx` (6), `admin/signups/page.tsx` (6), `fc/SkyGradient.tsx` (5), `charts.tsx` (5), `ExecKpiStrip.tsx` (5); plus `FcGlobe.tsx:208–210`, `Sparkline.tsx:59,62`, `admin/economics/page.tsx:51,53`, `integrations/page.tsx:115–125` (brand marks — allowlisted).
- **Tests touching theme:** only `tests/brandContrast.test.ts` (pins `CABIN='#0B1220'`, `STOCK='#F4F2EC'` as the grounds `contrastSafe` derives tenant ink against — pure-function test, no DOM).
- **Route enumeration (filesystem, 61 `page.tsx`):** `/ /about /admin /admin/affiliate /admin/clicks /admin/economics /admin/errors /admin/farepilot /admin/funnel /admin/health /admin/integrations /admin/queue /admin/revenue /admin/settings /admin/signups /admin/tickets /admin/tickets/[ref] /admin/trust /admin/users /admin/users/[id] /airbnbs /board /board/[id] /checkout /compare /contact /credits /demo /destinations /destinations/[slug] /early-access /explore /guides /guides/[slug] /hotels /integrations /login /m/verify /offers /onboarding /org /org/groups /org/groups/[id] /org/reports /pricing /privacy /rentals /routes /routes/[slug] /searches /settings /share-handler /share/[token] /status /support /support/[ref] /terms /trial-terms /trip/after /trip/confirm /trip/unsubscribe`.
- **Dashboard i18n labels** (`src/lib/i18n/app.en.ts`): `bookCheapest: 'Book cheapest → {price}'` (:175), `addWatch: 'Add a new watch'` (:175), `upgrade: 'Upgrade to Pro · $5/mo →'` (:161). Dashboard markup `src/app/page.tsx` (835 lines): hero :615–685, ticker :687–710, quick card :714, deals section :760, intel section :801, footer :820–829.

---

## Phase 0 — Foundation (shared; nothing user-visible changes yet)

### Task 0.1: Branch, worktree, and vendor the spec

**Files:**
- Create: `docs/design/handoff/README.md` (copy of the bundle README)
- Create: `docs/design/handoff/flycheap-icon.svg`
- Create: `docs/design/handoff/screenshots/*.png` (33 files, copied)

**Interfaces:**
- Produces: the spec path every later task cites.

- [ ] **Step 1: Create the branch in the main worktree**

```bash
cd "/Users/mac/Documents/Code/AI Projects/flycheap-live-preview" && git fetch gitlab -q && git checkout -q -b redesign-editorial gitlab/main && git log --oneline -1
```
Expected: `1a64e16 Merge branch 'retire-18dn' into 'main'`

- [ ] **Step 2: Vendor the handoff into the repo (README + icon + screenshots; NOT the .dc.html prototypes or support.js)**

```bash
H="/private/tmp/claude-502/-Users-mac-Documents-Code-AI-Projects-Egyptair-Cheap-Flights-Project/d5a12266-ead9-4b71-b309-ec592b519ceb/scratchpad/handoff/design_handoff_flycheap_redesign"
mkdir -p docs/design/handoff/screenshots && cp "$H/README.md" "$H/flycheap-icon.svg" docs/design/handoff/ && cp "$H"/screenshots/*.png docs/design/handoff/screenshots/ && ls docs/design/handoff docs/design/handoff/screenshots | head -5
```

- [ ] **Step 3: Confirm the icon is byte-identical to the repo's (README says it was copied from `src/app/icon.svg`)**

```bash
cmp docs/design/handoff/flycheap-icon.svg src/app/icon.svg && echo "identical"
```
Expected: `identical` (if not, keep `src/app/icon.svg` — the repo is the source of truth).

- [ ] **Step 4: Commit**

```bash
git add docs/design/handoff && git commit -q -m "docs(design): vendor the editorial redesign handoff (README, icon, screenshots)" && git log --oneline -1
```

### Task 0.2: Guard test — no hardcoded hex in components

**Files:**
- Create: `tests/noHardcodedHex.test.ts`

**Interfaces:**
- Produces: `ALLOWLIST` — the only files permitted to contain literal hex in `.tsx`. Every later task that removes a hex must shrink this list; the test fails if a listed file no longer contains hex (so the allowlist can't rot).

- [ ] **Step 1: Write the failing test**

```ts
// tests/noHardcodedHex.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Constraint #2 of the editorial redesign: every colour is a CSS custom property.
 * A hardcoded hex in a component prop is unreachable by a token swap (the
 * FcGlobe accentColor="#d4af37" precedent), so this fails CI on any new one.
 *
 * ALLOWLIST is the migration ledger. Each entry is a file still carrying
 * literal hex and the count it carries. Tasks that convert a file must remove
 * its entry; the test ALSO fails if an allowlisted file is already clean, so
 * the list can only shrink.
 */
const ALLOWLIST: Record<string, number> = {
  // Third-party brand marks — Slack + Telegram logo paths. Legitimately literal.
  'src/app/integrations/page.tsx': 6,
  // ---- migration ledger: shrink to zero over Phases 1–3 ----
  'src/components/DemoCarousel.tsx': 41,
  'src/components/WorldMap.tsx': 14,
  'src/components/WhiteLabelSettings.tsx': 11,
  'src/components/SvgGlobe.tsx': 9,
  'src/components/GlobeHUD.tsx': 7,
  'src/app/m/verify/page.tsx': 7,
  'src/components/Logo.tsx': 6,
  'src/components/InteractiveGlobe.tsx': 6,
  'src/app/admin/signups/page.tsx': 6,
  'src/components/fc/SkyGradient.tsx': 5,
  'src/components/charts.tsx': 5,
  'src/components/ExecKpiStrip.tsx': 5,
  'src/components/FcGlobe.tsx': 3,
  'src/components/Sparkline.tsx': 2,
  'src/app/admin/economics/page.tsx': 2,
};

const HEX = /#[0-9a-fA-F]{3,8}\b/g;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

function hexCount(file: string): number {
  // Count hex literals that appear as JSX prop values or inside style objects /
  // string literals — i.e. anything a token cannot reach at runtime.
  const src = readFileSync(file, 'utf8');
  return (src.match(HEX) || []).filter(h => h.length === 4 || h.length === 7 || h.length === 9).length;
}

describe('no hardcoded hex in components', () => {
  const files = walk('src').map(f => f.replace(/\\/g, '/'));

  it('every .tsx outside the allowlist has zero hex literals', () => {
    const offenders = files
      .filter(f => !(f in ALLOWLIST))
      .map(f => [f, hexCount(f)] as const)
      .filter(([, n]) => n > 0);
    expect(offenders, `hex found in: ${offenders.map(([f, n]) => `${f} (${n})`).join(', ')}`).toEqual([]);
  });

  it('the allowlist only shrinks: every listed file still carries exactly its recorded count', () => {
    const stale = Object.entries(ALLOWLIST)
      .map(([f, n]) => [f, n, hexCount(f)] as const)
      .filter(([, n, actual]) => n !== actual);
    expect(stale, `update ALLOWLIST: ${stale.map(([f, n, a]) => `${f} recorded ${n}, actual ${a}`).join('; ')}`).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it — the counts above are from `grep -c` and the regex differs, so it will FAIL and print the real counts**

```bash
./node_modules/.bin/vitest run tests/noHardcodedHex.test.ts 2>&1 | tail -20
```
Expected: FAIL on the second `it` with a list like `src/components/DemoCarousel.tsx recorded 41, actual 47`.

- [ ] **Step 3: Set every `ALLOWLIST` count to the printed actual value (this is the true baseline). Re-run until both pass.**

```bash
./node_modules/.bin/vitest run tests/noHardcodedHex.test.ts 2>&1 | tail -6
```
Expected: `2 passed`.

- [ ] **Step 4: Commit**

```bash
git add tests/noHardcodedHex.test.ts && git commit -q -m "test(design): fail CI on any new hardcoded hex in a component; allowlist is the migration ledger" && git log --oneline -1
```

### Task 0.3: Guard test — no radius, shadow or gradient in the new stylesheet

**Files:**
- Create: `tests/editorialCss.test.ts`
- Create: `src/app/editorial.css` (empty for now; Task 0.4 fills it)

**Interfaces:**
- Produces: `src/app/editorial.css` — the ONLY stylesheet new design rules go into. Constraints #4 are enforced on this file. (`globals.css` keeps legacy rules until each surface's block is deleted.)

- [ ] **Step 1: Create the empty stylesheet and the failing test**

```bash
: > src/app/editorial.css
```

```ts
// tests/editorialCss.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * Constraint #4: border-radius 0 everywhere (status dots, range thumb, toggle
 * knob excepted), no shadows, no gradients. Enforced on the editorial
 * stylesheet, which is where every new rule lives.
 */
const css = readFileSync('src/app/editorial.css', 'utf8');

// Strip comments so a documented exception can't be mistaken for a violation.
const code = css.replace(/\/\*[\s\S]*?\*\//g, '');

describe('editorial.css obeys the geometry constraints', () => {
  it('has no non-zero border-radius except the three sanctioned exceptions', () => {
    const hits = [...code.matchAll(/border-radius\s*:\s*([^;]+);/g)]
      .map(m => m[1].trim())
      .filter(v => v !== '0' && v !== '0px');
    // Sanctioned: status dots (.ed-dot), range thumb (::-webkit-slider-thumb / ::-moz-range-thumb), toggle knob (.ed-knob).
    const sanctioned = [...code.matchAll(/(\.ed-dot|slider-thumb|range-thumb|\.ed-knob)[^{]*\{[^}]*border-radius\s*:\s*([^;]+);/g)].map(m => m[2].trim());
    const unsanctioned = hits.filter(h => !sanctioned.includes(h));
    expect(unsanctioned).toEqual([]);
  });

  it('has no box-shadow or text-shadow', () => {
    expect(code.match(/(box|text)-shadow\s*:/g) || []).toEqual([]);
  });

  it('has no gradient', () => {
    expect(code.match(/(linear|radial|conic)-gradient\(/g) || []).toEqual([]);
  });

  it('has no hex literal — every colour is a token or color-mix of tokens', () => {
    expect(code.match(/#[0-9a-fA-F]{3,8}\b/g) || []).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — passes trivially on the empty file (proves the harness); it will bite in Task 0.4**

```bash
./node_modules/.bin/vitest run tests/editorialCss.test.ts 2>&1 | tail -6
```
Expected: `4 passed`.

- [ ] **Step 3: Commit**

```bash
git add tests/editorialCss.test.ts src/app/editorial.css && git commit -q -m "test(design): editorial.css must have radius 0, no shadows, no gradients, no hex" && git log --oneline -1
```

### Task 0.4: Install the 22 tokens, the dark swap, and alias every legacy family onto them

This is the load-bearing task. After it, the whole app still LOOKS night-cabin (aliases point the old names at the new values, and the values are chosen so dark ≈ cabin), but every colour now resolves through the new token layer. Later tasks restyle surfaces; deleting a legacy block then removes only dead aliases.

**Files:**
- Modify: `src/app/editorial.css` (from empty)
- Modify: `src/app/globals.css:1–9` (add the import)

**Interfaces:**
- Produces: the 22 tokens on `:root` (light) and `html[data-theme="dark"]` (dark); alias mappings `--nc-*`, `--fc-*`, `--dc-*` → new tokens; `--font-ui`, `--font-serif`, `--font-mono-ed` (Task 0.5 binds the faces).

- [ ] **Step 1: Write the token layer + aliases**

```css
/* src/app/editorial.css
   FlyCheap editorial design system — the 22 tokens from docs/design/handoff/README.md.
   Light is the default on :root; dark is a pure swap on html[data-theme="dark"].
   Every colour in the app resolves through this layer. */

:root {
  --bg: #FBFAF7;
  --surface: #FFFFFF;
  --surface-2: #F4F1EA;
  --ink: #14181B;
  --ink-soft: #3B3833;
  --muted: #7A756C;
  --muted-2: #9B958A;
  --muted-3: #B0AAA0;
  --rule: #E6E2DA;
  --rule-soft: #EFECE5;
  --rule-strong: #D9D4CA;
  --track: #DCD8D0;
  --accent: #1F615D;
  --amber: #C98A3C;
  --green: #3E7D5A;
  --red: #B4453C;
  --panel-bg: #14181B;
  --panel-fg: #FFFFFF;
  --btn-bg: #14181B;
  --btn-fg: #FFFFFF;
  --knob: #FFFFFF;
  --on-accent: #FFFFFF;
  color-scheme: light;
}

html[data-theme="dark"] {
  --bg: #0E1113;
  --surface: #171B1E;
  --surface-2: #1F2427;
  --ink: #ECEFF1;
  --ink-soft: #C9CDD1;
  --muted: #9AA0A6;
  --muted-2: #868C92;
  --muted-3: #6E747A;
  --rule: #2A2F33;
  --rule-soft: #23282B;
  --rule-strong: #384045;
  --track: #2E3438;
  --accent: #55B8B1;
  --amber: #D9A05B;
  --green: #5FB183;
  --red: #E0776D;
  --panel-bg: #0A0C0E;
  --panel-fg: #FFFFFF;
  --btn-bg: #ECEFF1;
  --btn-fg: #0E1113;
  --knob: #ECEFF1;
  --on-accent: #0B1211;
  color-scheme: dark;
}

/* ---- Migration aliases ---------------------------------------------------
   The three legacy token families are re-pointed at the new layer so the
   app keeps rendering while each surface is converted. Each alias block is
   deleted by the task that removes the last consumer of that family
   (grep-gated). Do NOT add new consumers of any --nc-/--fc-/--dc- name. */

:root {
  /* night-cabin (--nc-*) → editorial */
  --nc-dark: var(--bg);
  --nc-deck: var(--surface);
  --nc-deck-2: var(--surface-2);
  --nc-rule: var(--rule);
  --nc-rule-2: var(--rule-strong);
  --nc-on-dark: var(--ink);
  --nc-on-dark-mute: var(--muted);
  --nc-on-dark-faint: var(--muted-2);
  --nc-amber: var(--amber);
  --nc-teal: var(--accent);
  --nc-mint: var(--green);
  --nc-signal: var(--red);
  --nc-stock: var(--surface-2);

  /* marketing (--dc-*) → editorial */
  --dc-bg: var(--bg);
  --dc-bg2: var(--surface-2);
  --dc-bg3: var(--surface);
  --dc-card: var(--surface);
  --dc-line: var(--rule);
  --dc-line2: var(--rule-strong);
  --dc-text: var(--ink);
  --dc-muted: var(--muted);
  --dc-dim: var(--muted-2);
  --dc-gold: var(--amber);
  --dc-gold2: var(--amber);
  --dc-teal: var(--accent);
}

/* Type faces — bound to next/font variables in layout.tsx (Task 0.5). */
:root {
  --font-ui: var(--font-public-sans), 'Public Sans', system-ui, sans-serif;
  --font-serif: var(--font-newsreader), 'Newsreader', Georgia, serif;
  --font-mono-ed: var(--font-plex-mono), 'IBM Plex Mono', ui-monospace, monospace;
}
```

Note on `--fc-*`: those 498 references are already remapped by the `[data-fc-theme="cabin"]` blocks onto `--nc-*` names, which now resolve here. They need no separate alias. They die when the cabin blocks die (Task 3.9).

- [ ] **Step 2: Import it FIRST in globals.css so legacy `:root` declarations lower in the file cannot override the aliases**

```css
/* src/app/globals.css — top of file becomes: */
@import 'react-day-picker/dist/style.css';
@import './editorial.css';

@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 3: The legacy night-cabin `:root` at globals.css:3528 DEFINES `--nc-*` literally and would override the aliases (it comes later in the cascade). Neutralise it: rename that selector so it no longer matches anything, keeping the block for now as a reference until Task 3.9 deletes it.**

```bash
sed -n '3528p' src/app/globals.css   # confirm it reads ":root {"
```
Then edit line 3528 from `:root {` to `.legacy-nc-tokens-retired {` and add a comment line above it: `/* RETIRED in editorial redesign — --nc-* now alias to editorial.css. Deleted in Task 3.9. */`

- [ ] **Step 4: Run the CSS guard and the full suite**

```bash
./node_modules/.bin/vitest run tests/editorialCss.test.ts 2>&1 | tail -4 && ./node_modules/.bin/vitest run 2>&1 | tail -5
```
Expected: editorial `4 passed` (hex test passes because the token file has hex… **it will FAIL** — the `no hex literal` case). That is correct: the token *definitions* are the one place hex must live. Amend the test: exclude the `:root` and `html[data-theme="dark"]` definition blocks from the hex scan.

```ts
// in tests/editorialCss.test.ts, replace the hex `it` with:
it('has no hex literal outside the two token-definition blocks', () => {
  const withoutDefs = code
    .replace(/:root\s*\{[^}]*\}/g, '')
    .replace(/html\[data-theme="dark"\]\s*\{[^}]*\}/g, '');
  expect(withoutDefs.match(/#[0-9a-fA-F]{3,8}\b/g) || []).toEqual([]);
});
```
Re-run: all pass, full suite still 185+ passing.

- [ ] **Step 5: Build, then verify the alias actually resolves in a browser (the "check the computed token" rule)**

```bash
DEPLOY_LOCK_HELD=1 NEXT_DIST_DIR=.next.verify ./node_modules/.bin/next build 2>&1 | grep -E "Compiled successfully|Failed" && NEXT_DIST_DIR=.next.verify ./node_modules/.bin/next start -p 3099 &
```
In the in-app browser at `http://localhost:3099/`, console:
```js
getComputedStyle(document.documentElement).getPropertyValue('--nc-dark').trim()
```
Expected: `#FBFAF7` (light, because no `data-theme=dark` yet — the app will look LIGHT and wrong at this moment; that is expected and fixed by Task 0.6, which sets dark as the default until surfaces convert).

- [ ] **Step 6: Commit**

```bash
kill %1; rm -rf .next.verify; git add src/app/editorial.css src/app/globals.css tests/editorialCss.test.ts && git commit -q -m "feat(design): install the 22 editorial tokens + dark swap; alias --nc-/--dc- onto them" && git log --oneline -1
```

### Task 0.5: Fonts — Public Sans, Newsreader, IBM Plex Mono via next/font

**Files:**
- Modify: `src/app/layout.tsx:2,19–38,151`

**Interfaces:**
- Produces: CSS variables `--font-public-sans`, `--font-newsreader`, `--font-plex-mono` on `<html>` (consumed by `editorial.css` `--font-ui/--font-serif/--font-mono-ed`). Old variables stay until their last consumer is gone.

- [ ] **Step 1: Add the three faces (keep the old six for now — removing them is grep-gated in Task 3.10)**

```ts
// src/app/layout.tsx line 2 becomes:
import { Inter, JetBrains_Mono, Plus_Jakarta_Sans, Fraunces, Manrope, Archivo, Public_Sans, Newsreader, IBM_Plex_Mono } from 'next/font/google';
```
After line 38 add:
```ts
// Editorial redesign faces (docs/design/handoff/README.md "Type").
const publicSans = Public_Sans({ subsets: ['latin'], variable: '--font-public-sans', display: 'swap', weight: ['400', '500', '600', '700'] });
const newsreader = Newsreader({ subsets: ['latin'], variable: '--font-newsreader', display: 'swap', weight: ['300', '400', '500'] });
const plexMono = IBM_Plex_Mono({ subsets: ['latin'], variable: '--font-plex-mono', display: 'swap', weight: ['400', '500'] });
```

- [ ] **Step 2: Bind them on `<html>` (line 151) — append to the existing className template**

```tsx
className={`dark ${inter.variable} ${display.variable} ${mono.variable} ${fcDisplay.variable} ${fcSans.variable} ${cabinDisplay.variable} ${publicSans.variable} ${newsreader.variable} ${plexMono.variable}`}
```

- [ ] **Step 3: Verify the variables land**

```bash
DEPLOY_LOCK_HELD=1 NEXT_DIST_DIR=.next.verify ./node_modules/.bin/next build 2>&1 | grep -E "Compiled successfully|Failed"
```
Then in the browser console on any page: `getComputedStyle(document.documentElement).getPropertyValue('--font-newsreader')` → a non-empty `'__Newsreader_…'` string.

- [ ] **Step 4: Commit**

```bash
rm -rf .next.verify; git add src/app/layout.tsx && git commit -q -m "feat(design): load Public Sans, Newsreader, IBM Plex Mono via next/font" && git log --oneline -1
```

### Task 0.6: Theme mechanism — `data-theme` on `<html>`, cookie-persisted, no flash

Replaces the `data-fc-theme` + `FcTweaks` + `themeBoot` clamp. Dark stays the default until each surface converts (so nothing regresses to a half-converted light page in production).

**Files:**
- Create: `src/lib/theme.ts`
- Create: `src/components/ThemeToggle.tsx`
- Create: `tests/theme.test.ts`
- Modify: `src/app/layout.tsx:72–100` (themeBoot), `:151` (html attrs)
- Modify: `src/components/FcTweaks.tsx` (neutralise; delete in Task 3.9)

**Interfaces:**
- Produces: `readThemeCookie(cookieHeader: string | null): 'light' | 'dark'` (server); `THEME_COOKIE = 'fc-theme'`; `<ThemeToggle />` client component (button, label `LIGHT`/`DARK` in mono caps per the screenshots) that sets `document.documentElement.dataset.theme`, toggles the Tailwind `dark` class in lockstep, writes the cookie (1 year, `SameSite=Lax`, path `/`) and `localStorage['fc-theme']`.

- [ ] **Step 1: Failing test for the server-side reader**

```ts
// tests/theme.test.ts
import { describe, it, expect } from 'vitest';
import { readThemeCookie, THEME_COOKIE } from '../src/lib/theme';

describe('readThemeCookie', () => {
  it('defaults to dark when there is no cookie (the pre-conversion safe default)', () => {
    expect(readThemeCookie(null)).toBe('dark');
    expect(readThemeCookie('')).toBe('dark');
  });
  it('reads light / dark from the fc-theme cookie among others', () => {
    expect(readThemeCookie(`a=1; ${THEME_COOKIE}=light; b=2`)).toBe('light');
    expect(readThemeCookie(`${THEME_COOKIE}=dark`)).toBe('dark');
  });
  it('clamps any other value to dark — a stale client value must never pick a theme the app does not ship', () => {
    expect(readThemeCookie(`${THEME_COOKIE}=ivory`)).toBe('dark');
    expect(readThemeCookie(`${THEME_COOKIE}=coal`)).toBe('dark');
  });
});
```
Run: `./node_modules/.bin/vitest run tests/theme.test.ts` → FAIL, module not found.

- [ ] **Step 2: Implement the reader**

```ts
// src/lib/theme.ts
export type Theme = 'light' | 'dark';
export const THEME_COOKIE = 'fc-theme';

/** Parse the theme from a raw Cookie header. Anything but 'light' is dark. */
export function readThemeCookie(cookieHeader: string | null): Theme {
  if (!cookieHeader) return 'dark';
  const m = cookieHeader.match(new RegExp(`(?:^|;\\s*)${THEME_COOKIE}=([^;]*)`));
  return m && m[1] === 'light' ? 'light' : 'dark';
}
```
Run the test → 3 passed.

- [ ] **Step 3: The toggle**

```tsx
// src/components/ThemeToggle.tsx
'use client';
import { useEffect, useState } from 'react';
import { THEME_COOKIE, type Theme } from '@/lib/theme';

function apply(t: Theme) {
  const root = document.documentElement;
  root.dataset.theme = t;
  // Tailwind utilities on legacy screens key off .dark; keep it in lockstep
  // until the last dark:-prefixed utility is gone.
  root.classList.toggle('dark', t === 'dark');
  document.cookie = `${THEME_COOKIE}=${t}; Path=/; Max-Age=31536000; SameSite=Lax`;
  try { localStorage.setItem(THEME_COOKIE, t); } catch { /* private mode */ }
}

/** The LIGHT / DARK button in both top bars. Label shows the theme you will switch TO. */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>('dark');
  useEffect(() => { setTheme((document.documentElement.dataset.theme as Theme) || 'dark'); }, []);
  const next: Theme = theme === 'dark' ? 'light' : 'dark';
  return (
    <button type="button" className={`ed-btn ed-btn-secondary ed-mono ${className}`} onClick={() => { apply(next); setTheme(next); }} aria-label={`Switch to ${next} theme`}>
      {next.toUpperCase()}
    </button>
  );
}
```

- [ ] **Step 4: Server render the right theme and replace `themeBoot`**

In `layout.tsx`, next to the existing `headers()` read, add:
```ts
import { readThemeCookie } from '@/lib/theme';
// ...inside RootLayout, after reqHost:
const theme = readThemeCookie((await headers()).get('cookie'));
```
Replace the whole `themeBoot` string (lines ~72–100) with:
```ts
const themeBoot = `
  try {
    var t = (document.cookie.match(/(?:^|;\\s*)fc-theme=([^;]*)/) || [])[1];
    if (t !== 'light') t = 'dark';
    var root = document.documentElement;
    root.dataset.theme = t;
    root.classList.toggle('dark', t === 'dark');
  } catch (e) {}
`;
```
Change the `<html>` tag (line 151): remove `data-fc-theme="coal" data-fc-accent="gold"`, add `data-theme={theme}`, and make the `dark` class conditional: replace the leading `dark ` in the className template with `${theme === 'dark' ? 'dark ' : ''}`.

- [ ] **Step 5: Neutralise `FcTweaks` (keep the file so the import compiles; Task 3.9 deletes it)**

```tsx
// src/components/FcTweaks.tsx — replace the body of the useEffect with a no-op:
export function FcTweaks() { return null; }
```
Remove the now-unused `useEffect` import.

- [ ] **Step 6: Old-theme CSS still keys off `[data-fc-theme="cabin"]` on `.fc-shell`/`.fc-landing` wrappers, which the pages still declare, so legacy screens keep painting. But the html-level `html[data-fc-theme="coal"]` rules (globals.css 2133+) now match nothing. Confirm nothing visibly breaks: build, start, load `/`, `/early-access`, `/admin` (log in), and run the §8 audit. Expected: zero results on all three in the dark default.**

- [ ] **Step 7: Full suite + commit**

```bash
./node_modules/.bin/vitest run 2>&1 | tail -4
git add src/lib/theme.ts src/components/ThemeToggle.tsx src/components/FcTweaks.tsx src/app/layout.tsx tests/theme.test.ts && git commit -q -m "feat(design): data-theme on <html>, cookie-persisted, SSR-correct; FcTweaks neutralised" && git log --oneline -1
```

### Task 0.7: Editorial primitives — the shared class set every surface uses

**Files:**
- Modify: `src/app/editorial.css` (append)

**Interfaces:**
- Produces the class contract used by every later task: `.ed-page`, `.ed-eyebrow`, `.ed-h1`, `.ed-h2`, `.ed-sub`, `.ed-actions`, `.ed-btn` + `.ed-btn-primary|secondary|row|tile`, `.ed-mono`, `.ed-stats` + `.ed-stat` (`.ed-stat-label`, `.ed-stat-value`, `.ed-stat-delta`, `.ed-spark`), `.ed-rule`, `.ed-table`, `.ed-tiles` + `.ed-tile` (`.ed-tile-kicker/value/meta`), `.ed-ranked` + `.ed-ranked-row` (`.ed-bar`, `.ed-bar-fill`), `.ed-toggle` (`.ed-knob`), `.ed-dot`, `.ed-delta-up|down|flat`.

- [ ] **Step 1: Append the primitives (values verbatim from the README; every colour a token)**

```css
/* ---- Editorial primitives -------------------------------------------- */
.ed-page { padding: 44px 48px 80px; background: var(--bg); color: var(--ink); font-family: var(--font-ui); font-size: 14px; line-height: 1.5; }
@media (max-width: 720px) { .ed-page { padding: 28px 20px 64px; } }

.ed-mono { font-family: var(--font-mono-ed); font-size: 10.5px; font-weight: 500; letter-spacing: 0.16em; text-transform: uppercase; }
.ed-eyebrow { composes: none; font-family: var(--font-mono-ed); font-size: 10.5px; font-weight: 500; letter-spacing: 0.16em; text-transform: uppercase; color: var(--muted-2); }
.ed-h1 { font-family: var(--font-serif); font-weight: 400; font-size: 42px; line-height: 1.02; letter-spacing: -0.025em; color: var(--ink); margin: 10px 0 12px; }
.ed-h2 { font-family: var(--font-serif); font-weight: 400; font-size: 23px; letter-spacing: -0.015em; color: var(--ink); margin: 0 0 6px; }
.ed-sub { color: var(--muted); font-size: 14px; line-height: 1.5; max-width: 64ch; margin: 0 0 22px; }
.ed-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 28px; }
.ed-rule { border: 0; border-top: 1px solid var(--rule); margin: 0; }

/* Buttons — no radius, no shadow, opacity hover only. */
.ed-btn { display: inline-flex; align-items: center; gap: 6px; padding: 10px 16px; font: 600 12.5px/1 var(--font-ui); border: 1px solid transparent; border-radius: 0; cursor: pointer; text-decoration: none; transition: opacity 120ms; }
.ed-btn:hover { opacity: 0.72; }
.ed-btn-primary { background: var(--btn-bg); color: var(--btn-fg); }
.ed-btn-secondary { background: var(--surface); color: var(--ink-soft); border-color: var(--rule-strong); }
.ed-btn-row { background: var(--btn-bg); color: var(--btn-fg); padding: 7px 13px; font-size: 11.5px; justify-self: end; }
.ed-btn-tile { background: transparent; color: currentColor; border-color: currentColor; padding: 6px 11px; font-size: 11px; }
.ed-btn-hero { padding: 13px 22px; font-size: 14px; }

/* Stat strip — 2–4 KPIs in a ruled row. */
.ed-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1px; background: var(--rule); border: 1px solid var(--rule); margin: 0 0 36px; }
.ed-stat { background: var(--surface); padding: 20px 22px 16px; }
.ed-stat-label { font-family: var(--font-mono-ed); font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--muted-2); margin-bottom: 10px; }
.ed-stat-value { font-family: var(--font-serif); font-weight: 400; font-size: 34px; line-height: 1; letter-spacing: -0.02em; color: var(--ink); display: flex; align-items: baseline; gap: 10px; }
.ed-stat-delta { font-family: var(--font-mono-ed); font-size: 11px; letter-spacing: 0.06em; }
.ed-delta-up { color: var(--green); } .ed-delta-down { color: var(--red); } .ed-delta-flat { color: var(--muted-2); }
.ed-spark { display: block; width: 100%; height: 20px; margin-top: 12px; }
.ed-spark path { fill: none; stroke: var(--accent); stroke-width: 1.25; }

/* Records — a ruled table. */
.ed-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.ed-table th { text-align: left; padding: 0 12px 10px 0; font-family: var(--font-mono-ed); font-size: 10px; font-weight: 500; letter-spacing: 0.16em; text-transform: uppercase; color: var(--muted-2); border-bottom: 1px solid var(--ink); }
.ed-table td { padding: 12px 12px 12px 0; border-bottom: 1px solid var(--rule-soft); vertical-align: middle; color: var(--ink); }
.ed-table td.num, .ed-table th.num { text-align: right; font-family: var(--font-mono-ed); font-size: 12px; letter-spacing: 0.02em; }
.ed-table td.cta { text-align: right; width: 1%; white-space: nowrap; }

/* Tile grid — 1px gaps over --rule so the background shows as the rule. */
.ed-tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 1px; background: var(--rule); border: 1px solid var(--rule); }
.ed-tile { background: var(--surface); padding: 18px 18px 16px; display: flex; flex-direction: column; gap: 6px; min-height: 120px; }
.ed-tile.dim { background: var(--surface-2); }
.ed-tile-kicker { font-family: var(--font-mono-ed); font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--muted-2); }
.ed-tile-value { font-family: var(--font-serif); font-size: 22px; letter-spacing: -0.015em; color: var(--ink); }
.ed-tile-meta { font-size: 12.5px; color: var(--muted); }
.ed-tile .ed-btn-tile { margin-top: auto; align-self: flex-start; }

/* Ranked bars — name + meta / 8px bar on --track / mono value / optional CTA track. */
.ed-ranked { display: grid; gap: 0; }
.ed-ranked-row { display: grid; grid-template-columns: minmax(180px, 1.2fr) 2fr 90px auto; align-items: center; gap: 18px; padding: 14px 0; border-bottom: 1px solid var(--rule-soft); }
.ed-ranked-name { font-weight: 600; color: var(--ink); } .ed-ranked-meta { font-size: 12px; color: var(--muted); }
.ed-bar { height: 8px; background: var(--track); } .ed-bar-fill { height: 100%; background: var(--accent); }
.ed-bar-fill.amber { background: var(--amber); } .ed-bar-fill.green { background: var(--green); }
.ed-ranked-value { font-family: var(--font-mono-ed); font-size: 12px; text-align: right; color: var(--ink); }

/* Toggle — 44×24, track --accent/--track, 18px knob, 160ms translate. */
.ed-toggle { position: relative; width: 44px; height: 24px; background: var(--track); border: 0; padding: 0; cursor: pointer; }
.ed-toggle[aria-checked="true"] { background: var(--accent); }
.ed-knob { position: absolute; top: 3px; left: 3px; width: 18px; height: 18px; background: var(--knob); border-radius: 0; transition: transform 160ms; }
.ed-toggle[aria-checked="true"] .ed-knob { transform: translateX(20px); }

/* Status dot — one of the three sanctioned radius exceptions. */
.ed-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--green); }
.ed-dot.amber { background: var(--amber); } .ed-dot.red { background: var(--red); }
```
(Delete the stray `composes: none;` — it was a placeholder guard; remove it before committing.)

- [ ] **Step 2: Guard tests pass**

```bash
./node_modules/.bin/vitest run tests/editorialCss.test.ts 2>&1 | tail -4
```
Expected: `4 passed` (the `.ed-dot` 50% and `.ed-knob` 0 are sanctioned).

- [ ] **Step 3: Commit**

```bash
git add src/app/editorial.css && git commit -q -m "feat(design): editorial primitives — page, stats, table, tiles, ranked bars, toggle, buttons" && git log --oneline -1
```

---

## Phase 1 — Marketing (`/early-access`, served at the apex)

### Task 1.1: Restyle `/early-access` to the editorial system

**Files:**
- Modify: `src/app/early-access/page.tsx` (305 lines — class names only; every section, string and link stays)
- Modify: `src/app/early-access/EarlyAccessForm.tsx` (99 lines — class names only)
- Modify: `src/app/editorial.css` (append `.mk-*` marketing rules)
- Modify: `src/components/fc/RouteField.tsx` (reads `--nc-teal`/`--nc-amber` at runtime → read `--accent`/`--amber`)

**Interfaces:**
- Consumes: primitives from Task 0.7; `ThemeToggle` from 0.6.
- Produces: `.mk-nav`, `.mk-hero`, `.mk-feed`, `.mk-strip`, `.mk-problem`, `.mk-how`, `.mk-preview`, `.mk-features`, `.mk-band`, `.mk-pricing`, `.mk-faq`, `.mk-cta`, `.mk-footer`.

- [ ] **Step 1: Record the button/CTA inventory BEFORE touching anything (this is the acceptance list)**

```bash
grep -oE '>(Get early access|Watch the demo|Sign in|Try free|Log in|Join|Request access|Talk to sales|See pricing)[^<]*<' src/app/early-access/page.tsx src/app/early-access/EarlyAccessForm.tsx | sort -u > /tmp/mk-buttons-before.txt; cat /tmp/mk-buttons-before.txt
```
Also list every `<a href` and `<Link href` target:
```bash
grep -oE '(href)=\{?["'"'"'][^"'"'"']+' src/app/early-access/page.tsx | sort -u > /tmp/mk-links-before.txt; wc -l /tmp/mk-links-before.txt
```

- [ ] **Step 2: Append the marketing rules to `editorial.css`**

```css
/* ---- Marketing (flycheap.live → /early-access) ------------------------- */
.mk { background: var(--bg); color: var(--ink); font-family: var(--font-ui); }
.mk .mk-wrap { max-width: 1200px; margin: 0 auto; padding: 0 32px; }
.mk-nav { position: sticky; top: 0; z-index: 20; background: var(--surface); border-bottom: 1px solid var(--rule); }
.mk-nav .mk-wrap { display: flex; align-items: center; justify-content: space-between; height: 62px; gap: 24px; }
.mk-brand { display: flex; align-items: center; gap: 10px; text-decoration: none; color: var(--ink); }
.mk-brand-name { font-family: var(--font-serif); font-size: 20px; letter-spacing: -0.01em; }
.mk-brand-meta { font-family: var(--font-mono-ed); font-size: 9.5px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--muted-2); }
.mk-nav-links { display: flex; gap: 22px; font-size: 14px; color: var(--muted); }
.mk-nav-links a:hover { color: var(--ink); }
.mk-nav-right { display: flex; gap: 8px; align-items: center; }

.mk-hero { padding: 72px 0 56px; }
.mk-hero .mk-wrap { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 40px; align-items: start; }
@media (max-width: 900px) { .mk-hero .mk-wrap { grid-template-columns: 1fr; } }
.mk-hero-status { display: flex; align-items: center; gap: 8px; margin-bottom: 22px; }
.mk-h1 { font-family: var(--font-serif); font-weight: 400; font-size: clamp(40px, 5.2vw, 68px); line-height: 1.02; letter-spacing: -0.03em; margin: 0 0 22px; }
.mk-lede { font-size: 17px; line-height: 1.6; color: var(--muted); max-width: 46ch; margin: 0 0 28px; }
.mk-hero-cta { display: flex; gap: 10px; flex-wrap: wrap; }

.mk-feed { background: var(--surface); border: 1px solid var(--rule); }
.mk-feed-head { display: flex; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid var(--rule); }
.mk-feed-row { display: grid; grid-template-columns: 1fr 90px 70px 60px; align-items: center; gap: 14px; padding: 16px 18px; border-bottom: 1px solid var(--rule-soft); }
.mk-feed-route { font-weight: 600; } .mk-feed-meta { font-size: 12px; color: var(--muted); }
.mk-feed-price { font-family: var(--font-mono-ed); font-size: 13px; text-align: right; }
.mk-tag { font-family: var(--font-mono-ed); font-size: 9.5px; letter-spacing: 0.16em; padding: 4px 8px; text-align: center; background: var(--surface-2); color: var(--ink-soft); }
.mk-tag.buy { color: var(--on-accent); background: var(--accent); } .mk-tag.wait { color: var(--ink); background: var(--amber); }

.mk-section { padding: 64px 0; border-top: 1px solid var(--rule); }
.mk-strip { display: flex; flex-wrap: wrap; gap: 28px; padding: 22px 0; border-top: 1px solid var(--rule); border-bottom: 1px solid var(--rule); font-family: var(--font-mono-ed); font-size: 10.5px; letter-spacing: 0.16em; text-transform: uppercase; color: var(--muted-2); }
.mk-tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1px; background: var(--rule); border: 1px solid var(--rule); }
.mk-tile { background: var(--surface); padding: 26px 24px; }
.mk-steps { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 32px; }
.mk-step { border-top: 2px solid var(--ink); padding-top: 18px; }
.mk-features { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 32px 40px; }
.mk-feature { border-top: 1px solid var(--rule); padding-top: 16px; }
.mk-band { background: var(--panel-bg); color: var(--panel-fg); padding: 56px 0; }
.mk-band .mk-metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 32px; }
.mk-metric-value { font-family: var(--font-serif); font-size: 46px; letter-spacing: -0.02em; line-height: 1; }
.mk-pricing { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1px; background: var(--rule); border: 1px solid var(--rule); }
.mk-plan { background: var(--surface); padding: 28px 26px; display: flex; flex-direction: column; gap: 14px; }
.mk-plan.featured { background: var(--panel-bg); color: var(--panel-fg); }
.mk-plan.featured .ed-btn-primary { background: var(--amber); color: var(--ink); }
.mk-price { font-family: var(--font-serif); font-size: 38px; letter-spacing: -0.02em; }
.mk-faq details { border-top: 1px solid var(--rule); padding: 18px 0; }
.mk-faq summary { cursor: pointer; font-weight: 600; list-style: none; }
.mk-cta { text-align: center; padding: 72px 0; border-top: 1px solid var(--rule); }
.mk-footer { border-top: 1px solid var(--rule); padding: 40px 0; font-size: 13px; color: var(--muted); }
```

- [ ] **Step 3: Convert `page.tsx` class-by-class.** Map: `dc` root div → `mk`; `dc-nav` → `mk-nav`; `dc-nav-right` → `mk-nav-right`; `dc-hero` → `mk-hero`; the `RouteField` stays as the hero backdrop; `dc-section` → `mk-section`; `dc-band` → `mk-band`; the pricing section → `mk-pricing`/`mk-plan`; `dc-cta-wrap`/`dc-cta` → `mk-cta`; `dc-footer` → `mk-footer`; `dc-accent` spans → plain (no amber on decoration — amber is for the featured tier CTA and the WAIT tag here). Every `h1` → add `mk-h1`; buttons → `ed-btn ed-btn-primary ed-btn-hero` / `ed-btn ed-btn-secondary ed-btn-hero`. Add `<ThemeToggle />` to `mk-nav-right` before the Sign in link. **Do not change any string, href, or the order of sections.**

- [ ] **Step 4: `RouteField.tsx` — repoint its runtime token reads**

```bash
grep -n "nc-teal\|nc-amber" src/components/fc/RouteField.tsx
```
Change every `--nc-teal` → `--accent` and `--nc-amber` → `--amber`.

- [ ] **Step 5: Inventory unchanged**

```bash
grep -oE '>(Get early access|Watch the demo|Sign in|Try free|Log in|Join|Request access|Talk to sales|See pricing)[^<]*<' src/app/early-access/page.tsx src/app/early-access/EarlyAccessForm.tsx | sort -u | diff - /tmp/mk-buttons-before.txt && echo "buttons: identical"
grep -oE '(href)=\{?["'"'"'][^"'"'"']+' src/app/early-access/page.tsx | sort -u | diff - /tmp/mk-links-before.txt && echo "links: identical"
```
Expected: both `identical`.

- [ ] **Step 6: Build + audit both themes**

```bash
DEPLOY_LOCK_HELD=1 NEXT_DIST_DIR=.next.verify ./node_modules/.bin/next build 2>&1 | grep -E "Compiled successfully|Failed"; NEXT_DIST_DIR=.next.verify ./node_modules/.bin/next start -p 3099 &
```
In the in-app browser: `http://localhost:3099/early-access`. Run the §8 audit → expect `[]`. Click the theme toggle → verify `document.documentElement.dataset.theme === 'light'` AND `getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() === '#FBFAF7'`; run the audit again → `[]`. Reload → theme persists (cookie). Screenshot both; compare against `docs/design/handoff/screenshots/01-marketing.png`.

- [ ] **Step 7: Full suite, commit**

```bash
kill %1; rm -rf .next.verify; ./node_modules/.bin/vitest run 2>&1 | tail -4
git add src/app/early-access src/app/editorial.css src/components/fc/RouteField.tsx && git commit -q -m "feat(marketing): /early-access on the editorial system, light + dark, inventory unchanged" && git log --oneline -1
```

### Task 1.2: Delete the `dc-*` block and ship marketing

**Files:**
- Modify: `src/app/globals.css:3185–4204` (delete the 153 `.dc*` rules)
- Modify: `src/app/editorial.css` (delete the `--dc-*` alias block)

- [ ] **Step 1: Grep-gate — no consumer of `dc-` classes or `--dc-` tokens may remain**

```bash
grep -rn 'className="dc\|className={`dc\|"dc-\|--dc-' src --include='*.tsx' --include='*.ts' | grep -v editorial.css
```
Expected: no output. If any line prints, convert it first (it's a page the README didn't list — check `/about`, `/demo`, `/contact`).

- [ ] **Step 2: Delete the block** — the `.dc` rules run from the first `.dc` selector (line 3185) to the last (4204). Confirm the boundaries, then delete:

```bash
sed -n '3183,3186p;4203,4206p' src/app/globals.css
```
Delete lines 3185–4204 inclusive. Then delete the `/* marketing (--dc-*) → editorial */` alias block from `editorial.css`.

- [ ] **Step 3: Build, audit `/early-access` once more in both themes, run the suite**

- [ ] **Step 4: Commit, push, MR**

```bash
git add -A src/app/globals.css src/app/editorial.css && git commit -q -m "chore(css): delete the dc-* marketing block — no consumers remain" && git push -u gitlab redesign-editorial
```
Open MR `redesign-editorial → main` titled "Editorial redesign — Phase 1: marketing". Deploy gate: Myron runs `~/.flycheap/deploy` after merge. Then verify live: `https://flycheap.live/` renders the new nav, audit returns `[]`, theme toggle persists.

---

## Phase 2 — Client portal (`my.flycheap.live`, 10 tabs)

### Task 2.1: Portal chrome — top tab bar replaces the sidebar; every control preserved

**Files:**
- Create: `src/components/PortalTopBar.tsx`
- Modify: `src/app/layout.tsx` (render `<PortalTopBar>` where `<ClientSidebar>` is; keep `ClientSidebar` file until 3.9)
- Modify: `src/components/ClientChrome.tsx` (`AdminAwareMain` padding → `.ed-page`)
- Modify: `src/app/editorial.css` (append `.pt-*` rules)

**Interfaces:**
- Consumes: `NavLinks` `LINKS` order (10 tabs), `useAppI18n().nav`, `ThemeToggle`, `LanguageMenu`, `Logo`.
- Produces: `<PortalTopBar user isAdmin language />` with the exact prop shape `ClientSidebar` takes today: `user: { email: string; name: string | null; tier?: string | null } | null; isAdmin?: boolean; language: string`.

- [ ] **Step 1: Record the sidebar's control inventory (acceptance list)**

From orientation: brand link → `/`; 10 nav links; tier badge text; **`nav.adminPortal` link when `isAdmin`**; `/login` link when signed out; `LanguageMenu`; mobile toggle. Confirm the labels:
```bash
grep -nE "adminPortal|signIn|login" src/lib/i18n/app.en.ts | head -4
```

- [ ] **Step 2: Write the top bar**

```tsx
// src/components/PortalTopBar.tsx
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useAppI18n } from '@/lib/i18n/client';
import type { AppNavDict } from '@/lib/i18n/app.en';
import { Logo } from '@/components/Logo';
import { LanguageMenu } from '@/components/LanguageMenu';
import { ThemeToggle } from '@/components/ThemeToggle';

const LINKS: Array<{ href: string; key: keyof AppNavDict }> = [
  { href: '/', key: 'dashboard' }, { href: '/explore', key: 'explore' }, { href: '/offers', key: 'offers' },
  { href: '/hotels', key: 'hotels' }, { href: '/routes', key: 'routes' }, { href: '/guides', key: 'guides' },
  { href: '/pricing', key: 'pricing' }, { href: '/searches', key: 'searches' },
  { href: '/integrations', key: 'integrations' }, { href: '/settings', key: 'settings' },
];

export function PortalTopBar({ user, isAdmin = false, language, locale }: {
  user: { email: string; name: string | null; tier?: string | null } | null;
  isAdmin?: boolean; language: string; locale: string;
}) {
  const pathname = usePathname() || '/';
  const { nav } = useAppI18n();
  const [open, setOpen] = useState(false);
  return (
    <header className="pt-bar">
      <Link href="/" className="pt-brand"><Logo size={24} /><span><span className="pt-brand-name">FlyCheap</span><span className="pt-brand-meta">Fare intelligence</span></span></Link>
      <button type="button" className="pt-menu ed-btn ed-btn-secondary" aria-label={nav.toggle} aria-expanded={open} onClick={() => setOpen(o => !o)}>☰</button>
      <nav className={`pt-tabs ${open ? 'open' : ''}`}>
        {LINKS.map(l => {
          const active = l.href === '/' ? pathname === '/' : pathname.startsWith(l.href);
          return <Link key={l.href} href={l.href} className={`pt-tab ${active ? 'active' : ''}`} onClick={() => setOpen(false)}>{nav[l.key]}</Link>;
        })}
      </nav>
      <div className="pt-right">
        <span className="pt-live ed-mono"><span className="ed-dot" /> Polling</span>
        {user && <span className="pt-tier ed-mono">{user.tier || 'free'}</span>}
        <ThemeToggle />
        <LanguageMenu locale={locale} variant="sidebar" label={language} />
        {isAdmin && <a href="/admin" className="ed-btn ed-btn-secondary ed-mono">{nav.adminPortal}</a>}
        {!user && <Link href="/login" className="ed-btn ed-btn-secondary ed-mono">{nav.login}</Link>}
      </div>
    </header>
  );
}
```
(If the i18n key for the login label is not `nav.login`, use the key `ClientSidebar.tsx:188` uses — read that line and match it exactly.)

- [ ] **Step 3: Rules**

```css
/* ---- Portal chrome ------------------------------------------------------ */
.pt-bar { position: sticky; top: 0; z-index: 30; display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 24px; padding: 0 24px; height: 62px; background: var(--surface); border-bottom: 1px solid var(--rule); font-family: var(--font-ui); }
.pt-brand { display: flex; align-items: center; gap: 10px; color: var(--ink); text-decoration: none; }
.pt-brand-name { display: block; font-family: var(--font-serif); font-size: 19px; line-height: 1; }
.pt-brand-meta { display: block; font-family: var(--font-mono-ed); font-size: 9px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--muted-2); margin-top: 3px; }
.pt-tabs { display: flex; gap: 4px; flex-wrap: wrap; justify-self: center; }
.pt-tab { padding: 20px 10px 18px; font-size: 13px; font-weight: 500; color: var(--muted); text-decoration: none; border-bottom: 2px solid transparent; }
.pt-tab:hover { color: var(--ink); }
.pt-tab.active { color: var(--ink); border-bottom-color: var(--accent); }
.pt-right { display: flex; align-items: center; gap: 8px; }
.pt-live { color: var(--green); display: inline-flex; align-items: center; gap: 6px; }
.pt-tier { color: var(--muted-2); }
.pt-menu { display: none; }
@media (max-width: 960px) {
  .pt-bar { grid-template-columns: auto auto 1fr; }
  .pt-menu { display: inline-flex; }
  .pt-tabs { display: none; grid-column: 1 / -1; flex-direction: column; gap: 0; border-top: 1px solid var(--rule); }
  .pt-tabs.open { display: flex; }
  .pt-tab { padding: 12px 0; border-bottom: 1px solid var(--rule-soft); }
}
```

- [ ] **Step 4: Wire it in `layout.tsx`** — replace the `<ClientSidebar …/>` element with `<PortalTopBar user={…same…} isAdmin={showAdminLink} language={t.common.language} locale={locale} />` (same props; `locale` is already in scope). Do not delete `ClientSidebar.tsx` yet.

- [ ] **Step 5: Build, load `/`, verify every control renders** (brand, 10 tabs, Polling dot, tier, LIGHT/DARK, language, Admin link as owner, Log in when signed out at `/login`). Mobile width 400px: menu button shows, tabs collapse. Audit both themes → `[]`.

- [ ] **Step 6: Commit**

```bash
git add src/components/PortalTopBar.tsx src/app/layout.tsx src/app/editorial.css src/components/ClientChrome.tsx && git commit -q -m "feat(portal): editorial top tab bar — every sidebar control preserved" && git log --oneline -1
```

### Task 2.2: Dashboard (`/`) — hero → page header + stat strip + ranked bars

**Files:**
- Modify: `src/app/page.tsx:609–835`
- Modify: `src/components/FcGlobe.tsx:208–210` (gradient stops → deleted; globe frame on `--surface`, arcs `--accent`, hubs `--amber`)
- Modify: `src/components/Sparkline.tsx:59,62` (stroke/fill → `var(--muted-2)` / `var(--amber)`)
- Modify: `tests/noHardcodedHex.test.ts` (remove `FcGlobe.tsx`, `Sparkline.tsx` from `ALLOWLIST`)

**Interfaces:**
- Consumes: `.ed-*` primitives; labels `t.eyebrow, t.lede, t.bookCheapest, t.addFirst, t.addWatch, t.cheapestNow, t.median, t.destinations, t.cities, t.ticker, t.polling, t.quickEyebrow, t.quickSub, t.fullExplore, t.dealsEyebrow, t.dealsTitle, t.dealsSub, t.pollAll, t.intelEyebrow, t.intelTitle, t.intelSub, t.footerTag, t.status, t.privacy, t.about` + literal `Photo credits`.

- [ ] **Step 1: Inventory the README's dashboard buttons in the current markup**

README: `Book cheapest → $X · Add a new watch · Compare pinned · Upgrade to Pro · $5/mo →; Book → on each ranked route and each alert row; Pin to compare.`
```bash
grep -nE "bookCheapest|addWatch|addFirst|upgrade|Compare pinned|comparePinned|Pin to compare|pinCompare|Book →|book" src/app/page.tsx src/lib/i18n/app.en.ts | sed -E 's/^(.{0,120}).*/\1/' > /tmp/dash-before.txt; cat /tmp/dash-before.txt
```
Every label present here must be present after Step 3 (same grep, `diff`).

- [ ] **Step 2: Restructure the hero (lines 615–685) into the skeleton.** Replace `<section className="fc-hero">…</section>` with:

```tsx
<div className="ed-page">
  <div className="ed-eyebrow">{t.eyebrow}</div>
  <h1 className="ed-h1">{/* existing greeting/title expression, unchanged */}</h1>
  <p className="ed-sub">{t.lede}</p>
  <div className="ed-actions">
    {cheapest && <Link className="ed-btn ed-btn-primary" href="/offers">{fill(t.bookCheapest, { price: fmtUSD(cheapest.per_adult_usd) })}</Link>}
    <Link className="ed-btn ed-btn-secondary" href="/searches">{trackedRoutes.length ? t.addWatch : t.addFirst}</Link>
    {/* Compare pinned + Upgrade to Pro: keep the EXISTING elements and their hrefs, restyled ed-btn ed-btn-secondary */}
  </div>
  <hr className="ed-rule" />
  <div className="ed-stats">
    <div className="ed-stat"><div className="ed-stat-label">{t.cheapestNow}</div><div className="ed-stat-value">{/* existing value + delta markup, delta span gets ed-stat-delta ed-delta-down|up */}</div><svg className="ed-spark" viewBox="0 0 100 20" preserveAspectRatio="none"><path d={sparkPath(history)} /></svg></div>
    <div className="ed-stat"><div className="ed-stat-label">{t.median}</div>…</div>
    <div className="ed-stat"><div className="ed-stat-label">{t.destinations}</div>…<span className="ed-stat-delta ed-delta-flat">{t.cities}</span></div>
  </div>
  {/* Feature block: ranked bars — "Where each route sits in its 30-day range" */}
  <div className="ed-ranked">{trackedRoutes.map(r => (
    <div className="ed-ranked-row" key={r.id}>
      <div><div className="ed-ranked-name">{r.origin} → {r.destination}</div><div className="ed-ranked-meta">{/* existing verdict text */}</div></div>
      <div className="ed-bar"><div className={`ed-bar-fill ${r.verdictClass}`} style={{ width: `${r.pctOfRange}%` }} /></div>
      <div className="ed-ranked-value">{fmtUSD(r.price)}</div>
      <Link className="ed-btn ed-btn-row" href={r.bookHref}>Book →</Link>
    </div>))}
  </div>
```
`sparkPath(points: number[]): string` is a 6-line helper added to the same file: normalise to 0–100 × 0–20 and emit `M x y L x y …`. `pctOfRange` = `(price − min30) / (max30 − min30) × 100` from the route's existing 30-day data already loaded on this page (see `history`/`median` variables around lines 560–600). The globe (`fc-hero-globe`) and ticker (`fc-ticker`) **stay** — they are features — restyled: globe frame `border: 1px solid var(--rule)`, ticker as an `.ed-mono` strip on `--surface-2`.

- [ ] **Step 3: Inventory diff**

```bash
grep -nE "bookCheapest|addWatch|addFirst|upgrade|Compare pinned|comparePinned|Pin to compare|pinCompare|Book →|book" src/app/page.tsx src/lib/i18n/app.en.ts | sed -E 's/^(.{0,120}).*/\1/' | diff - /tmp/dash-before.txt
```
Expected: only line-number/className differences; **no label removed**.

- [ ] **Step 4: `FcGlobe.tsx` + `Sparkline.tsx` hex → tokens; shrink the allowlist; run the hex test**

```bash
./node_modules/.bin/vitest run tests/noHardcodedHex.test.ts 2>&1 | tail -6
```

- [ ] **Step 5: Build, audit `/` both themes → `[]`; compare to `screenshots/01-portal.png`. Commit.**

```bash
git add src/app/page.tsx src/components/FcGlobe.tsx src/components/Sparkline.tsx tests/noHardcodedHex.test.ts && git commit -q -m "feat(portal): dashboard on the editorial skeleton — header, stat strip, ranked bars" && git log --oneline -1
```

### Task 2.3 – 2.11: The remaining nine tabs (one task each, identical shape)

Each of these tasks has the same five steps as Task 2.2. Listed here with the feature block, the README button inventory (the acceptance grep), and any hex ledger entries the task must clear. Execute them in this order.

| Task | Route / file | Feature block (README) | Buttons that must survive (grep these labels before and after) | Hex ledger cleared |
|---|---|---|---|---|
| **2.3** | `/explore` — `src/app/explore/page.tsx` | Tile grid: month tiles (`ed-tiles`), destination rows (`ed-table`) | `Live search now →` · `Change home airport` · `Try a higher budget` · `Book this window →` per month tile · `Book now →` per row | — |
| **2.4** | `/offers` — `src/app/offers/page.tsx` | Ranked bars | `Search any route window` · `Track a route` · `Compare pinned` · `Book →` per offer | — |
| **2.5** | `/hotels` — `src/app/hotels/page.tsx` (+ `HotelsSearchPanel.tsx`, `HotelUpsell.tsx`, `StayHeroSlide.tsx`) | Tile grid (city tiles keep their photos as `background-image` on `.ed-tile`; radius 0) | `Update search` · `Airbnbs` · `Compare hotels` · `Book now →` per tile and row | — |
| **2.6** | `/routes` — `src/app/routes/page.tsx` | Ranked bars | `Add a route →` · `Search now →` · `Search →` per route | — |
| **2.7** | `/guides` — `src/app/guides/page.tsx` | Tile grid | `Request a guide` · `Read guide →` / `Read →` | — |
| **2.8** | `/pricing` — `src/app/pricing/page.tsx` + `PricingClient.tsx` | Plans: 3 tiles, 1px gaps, current plan `--panel-bg`, serif price 38px, CTA bottom | `Upgrade to Pro →` · `Monthly` / `Yearly` · `save 36%` · `Talk to sales` · per-tier `Upgrade` / `Your plan` / `Downgrade` | — |
| **2.9** | `/searches` — `src/app/searches/page.tsx` | Threshold: 26-bar histogram (bars ≤ target `--accent` else `--track`), `<input type="range" min=380 max=980 step=10>`, live "N% of recent fares would alert", dark alert-preview panel (`--panel-bg`) beside it | `Add a new search` · `Save` · `Book → $X` and `Save watch` in the alert panel · `Book →` per watch | — |
| **2.10** | `/integrations` — `src/app/integrations/page.tsx` | Tile grid | `Connect channel` · `Settings → Channels` · `Connect →` per tile | Slack/Telegram brand SVGs stay allowlisted; recount |
| **2.11** | `/settings` — `src/app/settings/page.tsx` + `WhiteLabelSettings.tsx` | Toggles: ruled rows, `.ed-toggle` | `Save` · `Upgrade your plan →` | `WhiteLabelSettings.tsx` (11): tenant brand swatch keeps its literal (it shows the tenant their own colour — README-sanctioned); everything else → tokens; recount |

For 2.9 the histogram + slider is client state: a `ThresholdBlock.tsx` client component taking `recentFares: number[]` and `initialTarget: number`, computing `hitRate = fares.filter(f => f <= target).length / fares.length`; the "Save" button submits the existing form/action unchanged.

For 2.11 the `--nc-dark` ground constant in `layout.tsx:63` (`NC_DARK = '#0B1220'`, used by `contrastSafe` for tenant ink) becomes the two editorial grounds: derive against `--bg` light `#FBFAF7` **and** dark `#0E1113`, emitting both `--brand-ink-light` / `--brand-ink-dark` and selecting via `html[data-theme]`. Update `tests/brandContrast.test.ts` constants `CABIN`→`'#0E1113'`, `STOCK`→`'#FBFAF7'`.

Each task ends: inventory diff clean → hex test → build → audit both themes `[]` → screenshot vs `0N-portal.png` → commit `feat(portal): <tab> on the editorial skeleton`.

### Task 2.12: Delete portal legacy CSS, ship Phase 2

- [ ] **Step 1: Grep-gate the `.fc-shell` cabin block** — the dashboard was its last declarer:
```bash
grep -rn 'fc-shell' src --include='*.tsx'
```
Expected: only `login/page.tsx:113,133` (converted in Phase 3, Task 3.7). If so, leave the block for Task 3.9; if none, delete `globals.css` 3662–3888 now.

- [ ] **Step 2: Remove hex-ledger entries cleared in Phase 2; run the full suite; push; open MR "Editorial redesign — Phase 2: client portal". Deploy gate → Myron. Verify live at `https://my.flycheap.live/` (all 10 tabs, both themes, audit `[]`).**

---

## Phase 3 — Admin (`admin.flycheap.live`)

### Task 3.1: Admin chrome — dark top bar + 214px rail

**Files:**
- Modify: `src/app/admin/layout.tsx:36–80` and its trailing `<style>` block
- Modify: `src/app/admin/_components/AdminSidebar.tsx` (class names; keep the nav array + `email` prop)
- Modify: `src/app/admin/_components/AdminBreadcrumb.tsx` (class names)
- Modify: `src/app/editorial.css` (append `.ad-*`)

**Interfaces:**
- Consumes: `AdminSidebar` nav array (14 items across 6 groups: Overview · Analytics · Commercial · Customers · Operations · Platform), `ThemeToggle`.
- Produces: `.ad-shell`, `.ad-top`, `.ad-rail`, `.ad-rail-group`, `.ad-rail-item(.active)`, `.ad-main`.

- [ ] **Step 1: Replace the gradient shell.** `layout.tsx:38–46` becomes `<div className="ad-shell">` with no inline style. Header (`:50–70`) becomes:
```tsx
<header className="ad-top">
  <Link href="/admin" className="ad-brand"><Logo size={24} /><span><span className="ad-brand-name">FlyCheap</span><span className="ad-brand-meta">Command centre</span></span></Link>
  <div className="ad-crumb ed-mono">ADMIN / <AdminBreadcrumb /></div>
  <div className="ad-right"><span className="ad-live ed-mono"><span className="ed-dot" /> Live · production</span><ThemeToggle /><a href="/" className="ed-btn ed-btn-secondary ed-mono">Client portal</a></div>
</header>
```
`<main className="admin-main …">` → `<main className="ad-main ed-page">`. Keep `<AdminFarePilotWidget>` exactly where it is. Delete the trailing inline `<style>` block once its rules are re-homed (grep each class it defines; anything still used moves to `.ad-*`).

- [ ] **Step 2: Rules**
```css
/* ---- Admin chrome ------------------------------------------------------- */
.ad-shell { position: fixed; inset: 0; overflow: auto; background: var(--bg); color: var(--ink); font-family: var(--font-ui); }
.ad-top { position: sticky; top: 0; z-index: 30; display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 24px; height: 56px; padding: 0 24px; background: var(--panel-bg); color: var(--panel-fg); }
.ad-brand { display: flex; align-items: center; gap: 10px; color: var(--panel-fg); text-decoration: none; }
.ad-brand-name { display: block; font-family: var(--font-serif); font-size: 19px; line-height: 1; }
.ad-brand-meta { display: block; font-family: var(--font-mono-ed); font-size: 9px; letter-spacing: 0.18em; text-transform: uppercase; opacity: 0.6; margin-top: 3px; }
.ad-crumb { opacity: 0.75; } .ad-right { display: flex; gap: 10px; align-items: center; } .ad-live { color: var(--accent); display: inline-flex; gap: 6px; align-items: center; }
.ad-top .ed-btn-secondary { background: transparent; color: var(--panel-fg); border-color: color-mix(in srgb, var(--panel-fg) 30%, transparent); }
.ad-rail { position: fixed; top: 56px; bottom: 0; left: 0; width: 214px; overflow: auto; background: var(--surface); border-right: 1px solid var(--rule); padding: 18px 0; }
.ad-rail-group { font-family: var(--font-mono-ed); font-size: 9.5px; letter-spacing: 0.18em; text-transform: uppercase; color: var(--muted-3); padding: 18px 24px 8px; }
.ad-rail-item { display: block; padding: 8px 24px 8px 22px; font-size: 13.5px; color: var(--muted); text-decoration: none; border-left: 2px solid transparent; }
.ad-rail-item:hover { color: var(--ink); } .ad-rail-item.active { color: var(--ink); background: var(--surface-2); border-left-color: var(--accent); }
.ad-main { margin-left: 214px; min-height: calc(100vh - 56px); }
@media (max-width: 900px) { .ad-rail { position: static; width: auto; border-right: 0; border-bottom: 1px solid var(--rule); } .ad-main { margin-left: 0; } }
```

- [ ] **Step 3: Build, log in as owner, verify the rail shows all 14 items in 6 groups with the active rule; audit `/admin` both themes → `[]`; compare `screenshots/01-admin.png`. Commit `feat(admin): editorial top bar + rail`.**

### Task 3.2 – 3.6: The 13 README views + 3 extras (grouped by feature block)

Same five-step shape as Task 2.2 (inventory → restructure → inventory diff → hex → build/audit/commit). Grouped so each task ships one feature-block implementation and reuses it:

| Task | Views (route → file) | Feature block | Buttons that must survive | Hex cleared |
|---|---|---|---|---|
| **3.2** | Command centre `/admin/page.tsx` · Click stream `/admin/clicks` · Acquisition `/admin/signups` · Errors `/admin/errors` | **Stacked bars**: 30 bars, 190px, 5px gap, `--accent` over `--amber`, bottom rule, mono axis — `StackedBars.tsx` in `admin/_components` taking `{ series: Array<{ a: number; b: number; label: string }> }` | `Export briefing` · `Approve requests` · `Open live feed` · `Approve batch` · `Clear resolved` · row `Review →` / `Open →` / `Approve →` | `admin/signups/page.tsx` (6) → `FunnelRow color` prop becomes a token class name |
| **3.3** | Economics `/admin/economics` · Revenue `/admin/revenue` | **Area + dashed line**: 600×190 viewBox, fill accent @12% (`fill="var(--accent)" fillOpacity="0.12"`), 2px accent line, dashed `--amber` — `AreaChart.tsx` | `Run audit` · `Adjust budget` · `Compare periods` · `Export CSV` · `Open Stripe` | `admin/economics/page.tsx` (2) |
| **3.4** | Fare truth `/admin/trust` · Accounts `/admin/users` (+ `[id]`) | **Ranked bars** (reuse `.ed-ranked`) | `Invite user` · row `Open →`; the `[id]` page and its `RowMenu` keep every action (tier / status / delete) | — |
| **3.5** | Funnel `/admin/funnel` · Fare engine `/admin/health` | **Funnel** (5 stages, 44px bars on `--surface-2`, last `--amber`, serif value right) · **Poll heatmap** (7×24, 20px cells, 3px gap, `color-mix(in srgb, var(--accent) N%, var(--surface))` N 12→92) | `Force poll` · `Fare engine →` | — |
| **3.6** | Content queue `/admin/queue` · Integrations `/admin/integrations` · Settings `/admin/settings` · **extras:** Support tickets `/admin/tickets` (+ `[ref]`), `/admin/affiliate`, `/admin/farepilot` | **Tile grid** (queue, integrations) · **Toggles** (settings) · extras: shared skeleton only | `Approve all` · `New draft` · `Add provider` · `Integrations →` · `Save provider toggles`; tickets/affiliate/farepilot: every existing button, grep-diffed | — |

For every admin data chart: numbers come from the page's existing loaders (`queries.*` in `src/lib/db.ts`); the components above take plain arrays and never fetch.

### Task 3.7: Remaining non-tab pages declaring a legacy theme

**Files:** `src/app/login/page.tsx:113,133`, `src/app/demo/page.tsx:33`, `src/app/about/page.tsx:13`, `src/app/terms/page.tsx:62`, `src/app/trial-terms/page.tsx:39`, `src/app/checkout/page.tsx:32`, `src/app/credits/page.tsx:16`, plus the rest of the 61-route enumeration not yet touched (`/airbnbs /board /compare /contact /destinations /onboarding /org/* /privacy /rentals /share/* /status /support/* /trip/*`).

- [ ] For each: remove `data-fc-theme="…"` and the `fc-shell`/`fc-landing` wrapper class; wrap in `.ed-page` (or `.mk` for the public legal pages); convert `fc-btn*` → `ed-btn*`, `fc-section-title` → `ed-h2`, `fc-smallcaps` → `ed-eyebrow`. Grep-diff every button label per page. Audit each in both themes. One commit per 3–4 pages.

### Task 3.8: Hex ledger to zero

- [ ] Convert the remaining ledger files: `DemoCarousel.tsx`, `WorldMap.tsx`, `SvgGlobe.tsx`, `GlobeHUD.tsx`, `InteractiveGlobe.tsx`, `m/verify/page.tsx`, `Logo.tsx`, `fc/SkyGradient.tsx` (its five shader colours are read from tokens at runtime — repoint to `--bg`/`--accent`), `charts.tsx` (Recharts `stroke="var(--accent)"`), `ExecKpiStrip.tsx`. `ALLOWLIST` ends as `{ 'src/app/integrations/page.tsx': N, 'src/components/WhiteLabelSettings.tsx': 1 }` (the tenant swatch). Full suite green.

### Task 3.9: Delete the theme machinery

- [ ] **Step 1: Grep-gates, each must print nothing**
```bash
grep -rn 'data-fc-theme\|data-fc-accent\|fc-shell\|fc-landing\|FcTweaks' src --include='*.tsx' --include='*.ts'
grep -rnE -- '--nc-[a-z0-9-]+' src --include='*.tsx' --include='*.ts' --include='*.css' | grep -v editorial.css
```
- [ ] **Step 2: Delete** from `globals.css`: every theme-scoped range (705–712, 2079–2326, 2782–2940, 3038–3055, 3175–3178, 3478–3486, 3662–3888, 3931–4034, 4139–4146 — re-derive the numbers with `grep -n 'data-fc-theme'` at execution time since earlier deletions shift them), the `.legacy-nc-tokens-retired` block, and every remaining `.fc-*` rule whose class no longer appears in `src`. Delete `src/components/FcTweaks.tsx`, `src/components/ClientSidebar.tsx`, `src/components/ExecutiveTopBar.tsx`, `src/components/NavLinks.tsx` (grep-gated: zero importers). Delete the `--nc-*` alias block from `editorial.css`.
- [ ] **Step 3: Build; run the audit on EVERY route in the enumeration, both themes** (owner session for `/admin/*`, `/org/*`, `/settings`). Record the per-route result table in `docs/design/getlayers.md` (Task 3.11).

### Task 3.10: Font cleanup

- [ ] Grep-gate: `grep -rn 'font-fc-sans\|font-fc-display\|font-cabin\|font-display\b' src --include='*.tsx' --include='*.css'` prints nothing → remove `Inter, Plus_Jakarta_Sans, Fraunces, Manrope, Archivo` imports and their variables from `layout.tsx`; keep `JetBrains_Mono` only if `--font-mono` still has consumers (grep). Build; commit `chore(fonts): drop the five retired faces`.

### Task 3.11: Update `docs/design/getlayers.md` and ship Phase 3

- [ ] **Step 1:** Prepend a dated section to `docs/design/getlayers.md`: "## 10. Editorial redesign — 2026-09-2x. Night-cabin retired on all three surfaces. The `--nc-*` tokens, the `[data-fc-theme]` machinery and the amber-reserved-for-fares rule are gone; §3–§5 below are historical. The system is now the 22 tokens in `docs/design/handoff/README.md`, installed in `src/app/editorial.css`; theme is `html[data-theme]` from the `fc-theme` cookie. Amber is a legitimate secondary chart series. Primary actions use `--btn-bg`." Then the per-route audit table (61 routes × light/dark, all `0`).
- [ ] **Step 2:** Update `CLAUDE.md` "Design" section to the same effect (it currently says night-cabin is canonical and forbids reverting — that instruction is now superseded by Myron's decision recorded in the handoff).
- [ ] **Step 3:** Full suite; push; MR "Editorial redesign — Phase 3: admin + theme machinery removal". Deploy gate → Myron. Verify live on all three hosts, both themes.

---

## Self-review

**Spec coverage.** Tokens (0.4) ✓ · type scale + fonts (0.5, 0.7) ✓ · geometry/no radius/shadow/gradient (0.3 enforced, 0.7) ✓ · buttons (0.7) ✓ · shared chrome portal (2.1) admin (3.1) ✓ · all 9 feature blocks (2.2 ranked, 2.3/2.5/2.7/2.10 tiles, 2.8 plans, 2.9 threshold, 2.11 toggles, 3.2 stacked, 3.3 area, 3.5 funnel + heatmap) ✓ · marketing sections in order (1.1) ✓ · light+dark persisted (0.6) ✓ · button inventory per tab (every surface task step 1/3) ✓ · hex ban incl. props (0.2 + ledger to zero in 3.8) ✓ · cleanup of `[data-fc-theme]`, cabin/coal/ivory/paper blocks, FcTweaks — only after conversion, grep-gated (3.9) ✓ · contrast audit both themes per surface, computed token not vibe (every task; 3.9 full enumeration) ✓ · `getlayers.md` updated (3.11) ✓ · deploy via deploy.sh only, gated (1.2, 2.12, 3.11) ✓ · "no IA change" — the sidebar→top-bar move is chrome, same 10 links, every control inventoried (2.1) ✓.

**Gaps closed while reviewing:** (a) `/welcome` in the brief → `/early-access` in reality, stated up front; (b) 16 admin dirs vs 13 views → 3 extras handled in 3.6; (c) the tenant white-label swatch is a sanctioned hex (2.11); (d) the `.dc-*` deletion is grep-gated because `/about`/`/demo`/`/contact` might share classes (1.2).

**Type consistency:** `PortalTopBar` props match `ClientSidebar`'s `{user, isAdmin, language}` + `locale` (2.1 ↔ layout); `readThemeCookie(string|null): 'light'|'dark'` used identically in 0.6 test and layout; `ALLOWLIST: Record<string, number>` shrinks in 2.2, 2.10, 2.11, 3.2, 3.3, 3.8; `.ed-*` class names in 0.7 are the ones every later task uses.

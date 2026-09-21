# GetLayers × FlyCheap — integration + house rules

**What GetLayers is:** an AI-native library of Next.js templates, sections, WebGL 3D scenes,
animated backgrounds and gradients. It is *not* a design system — it is a parts bin with a
lot of motion in it. Our design system is night-cabin (see `design_canonical_dashboard` memory
and the `--nc-*` tokens at `src/app/globals.css:3466`).

Source of truth for setup: <https://www.getlayers.ai/mcp> · <https://www.getlayers.ai/docs>

---

## 1. Setup — status

**Done (2026-09-18):** marketplace added and plugin installed, from the CLI rather than the
`/plugin` dialog. These work non-interactively and are the reliable form:

```bash
claude plugin marketplace add textura-agency/getlayers-plugin
```

```bash
claude plugin install getlayers@getlayers
```

The `add` must come first — `/plugin install getlayers@getlayers` on its own fails with
`Marketplace "getlayers" not found`, because the marketplace is not registered by default.

What the plugin contains (verified before install): one HTTP MCP server at
`https://mcp.getlayers.ai/mcp` and one skill. No hooks, no scripts.

**Authenticated 2026-09-18.** `claude mcp list` reports
`plugin:getlayers:getlayers: https://mcp.getlayers.ai/mcp (HTTP) - ✔ Connected`.

The OAuth step does NOT require the `/mcp` dialog. `claude mcp login` runs it, but it aborts
with *"stdin isn't a terminal"* when called from a non-interactive harness — even though it
also runs a localhost callback listener that would complete the flow on its own. Wrapping it
in a pty defeats that check:

```bash
script -q /tmp/gl-auth.log claude mcp login plugin:getlayers:getlayers
```

It opens a browser, you sign in to GetLayers and approve, and the localhost listener finishes
the exchange with no paste. **The server name is `plugin:getlayers:getlayers`, not `getlayers`**
— plugin-provided servers are namespaced. Credentials persist, so this is a one-time step.

**Restart Claude Code before the tools appear.** A session binds its MCP tool list at startup,
so the session that performs the login cannot use the tools it just unlocked.

- Requires the **Full Stack Lifetime** plan. Confirm the subscription is that tier — the
  Unlimited tier grants the prompt library and commercial licence but **not** MCP access.

### Companion skill

The plugin ships the skill (`skills/getlayers/SKILL.md`), so the manual fetch the vendor's MCP
page suggests is unnecessary. `CLAUDE.md` carries the rule that matters: **always call
`getlayers_start` FIRST.**

---

## 2. Tool flow (from the vendor skill)

`getlayers_start` **always first** — returns capabilities, vocabulary, environment. Then route
to exactly one mode:

| Tool | Use |
|---|---|
| `getlayers_search` / `getlayers_browse` | find a template, scene or asset |
| `getlayers_explore` | browse the whole library |
| `getlayers_compositions` | layout skeletons by role |
| `getlayers_scene_lab` | design a bespoke 3D scene |
| `getlayers_palettes` | colour ramps for retinting |
| `getlayers_fonts` | typefaces + CSS stacks |
| `getlayers_materialize` | emit the final output |
| `getlayers_source(id, file)` | pull ONE file out of a template |

Vendor rules that matter here:

- Commit to **one `styleId`** early and pass it to every `materialize` call.
- Pass `target: 'next'` — we are Next 16 / React 19.
- **Never hotlink** `storage.getlayers.ai` assets. Download into `public/`, repoint markup.
- `getlayers.json` holds build state across phases — read before, write after.

---

## 3. Scope — where GetLayers is allowed

Night-cabin is finished and Myron's standing instruction is not to revert it. GetLayers supplies
**motion and section structure**; night-cabin keeps **colour, type and hierarchy**. Non-negotiable.

| Surface | GetLayers | Why |
|---|---|---|
| **flycheap.live** (marketing) — `/early-access` (the front door), `/about`, `/pricing`, `/integrations`, `/demo` | **Yes** — templates, hero scenes, backgrounds, gradients | First impression for big clients; exactly the page type GetLayers is built for |
| **my.flycheap.live** (client portal) — dashboard, searches, explore, hotels, offers, settings | **Selective** — a background or gradient behind a hero at most. No templates. | A data product. Animated marketing sections fight the ticket-stub language and the "fares are the one loud thing" rule |
| **admin.flycheap.live** (admin) | **No** | Operator console. WebGL costs load time and buys nothing |

Host routing lives in `src/lib/hosts.ts` (`MARKETING_HOST` / `CLIENT_HOST` / `ADMIN_HOST`).

---

## 4. Retinting rules — apply to every materialized layer

### The Style conflict, resolved

GetLayers wants you to commit one of its Styles and pass `styleId` to every `materialize`.
Night-cabin already owns colour and type here. **Night-cabin is the Style — it never becomes a
GetLayers Style.** The mechanism that makes this work: `paletteId` overrides a Style for
**colour only**, leaving tokens and type alone. So pass a palette that resolves the four roles
onto the `--nc-*` tokens:

| GetLayers role | night-cabin token | |
|---|---|---|
| `background` / `gl-bg` | `--nc-dark` `#0B1220` | page ground |
| `secondary` / `gl-bg-alt`, `gl-surface` | `--nc-deck` `#131C2E`, `--nc-deck-2` `#1B2740` | panels |
| `primary` / `gl-ink` | `--nc-on-dark` `#E9EDF5` | body ink |
| `accent` / `gl-accent` | **`--nc-teal` `#6FB3C9`** | — NOT amber |

**This is now a system-wide rule, not just a retint rule for GetLayers layers.** Shipped in
MR !30: `brand.gold`/`brand.accent` are deleted, every non-fare accent in the app takes
`--nc-teal`, and the only sanctioned amber outside a fare or primary action is the logo mark
(whose subject is a fare falling). So a GetLayers layer tinted per this table lands already
consistent with the rest of the product.

**`--nc-amber` must never be mapped to the accent role.** GetLayers spends its accent on
instrumentation, glows, rules and hover states — decoration, by design. Night-cabin reserves
amber for fares and primary actions. Map amber onto `gl-accent` and every retinted layer puts
amber on decoration *by construction*, and the price stops being the loudest thing on the page.
Teal takes the accent role; amber stays out of the tint map entirely and is applied by hand,
afterwards, only to a fare or a primary button.

### The rest of the pass

1. **Strip the vendor palette.** Every literal colour becomes an `--nc-*` token.
2. **Fonts:** `Archivo` (display / route codes), `Inter` (UI), `JetBrains Mono` (every fare and
   code). Ignore `getlayers_fonts` unless deliberately adding a display face.
3. **No emoji** in feature grids or editorial copy — custom SVG mini-icons.
4. **Motion:** `.nc-changed` fires only when a fare actually moved. Accept GetLayers scroll and
   ambient motion on marketing; do **not** import entrance animations into the portal. Every
   scene must respect `prefers-reduced-motion` — and note the vendor's own choreography doc
   admits two shipped templates ignore it in their shader loops. Turn canvas loops off yourself.
5. **`✦`** stays the mistake-fare glyph. Don't let a template borrow it for decoration.
6. **Tint scenes through CONFIG, never the shader.** Editing shader colour produces garbage.

### Structure, not decoration: SVG grids are rules

The globe's lat/long graticule was drawn in gold (`rgba(212,175,55,.10)`) — accent spent on pure
structure, the exact failure the amber rule names. Graticules, hairlines, axes and dividers take
`--nc-rule` / `--nc-rule-2`. When an SVG needs a token, `stroke="var(--nc-rule, …)"` resolves
fine; keep alpha in `strokeOpacity`/`fillOpacity` so the token stays a flat hue.

## 5. Technical guardrails

- **three.js is already ours.** `three@^0.184` + `react-globe.gl@^2.37` power the canonical globe.
  Before importing any GetLayers 3D scene, check the major it expects. A bump breaks the globe.
  If a scene needs a different three, isolate it rather than moving the shared dep.
- **Deploy lock.** Ship via `deploy/deploy.sh`. A bare `next build` is refused
  (`DEPLOY_LOCK_HELD`) — that guard prevents concurrent-build outages. Do not let a GetLayers
  "Next.js starter" pull us toward a parallel project structure; we take *files*, not scaffolds.
- **Bundle budget.** Marketing pages hold 80–90+ PageSpeed today. WebGL scenes are heavy —
  `next/dynamic` with `ssr: false` for anything canvas-based, and measure before and after.
- **Licence.** Extend a layer; never ship it untouched, and never redistribute the source
  templates as a standalone or competing product.

---

## 6. Suggested first build

> **`/welcome` IS RETIRED — it is not the marketing site.** The apex serves
> **`/early-access`**, which is a separate `dc-*` design system, not the `--nc-*` one.
> Check what a host actually serves before designing for it; this doc told two
> earlier passes to design for a dead route.

Lowest risk, highest value: `/early-access`. It is public, it is the prospect's first
impression, and it is already themed so the retint pass is a diff, not a rewrite.

1. `getlayers_start`
2. `getlayers_compositions` — find a hero + feature-grid skeleton for a SaaS/data product
3. Pick one `styleId`; reuse it everywhere after
4. `getlayers_scene_lab` — a route-arc / flight-path scene to replace the current static globe
   on the hero, tinted `--nc-teal` arcs with `--nc-amber` reserved for the CAI origin marker
5. Retint per §4, download assets to `public/`, then `deploy.sh`

**Audit the copy while porting.** Nine false customer-facing claims (invented provider counts,
polling cadences, tier limits) have been found and fixed on these pages already. Template copy
is lorem with confidence — every number must come from `TIER_LIMITS` or `public-metrics.ts`,
never from a GetLayers placeholder.

---

## 7. What shipped — 2026-09-18

### Library fit: the honest assessment

Browsed the whole catalogue against the "flight/airline only" brief:

- **Backgrounds (78): zero aviation.** Hands in clouds, a songbird, a bonfire, a glass cube.
  Video backgrounds are not usable for FlyCheap.
- **Scenes (114): one on-brief** — `planet` (earth, day/night terminator, city lights). It needs
  `planet.glb` + `planet-lights.glb` + `planet-clouds.png` and is medium-cost WebGL. **Rejected:**
  a photoreal earth fights a design system built on ticket stock and instruments, the combination
  rules warn against medium-cost scenes above the fold, and the existing `FcGlobe` already draws
  the user's REAL routes with real IATA hubs — swapping it would trade information for decoration.
- **Templates (49): all complete brand art-directions for other businesses** (an F1 driver, a
  construction firm). Each carries a Style that would replace night-cabin wholesale.
- **Compositions (109) and gradients (98): genuinely useful.** Compositions ship no colour, type
  or copy, so they conflict with night-cabin not at all.

**Conclusion: use GetLayers for layout and atmosphere, never for styling.**

### `SkyGradient` — `src/components/fc/SkyGradient.tsx`

The gradient `firmament`, ported to a React client component and retinted. Pure WebGL2 (one
fullscreen triangle, one fragment shader) — **no assets, no library, no network**.

- Contract is `{ mutable: ["skin"], preserve: ["motion"] }`. The five colours are ours; the frame
  loop is copied verbatim and must not be "tidied" — it is frame-rate independent and clamps the
  clock so an alt-tab costs a pause rather than a lurch.
- Tint: `bgColor --nc-dark` → `colorD --nc-teal` at the top of the curve. **Amber is absent by
  design** — a gradient is decoration, and amber is reserved.
- Two changes from the vendor source: it sizes to its **parent box** (via `ResizeObserver`), not
  the window, because it is a section backdrop; and pointer input is element-relative.
- Pauses off-screen (`IntersectionObserver`), renders a single static frame under
  `prefers-reduced-motion`, and returns silently with no WebGL2 so the hero degrades to flat
  `--nc-dark`.

Layering in `.fc-hero` is explicit (`sky 0 → ::before graticule 1 → content 2`) because a
`::before` paints before real children and the canvas would otherwise cover the graticule.

### `RouteField` — `src/components/fc/RouteField.tsx`

The second GetLayers-derived component, and the one actually on the marketing front door.
Canvas 2D (not WebGL), drawing great-circle flight paths as the backdrop behind
`/early-access` — the "register" Myron pointed at with guarder.io.

- **Every stroke is under 20% alpha.** It is a backdrop; the moment it competes with the
  headline it has failed. A `destination-in` radial plus a vertical fade keeps the centre and
  the bottom clear so copy always sits on near-flat ground.
- Palette is read from `--nc-teal` / `--nc-amber` **at runtime** rather than baked, so it can
  never drift from the tokens the way the globe's hardcoded `#d4af37` prop did.
- Pauses off-screen, and renders a single static frame under `prefers-reduced-motion`.

Why Canvas 2D and not a GetLayers WebGL scene: the doc's own bundle budget. A flight-path field
is cheap in 2D and the marketing pages hold 80–90+ PageSpeed.

### Bugs fixed on the way

1. **The globe was still drawing Bloomberg gold.** `FcGlobe accentColor="#d4af37"` was hardcoded
   at both `page.tsx` and `welcome/page.tsx` call sites and as the component default — **a token
   remap cannot reach a hardcoded prop**, so the `--fc-gold` → cabin-amber remap never applied.
   Arcs, hub markers and labels now take `--nc-amber`; non-hot arcs and the landmass take
   `--nc-teal` (globals.css line 3474 already declared teal as the route-arc colour).
2. **The lat/long graticule was gold** (`rgba(212,175,55,.10)`) — accent on pure structure, which
   is exactly what the amber rule forbids. Now `--nc-rule` / `--nc-rule-2`.
3. **The hero's own background carried a gold radial wash** the remap couldn't reach either. Under
   cabin the hero ground is now flat `--nc-dark` and the sky supplies the atmosphere.
4. **A pre-existing hydration mismatch on every landmass dot.** `Math.sin/cos` differ between Node
   and Chrome in the last ULPs, so React reported a mismatch on ~200 circles and logged "this
   won't be patched up". Verified pre-existing by reverting the file and reproducing it. Fixed by
   rounding the projection to 3dp — far below a pixel on a 480 viewBox.

### The theme enforcer was undoing the whole conversion (found + fixed, `64fa08a`)

Trying to preview the headline in teal vs ink revealed that **night-cabin had not been rendering
at all**. `FcTweaks` rewrote *every* `[data-fc-theme]` element to `'coal'` on hydration, so
`/welcome` and the dashboard were served `cabin` and immediately reverted. Both themes are dark,
so it looked plausible while every `[data-fc-theme="cabin"]` remap silently stopped applying —
which is why `--fc-gold` still resolved to `#d4af37` instead of `#e8a33d`.

**The lesson worth keeping: a dark-looking page is not evidence the right dark theme is applied.**
Check the computed token (`getComputedStyle(el).getPropertyValue('--fc-gold')`), not the vibe.

Removing the sweep outright was wrong — `/about`, `/terms`, `/checkout`, `/demo` and
`/trial-terms` still declare the pre-cabin `ivory` theme, and they turned into white pages inside
a dark product. Caught in the browser before committing. The sweep now normalises **light themes
only** and never touches a surface declaring a dark one.

**Next step:** ~~convert those five pages to `cabin` and the sweep can be deleted entirely.~~
**Done** — see §8. But it was *six*, then it turned out to be **seven**: `/credits` was missed
and only found on 2026-09-19. See §9.

### Resolved

- Hero headline italics are now **ink** (`--nc-on-dark`). On `/welcome` the only amber left is
  the CTA and the live route arc.
- `scene_lab` timed out at 300s on the first (detailed) call; a shorter description succeeded.
  Set a per-server `timeout` in MCP settings if authoring scenes becomes routine.

---

## 8. The theme rollout, finished — 2026-09-18

Converting the last six pages to `cabin` and deleting the enforcer's sweep turned
night-cabin on for real. That surfaced a batch of bugs that had been invisible because
**the cabin CSS had never actually painted in a browser**.

### The lesson worth keeping

**A dark-looking page is not evidence the right dark theme is applied.** Coal and cabin are
both dark, so the revert was undetectable by eye for weeks. The tell is the computed token:

```js
getComputedStyle(el).getPropertyValue('--fc-gold')   // #e8a33d = cabin · #d4af37 = stale
```

### The structural cause of nearly every contrast bug

Three tokens do double duty, and the cabin blocks remapped each for its dominant use:

| Token | Used as | Also used as | Result under cabin |
|---|---|---|---|
| `--fc-cream` | page ground | ink on dark bands | ink became the ground colour (1.05) |
| `--fc-ink` | ink | ground of dark chrome | chrome bars inverted to light (1.17) |
| `--fc-navy` | surface (shell block) | **ink** (title accents, route codes) | ink became a panel grey (1.2) |

`--fc-navy` was a genuine mapping error — the shell block pointed it at `--nc-deck-2` while
the landing block correctly used `--nc-teal`. Fixing the mapping cleared several symptoms at
once. The other two are legitimately ambiguous, so their inverted *uses* are overridden
individually rather than re-pointing tokens that 40+ rules depend on.

**If you add a cabin override, first ask whether the token mapping is wrong.** Patching the
symptom hides the next five instances.

### The audit

Run this in the console on any page; it reports every text node below 4.5:1 against its
nearest painted ancestor background. All 14 pages currently return zero.

```js
const L=c=>{const cs=/^color\(srgb/.test(c);const m=c.replace(/^color\(srgb\s*/,'').match(/[\d.]+/g);if(!m)return null;let[r,g,b]=m.slice(0,3).map(Number);if(cs){r*=255;g*=255;b*=255}
if(m[3]!==undefined&&+m[3]<0.3)return null;const f=v=>{v/=255;return v<=0.03928?v/12.92:((v+0.055)/1.055)**2.4};
return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b)};
const B=e=>{while(e){const l=L(getComputedStyle(e).backgroundColor);if(l!==null)return l;e=e.parentElement}return 0};
[...document.querySelectorAll('body *')].filter(e=>[...e.childNodes].some(n=>n.nodeType===3&&n.textContent.trim()))
 .map(e=>{const f=L(getComputedStyle(e).color);if(f===null)return null;const b=B(e);
  return {e,r:(Math.max(f,b)+.05)/(Math.min(f,b)+.05)}}).filter(x=>x&&x.r<4.5);
```

Two deliberate exclusions: the white-label **"Brand text" swatch** in settings exists to show
the tenant their own colour, and elements under 30% alpha are skipped as decorative.

### Still open

- **White-label brand colour is not contrast-checked.** An arbitrary tenant hex is used raw for
  link text, so a dark brand on a dark ground is unreadable. Cabin overrides it (and the
  override now covers bare `.text-brand` too, which was missed); the real fix is still to
  derive a contrast-safe variant per surface rather than override tenant branding wholesale.
- `.fc-shell[data-fc-theme="ivory"]` / `"paper"` rules in globals.css are dead **as of
  2026-09-19** — `/credits` was the last markup declaring a light theme (§9).

### Closed since

- ~~Stale domain on the landing (`src/app/welcome/page.tsx`).~~ That route is retired; the only
  remaining `flycheap.18dn.com` strings in `src/` are comments, not live values.
- ~~The test suite does not run.~~ It runs: **20 files, 185 tests, all passing** (verified
  2026-09-19). The deletions were an unstaged working-tree state, not a repo state — which
  matters, because it means a green CI pipeline on an MR is meaningful again.

---

## 9. `/credits` — the seventh ivory page — 2026-09-19

§8 says "the last six pages". **There were seven.** `/credits` still declared
`data-fc-theme="ivory"` and was never converted.

The failure mode is worth remembering because it is *not* the obvious one. It did not render as
a white page in a dark product — that would have been caught immediately. Instead:

- the page GROUND went dark, because the html-level `coal` theme won;
- the credit cards kept `background: var(--fc-paper)`, which the ivory block resolved to cream;
- but `--fc-muted` / `--fc-faint` are remapped by the cabin blocks to `--nc-on-dark-mute` /
  `--nc-on-dark-faint`, inks meant for DARK grounds.

Result: light-grey text on cream cards — photographer, IATA code and licence line under all 106
photographs. **426 failing text nodes on a public page linked from the footer.** Textbook token
double-duty inversion, the same class §8 documents.

Fixed with the one-word conversion the other six already had: under cabin `--fc-paper` resolves
to `--nc-deck`, so the cards become dark panels and the dark-ground inks are correct on them.
426 → 0.

**The lesson: it survived every audit because no audit ever visited `/credits`.** A per-page
audit only proves the pages you list. Enumerate routes from the filesystem, not from memory.


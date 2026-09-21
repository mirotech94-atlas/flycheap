# Handoff: FlyCheap redesign — marketing site, client portal, admin

## Overview
A full visual redesign of the three FlyCheap surfaces, with no change to information
architecture, routes, features or CTAs:

1. **flycheap.live** — public marketing site (hero + live fare feed, problem, how it works,
   product preview, features, metrics band, pricing, FAQ, final CTA, footer).
2. **my.flycheap.live** — the logged-in client portal, all ten existing tabs:
   Dashboard, Explore, Offers, Hotels, Routes, Guides, Pricing, Searches, Integrations, Settings.
3. **admin.flycheap.live** — the founder command centre, all thirteen existing views grouped as
   Overview (Command centre) · Analytics (Fare truth, Economics, Funnel) · Commercial (Revenue,
   Click stream) · Customers (Acquisition, Accounts) · Operations (Fare engine, Content queue,
   Errors, Integrations) · Platform (Settings).

The brief was: **change the design completely, keep every tab, every button and all logic.**
More visuals, fewer words, calmer density. Both light and dark themes are included.

## About the Design Files
The files in this bundle are **design references created in HTML** — prototypes showing the
intended look and behaviour. They are **not production code to copy**. The task is to recreate
them inside the existing FlyCheap codebase (Next.js App Router + React + Tailwind/CSS modules as
already used in `src/app` and `src/components`), reusing its data fetching, auth, routing and
component conventions. All data in the prototypes is representative sample data.

## Fidelity
**High-fidelity.** Colours, typography, spacing and layout are final and should be matched
closely. Chart shapes and numbers are illustrative; wire them to the real queries.

---

## Design language

A ruled editorial data sheet rather than a card UI. Rules and generous whitespace do the
separating; there are no rounded corners, no shadows, no gradients anywhere. Every screen in the
portal and admin is the same skeleton, so tabs feel like one product:

```
page header   eyebrow (mono caps) · serif H1 · one-line sub · action buttons (right)
stat strip    2-4 KPIs in a ruled row, each with value + delta + 20px sparkline
feature block ONE visual per tab (see catalogue below)
records       a ruled table with mono-caps column heads, optional per-row CTA
```

**Type**
| Role | Font | Size / weight |
|---|---|---|
| Page title | Newsreader 400 | 42px, line-height 1.02, letter-spacing −0.025em |
| Section title | Newsreader 400 | 23px, letter-spacing −0.015em |
| Big numbers / KPI | Newsreader 400 | 34px (KPI), 46px (metric band), letter-spacing −0.02em |
| Body / UI | Public Sans 400–600 | 13–14px, line-height 1.4–1.6 |
| Eyebrows, labels, axes, badges | IBM Plex Mono 400–500 | 9.5–11px, uppercase, letter-spacing 0.14–0.2em |
| Marketing H1 | Newsreader 400 | clamp(40px, 5.2vw, 68px), letter-spacing −0.03em |

Load: `Public Sans:400,500,600,700`, `Newsreader:300,400,500`, `IBM Plex Mono:400,500`.

**Geometry** — border-radius 0 everywhere (the only exceptions: status dots, range thumb, and the
toggle knob at 0). Rules are 1px; a table's header rule is 1px solid `--ink`. Page padding
44px 48px 80px (portal/admin main), 32px horizontal on marketing with a 1200px max width.
Grid gaps: 1px for tile grids (the background shows as the rule), 14–20px for spaced grids,
32–40px for marketing columns.

---

## Design tokens

Set as CSS custom properties on the app shell. Every colour in the design references a token —
this is what makes dark mode a one-line switch.

| Token | Light | Dark | Used for |
|---|---|---|---|
| `--bg` | #FBFAF7 | #0E1113 | page canvas |
| `--surface` | #FFFFFF | #171B1E | panels, tiles, top bar, admin rail |
| `--surface-2` | #F4F1EA | #1F2427 | active nav, dim tiles, empty bar track |
| `--ink` | #14181B | #ECEFF1 | primary text, table header rule |
| `--ink-soft` | #3B3833 | #C9CDD1 | secondary button label |
| `--muted` | #7A756C | #9AA0A6 | body copy, inactive nav |
| `--muted-2` | #9B958A | #868C92 | eyebrows, axis labels, meta |
| `--muted-3` | #B0AAA0 | #6E747A | rail group headings |
| `--rule` | #E6E2DA | #2A2F33 | primary 1px rules, borders |
| `--rule-soft` | #EFECE5 | #23282B | row separators |
| `--rule-strong` | #D9D4CA | #384045 | secondary button border |
| `--track` | #DCD8D0 | #2E3438 | unfilled bar/histogram/toggle track |
| `--accent` | #1F615D | #55B8B1 | primary data colour, active nav rule, links |
| `--amber` | #C98A3C | #D9A05B | secondary series, "wait", featured tier CTA |
| `--green` | #3E7D5A | #5FB183 | positive delta, healthy status |
| `--red` | #B4453C | #E0776D | negative delta, errors |
| `--panel-bg` | #14181B | #0A0C0E | admin top bar, alert preview, featured tier |
| `--panel-fg` | #FFFFFF | #FFFFFF | text on those panels |
| `--btn-bg` | #14181B | #ECEFF1 | primary button fill |
| `--btn-fg` | #FFFFFF | #0E1113 | primary button label |
| `--knob` | #FFFFFF | #ECEFF1 | toggle knob |
| `--on-accent` | #FFFFFF | #0B1211 | text on an accent-filled cell |

Heatmap and month-grid intensities are `color-mix(in srgb, var(--accent) N%, var(--surface))`,
N from 12 to 100 — this keeps them readable in both themes without a second palette.

**Buttons** (no radius, no shadow)
- Primary: `background var(--btn-bg)`, `color var(--btn-fg)`, padding 10px 16px, 12.5px/600.
- Secondary: `background var(--surface)`, `1px solid var(--rule-strong)`, `color var(--ink-soft)`.
- Row CTA: primary fill, padding 7px 13px, 11.5px/600, right-aligned in its own grid track.
- Tile CTA: `1px solid currentColor`, transparent fill, padding 6px 11px, 11px/600.
- Marketing hero/CTA: padding 13px 22px, 14px/600.

---

## Screens

### Shared chrome
- **Portal top bar** — sticky, `--surface`, 1px bottom rule. Left: icon (24px) + "FlyCheap" /
  "Fare intelligence". Centre: the ten tabs, 13px/500, active gets `--ink` plus a 2px
  `--accent` bottom rule. Right: "Polling" live dot, theme toggle, "Admin" link.
- **Admin top bar** — `--panel-bg`, white text, breadcrumb "Admin / <page>", "Live · production"
  dot, theme toggle, "Client portal" link.
- **Admin rail** — 214px, `--surface`, right rule. Six mono-caps group headings with their items;
  active item has a 2px left `--accent` rule and `--surface-2` fill.

### Feature-block catalogue (one per tab)
| Block | Where | Spec |
|---|---|---|
| Stacked bars | Command centre, Click stream, Acquisition, Errors | 30 bars, 190px tall, 5px gap, `--accent` over `--amber`, bottom rule, mono axis labels |
| Area + dashed line | Economics, Revenue | 600×190 viewBox, fill accent @12%, 2px accent line, dashed `--amber` comparison/forecast, 12 month ticks |
| Ranked bars | Dashboard, Offers, Routes, Fare truth, Accounts | name + meta / 8px bar on `--track` / mono value / optional CTA track |
| Funnel | Funnel | 5 stages, 44px bars on `--surface-2`, last stage `--amber`, serif value right |
| Poll heatmap | Fare engine | 7×24 grid, 20px cells, 3px gap, accent mixed 12→92% |
| Tile grid | Explore, Hotels, Guides, Integrations, Content queue | auto-fit minmax(150px,1fr), 1px gaps over `--rule`, kicker / serif value / meta / optional CTA |
| Threshold | Searches | 26-bar histogram (Gaussian around $660), bars ≤ target `--accent` else `--track`; range input 380–980 step 10; live "N% of recent fares would alert"; dark alert-preview panel beside it |
| Toggles | Settings (portal + admin) | ruled rows, 44×24 switch, track `--accent`/`--track`, 18px knob, 160ms translate |
| Plans | Pricing | 3 tiles, 1px gaps, current plan uses `--panel-bg`, serif price 38px, CTA at the bottom |

### Marketing site (flycheap.live)
Sections in order: sticky nav → hero (serif H1 + copy + two CTAs beside a live fare feed panel of
five routes with sparkline and BUY/WAIT/WATCH tag) → provider trust strip → problem (3 ruled
tiles) → how it works (3 steps with 2px top rules) → product preview (30-day chart + alert
anatomy) → features (6 items, ruled tops) → dark metric band (4 numbers) → pricing (monthly/yearly
switch, Pro tile inverted with amber CTA) → FAQ (`<details>` rows) → final CTA → footer.

---

## Interactions & behaviour
- Portal tab bar and admin rail switch the page in place; no route change is prototyped, but each
  maps 1:1 to an existing route (`/`, `/explore`, `/offers`, `/hotels`, `/routes`, `/guides`,
  `/pricing`, `/searches`, `/integrations`, `/settings`, and the `/admin/*` equivalents).
- Searches threshold slider recomputes the histogram fill and the hit-rate line live.
- Alert-channel chips, notification toggles, plan selection and the pricing period switch are all
  stateful.
- Theme toggle in both top bars swaps the token set; it is also exposed as a `theme` prop.
- FAQ items are native `<details>`/`<summary>`.
- Hover: buttons and links reduce opacity to ~0.72. No transforms, no shadows.
- Responsive: everything except the fixed rails uses `auto-fit minmax()` grids and wraps; nothing
  relies on a fixed page width.

## Buttons preserved (this was the explicit requirement)
Labels and placement are unchanged from the live app; only their styling changed.

- **Dashboard** — Book cheapest → $X · Add a new watch · Compare pinned · Upgrade to Pro · $5/mo →;
  Book → on each ranked route and each alert row; Pin to compare.
- **Explore** — Live search now → · Change home airport · Try a higher budget; Book this window →
  per month tile; Book now → per destination row.
- **Offers** — Search any route window · Track a route · Compare pinned; Book → per offer.
- **Hotels** — Update search · Airbnbs · Compare hotels; Book now → per city tile and row.
- **Routes** — Add a route → · Search now →; Search → per route.
- **Guides** — Request a guide; Read guide → / Read →.
- **Pricing** — Upgrade to Pro → · Monthly / Yearly · save 36% · Talk to sales; per-tier
  Upgrade / Your plan / Downgrade.
- **Searches** — Add a new search · Save; Book → $X and Save watch in the alert panel; Book → per watch.
- **Integrations** — Connect channel · Settings → Channels; Connect → per tile.
- **Settings** — Save · Upgrade your plan →.
- **Admin** — Export briefing / Approve requests · Run audit · Adjust budget · Compare periods ·
  Export CSV · Open Stripe · Open live feed · Approve batch · Invite user · Force poll ·
  Fare engine → · Approve all · New draft · Clear resolved · Add provider · Integrations → ·
  Save provider toggles; row-level Review → / Open → / Approve →.

## State
Portal/admin prototype state: `app` (portal|admin), `p` (portal tab), `a` (admin view),
`target` (alert threshold), `channels`, `flags` (notification + platform switches), `plan`,
`theme`. Marketing: `theme`, `period`. In production these become route params plus the
existing user/settings queries; only `theme` needs persisting (localStorage or user profile).

## Assets
`flycheap-icon.svg` — copied verbatim from `src/app/icon.svg` in the repository. No other images;
the designs use no photography. Fonts are Google Fonts.

## Files in this bundle
- `FlyCheap Redesign v2.dc.html` — portal (10 tabs) + admin (13 views), light and dark.
- `FlyCheap Marketing Site.dc.html` — flycheap.live.
- `FlyCheap Redesign.dc.html` — the earlier first-pass direction, for reference only.
- `flycheap-icon.svg` — the brand mark.
- `support.js` — runtime needed to open the .dc.html files in a browser.

Open any `.dc.html` directly in a browser to interact with it.

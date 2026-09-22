# FlyCheap — project rules

## Design

The design system is the **editorial** sheet from `docs/design/handoff/README.md`, implemented in
`src/app/editorial.css`: 22 tokens (`--bg … --on-accent`), light on `:root`, dark on
`html[data-theme="dark"]`, chosen by the `fc-theme` cookie. Night-cabin (`--nc-*`, `data-fc-theme`,
`FcTweaks`) is gone; the `--fc-*` names are aliases the dashboard-widget rules read. Faces: Public
Sans, Newsreader, IBM Plex Mono. Radius 0, no shadows, no gradients, no hex in components (the
allowlist in `tests/noHardcodedHex.test.ts` is brand/tenant data only). Manual:
[docs/design/getlayers.md §10](docs/design/getlayers.md).

The one rule that matters most: `--amber` is reserved for **fares, "wait" verdicts and the featured
pricing CTA**. Primary actions are `.ed-btn-primary` (ink). Amber is never decoration and never text
on a light surface (use `.ed-fare-text`). If amber shows up elsewhere, the price stops being the
loudest thing on the page.

## GetLayers

The `getlayers` plugin is installed and ships its own skill. When building with GetLayers,
**always call `getlayers_start` FIRST**, then route to exactly one mode tool.

Then read [docs/design/getlayers.md](docs/design/getlayers.md) — it defines which of the three
sites GetLayers is allowed on, and the retinting pass every materialized layer must go through
before it lands in `src/`.

## Deploys

Ship via `deploy/deploy.sh`. A bare `next build` is refused (`DEPLOY_LOCK_HELD`) — the lock
prevents concurrent-build outages. Never bulk-rsync local → prod; use scoped file copies.

## Copy

Every customer-facing number must be derived, never typed. Tier limits come from `TIER_LIMITS`,
public stats from `public-metrics.ts`. Nine false public claims (invented provider counts,
polling cadences, tier limits, payment methods) have been found and fixed already — audit copy
for invented numbers whenever touching a page. `isConfigured` ≠ enabled.

## Tools for this project

Account-wide plugins and connectors are installed; these are the ones that serve FlyCheap.
Recommend them when relevant and ignore the rest. Full map: memory `project-tooling-map`.

- **Connectors** — Vercel (previews, runtime logs, env; prod still ships via
  `deploy/deploy.sh`), Stripe (tiers, `TIER_LIMITS`), Gmail (Resend alert deliverability),
  vidIQ (`social/`), Google Drive (design assets), Gamma (pitch decks), iOS Simulator
  (`ios-app`).
- **Plugins/skills** — `getlayers` (see the GetLayers section above), `frontend-design`,
  `dataviz` for fare tables and history charts, `superpowers`.
- **Not for FlyCheap** — Google Calendar, the Attendance/Guardian agents.
- Slack plugin and Slack connector are duplicates; keep one enabled per session.

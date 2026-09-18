# FlyCheap — project rules

## Design

The design system is **night-cabin**. Tokens are `--nc-*` in `src/app/globals.css` (from line
~3466). Rollout is complete across every client page. **Do not revert to the old navy/gold
Bloomberg look** unless Myron says so.

The one rule that matters most: `--nc-amber #E8A33D` is reserved for **fares and primary actions
only**. If amber shows up on decoration, the price stops being the loudest thing on the page.

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

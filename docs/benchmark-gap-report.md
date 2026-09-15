# Benchmark gap report — remaining "patterns to adopt"

Source: `Competitor Logic Benchmark.md` §3. Patterns 1 (verdict card), 4 (deal email), 5 (explore ranked list) and 8 (sparklines) shipped 2026-09-06. This report covers the four that are still open, with what already exists in the repo, what is missing, and a concrete plan.

Effort key: **S** ≤ half a day · **M** 1–2 days · **L** 3+ days.

---

## 1. "Any dates" alerts (Google)

Alert on a route without committing to a depart/return pair.

### What exists
- `searches` schema (`src/lib/db.ts` `init()`): `depart_date` and `return_date` are `TEXT NOT NULL`. The insert API (`src/app/api/searches/route.ts` L15–30, and `/api/v1/searches`) validates both as `YYYY-MM-DD` and requires `return > depart`. The poller (`src/lib/poller.ts` `pollOne`) passes those exact dates to `searchFlights()`.
- A date-free pricing path already exists for the **bot subscriptions**: `runSubscriptionAlerts()` in `src/lib/notifier.ts` walks `distinctSubscriptionRoutes()` and calls `cheapestByMonth(origin, destination)` (`src/lib/explore.ts`) — 12 Travelpayouts `/v1/prices/cheap` calls per route — then fans a deal card to Slack/Telegram when the cheapest month is under the subscriber's target. This is functionally an "any dates" alert, just not for `searches`/email/push.
- `best_deals_cache` (refreshed every 12 h by `refreshBestDeals`) already holds per-(origin, destination, outbound_date, return_date) cheapest pairings; `queries.flexDateOptions()` queries ±N days around a target.
- `origins` column (comma-separated multi-origin fan-out) shows the pattern for nullable "flex" columns on `searches`.

### What is missing
- No way to store a route without dates; no UI toggle ("Track prices" vs "Any dates").
- Threshold alerts, 7-day median / z-score history, and the new verdict card all key on a `search_id` with fixed dates, so "any dates" needs its own history series.
- `cheapestByMonth` is 12 sequential fetches with no caching — fine for a handful of bot routes, not for every user's watchlist.

### Plan
1. **Schema (S).** `ALTER TABLE searches ADD COLUMN date_mode TEXT NOT NULL DEFAULT 'exact'` (`'exact' | 'any' | 'month'`) and `ADD COLUMN month_hint TEXT` (`YYYY-MM`, optional). Keep `depart_date`/`return_date` NOT NULL for back-compat; for `date_mode='any'` store a placeholder pair (e.g. today + 30 / + 37) that is never used for pricing. Idempotent `PRAGMA table_info` guard like the existing `origins` migration (`db.ts` ~L520).
2. **API + form (S).** `searchSchema` in `src/app/api/searches/route.ts` and `/api/v1/searches`: make `depart_date`/`return_date` optional when `date_mode !== 'exact'`. `SearchForm.tsx` / `QuickRouteSearch.tsx`: a two-toggle control ("Exact dates" / "Any dates"), Google-style; `FlightSearchForm` on /explore gets a "Track this route" → any-dates shortcut.
3. **Poller branch (M).** In `pollOne`, when `date_mode !== 'exact'`: price via the cache first (`best_deals_cache` min for the route, optionally restricted to `month_hint`), fall back to `cheapestByMonth()`; write a `fare_snapshots` row with the winning `outbound_depart_iso`/`return_depart_iso` so history, the 7-day median (`median7dForSearch`) and the verdict card work unchanged. Add a `cheapest_by_month_cache` table (route, month, price, dates, refreshed_at, 6 h TTL) so repeated polls don't refetch 12 endpoints.
4. **Alert copy (S).** Email/notifier: "Dates that work" block already lists flex pairs; for any-dates alerts lead with the winning pair and label it "cheapest window found". Reuse `dealBlocks()`/Telegram text as-is.
5. **Dashboard (S).** `/searches` row shows "Any dates" badge instead of the date pair; Route DNA / calendar unchanged (they already work on route, not dates).

Effort: **M** overall (schema S + poller M + UI S). Do not ship without step 3's cache — the 12-call fan-out is the cost driver.

---

## 2. Color-bucket calendar (Hopper + Google)

3–4 price buckets, per-day lowest fare printed in the cell, click-to-filter.

### What exists
- `src/components/FcFareCalendar.tsx`: month grid fed by `best_deals_cache` (`calendarDeals` in `src/app/page.tsx`); `levelFor()` computes **six** levels (`l0`–`l5`) from `threshold` and `maxDisplay` (20 % under target → l5 gold ★; under target → l4; then thirds of the target→max range). CSS `.fc-cal-cell.l0–l5` in `globals.css` L1423–1429, coal overrides L2253+.
- Per-day price is only in the `title` tooltip; the cell shows the day number and a ✦ for mistake fares (< 70 % of target).
- Click = start/end of a date-range selection that deep-links to `/offers` (live search). Legend shows swatches but no $ ranges.
- Route switcher, month ‹ › navigation, and month-over-month delta already work.
- `FareCalendar.tsx` (legacy Tailwind version) exists but the dashboard uses `FcFareCalendar`.

### What is missing
- Bucket semantics are relative to the user's target, not the route's own distribution (Hopper buckets by percentile of the observed range: green ≤ p33, yellow ≤ p66, red above).
- No per-day fare in the cell; no "$ from" in the legend; no click-to-filter of the Best Deals table.

### Plan
1. **Bucketing (S).** In `FcFareCalendar.tsx`, replace `levelFor()` with a quantile bucketer over `filteredDeals` prices: `cheap` (≤ p33), `typical` (≤ p66), `pricey` (> p66), plus `deal` (≤ threshold) and `mistake` (< 70 % of target) as overlays — four visible buckets. Keep the `l0–l5` classes (map new buckets onto them) so no CSS edit is needed; add legend text with the actual $ boundaries (`≤ $612 · ≤ $748 · > $748`).
2. **Per-day fare (S).** Render `$` + rounded price under the day number (`font-size: 8.5px`, mono) when the cell has a price; hide on cells < 28 px via the existing `@media` block. Append a `.fc-cal-price` rule to the end of `globals.css`.
3. **Click-to-filter (M).** First click on a day already sets `selStart`; add a "Filter deals to this day" action that pushes `?outDay=YYYY-MM-DD` — the dashboard already parses `outDay`/`retDay` (`page.tsx` L211–212 `selectedOutboundDay`) and filters `FcBestDealsTable`. Use `router.push` with `scroll: false` to keep the calendar in view. Shift-click keeps today's range-select behaviour.
4. **Google date-grid (L, optional).** Outbound × return matrix over `best_deals_cache` pairs (`flexDateOptions` with a 14-day window is the query). Separate card; only if the month view proves insufficient.

Effort: **S+S+M = M**.

---

## 3. Tiered alert speed (Going)

Free gets deals delayed; Pro gets them within one poll.

### What exists
- `TIER_LIMITS` in `src/lib/db.ts` L608: `free.pollIntervalMin = 30`, `pro = 5`, `enterprise = 1`. It is **only read for `maxRoutes`** (`/api/searches`, `/api/v1/searches`, `farePilotTools.ts`, settings page). `pollIntervalMin` is never consulted.
- `src/lib/cron.ts` `startCron()`: one global `poll_interval_minutes` setting (default 30) drives `pollAll()`, which polls every active search regardless of owner tier.
- `notifyAll()` (`src/lib/notifier.ts`) already gates **channels** by tier (free = email only) and resolves the owner per search — the hook point for delaying is right there.
- `alerts_sent` records `sent_at`; `lastAlertOfKind(searchId, kind, withinHours)` exists for dedupe.
- Mistake-fare detection is spread across: dashboard radar (< 70 % of target), Slack/Telegram bots (≥ 30 % under median), and now the email's `isMistake` flag (either rule).

### What is missing
- No per-tier poll cadence and no alert hold-back for free users; every tier gets the same email within the same poll.
- No queue to release delayed alerts later (the poller is fire-and-forget).

### Plan
1. **Per-search poll cadence (S).** `ALTER TABLE searches ADD COLUMN last_polled_at TEXT`. In `pollAll()`, skip a search when `now − last_polled_at < TIER_LIMITS[ownerTier].pollIntervalMin`; set the cron to the smallest tier interval (5 min) so Pro routes are refreshed every cycle and free routes every 6th. This alone gives Pro "within one poll" freshness without touching alerts.
2. **Alert hold-back queue (M).** New table `alert_queue (id, search_id, fare_snapshot_id, kind, payload_json, release_at, sent_at NULL)`. In `pollOne`, when the owner is free-tier and `kind ∈ {price-drop, mistake}`, enqueue with `release_at = now + FREE_ALERT_DELAY_MIN` (env, default 120) instead of calling `notifyAll`; Pro/enterprise send immediately. A `*/5` cron drains due rows: re-check `latestFare(search_id)` — if the fare is gone or higher, send a "this deal expired" variant or drop it. Threshold alerts stay immediate for everyone (they are the core promise on /pricing).
3. **Copy (S).** Free-tier email footer: "Pro members saw this fare 2 h ago — upgrade for instant alerts" with the `/pricing` link; `/pricing` and FAQ #10 already describe the gating, so wording only.
4. **Mistake fares Pro-first (S).** Same queue: `kind='mistake-fare'` for free users gets `release_at = now + 24 h` (Going's "Elite first" pattern); surface the count in `adminMetrics`.

Effort: **M** (S + M + S + S). Step 1 is independent and worth shipping first.

---

## 4. Booking-options list (Google)

Every OTA/airline with its price, ours with affiliate markers.

### What exists
- `src/components/BookButton.tsx`: dropdown of cross-shop deep links from `crossShopLinks()` (`src/lib/utils.ts`): Aviasales (affiliate, cached fare), Google Flights, Kayak, Skyscanner, Momondo, and EgyptAir-filtered Aviasales on NYC↔CAI. Every link is wrapped in `/go` with `provider` + `surface` and lands in `affiliate_clicks`.
- `src/lib/affiliate.ts`: builders + markers for Hotellook, WayAway, Trip.com, Skyscanner (declined), Booking.com, Expedia; `AFFILIATE_PROVIDERS` list; `/go` host allowlist (`src/app/go/route.ts`) already covers kayak/skyscanner/momondo/google-flights path/trip.com.
- Multi-provider quoting exists server-side: `src/lib/providers/index.ts` fans out to Travelpayouts, Amadeus, SerpAPI, SearchAPI, Duffel, Kiwi (`enabled_providers` setting; default only Travelpayouts). `searchFlights()` flattens to the 25 cheapest offers; each `Offer` carries `provider` and `per_adult_usd`, but only the single cheapest is stored (`fare_snapshots.provider`).

### What is missing
- The dropdown shows names, not prices — it is a "compare elsewhere" list, not Google's "booking options" list.
- Non-Aviasales flight partners have no affiliate ID (Skyscanner declined; Kayak/Momondo/Google are plain links), so a priced list would be mostly unmonetised rows.
- No per-provider price persistence, so nothing to show on cached routes without a live search.

### Plan
1. **Persist per-provider quotes (S).** In `pollOne`, after `searchFlights()`, keep the cheapest offer **per provider** (`Map<provider, Offer>`) and store as `fare_snapshots.raw_json.providers[]` (no schema change — `raw_json` is already free-form). Cap at 6 entries.
2. **Booking-options endpoint (S).** `GET /api/fares/[snapshotId]/options` → `[{ provider, label, per_adult_usd, total_party_usd, bookUrl (/go), affiliate: boolean }]`, merging the stored quotes with `crossShopLinks()` for providers that have no quote (price `null`, shown as "check price").
3. **UI (M).** Extend `BookButton` with an optional `snapshotId`; when present, fetch the options on open and render rows as `provider · $price · [Book]`, cheapest first, affiliate rows tagged with a ✦ and listed first among ties. Keep today's name-only rows as the fallback so nothing regresses on /explore where there is no snapshot.
4. **Monetisation (M, external).** Enable WayAway (already has a builder in `affiliate.ts`) and Trip.com as priced rows once their flight deep-link formats are wired into `crossShopLinks()`; Kiwi via Tequila affiliate ID if the provider is enabled. Track conversion per provider in the existing `affiliate_clicks`/`monthlyAffiliateStats`.

Effort: **M** (S + S + M; step 4 depends on partner approvals). Enabling a second quoting provider in `enabled_providers` is a prerequisite for the list to have more than one price.

---

## Suggested order

1. Tiered poll cadence (3.1) — S, zero UI, immediately differentiates Pro.
2. Calendar buckets + per-day fare (2.1–2.2) — S, visible on the dashboard.
3. Per-provider quote persistence (4.1–4.2) — S, unlocks the booking list.
4. "Any dates" alerts (1) — M, needs the schema + cache work.
5. Alert hold-back queue (3.2) and booking-options UI (4.3) — M each.

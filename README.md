# EgyptAir Cheap Flights Tracker

Personal web app that polls the **Amadeus Self-Service API** for **nonstop EgyptAir** round-trips between **JFK / EWR ↔ CAI** for **4 adults + 1 infant**, stores fare history in SQLite, and **emails you** when a fare drops below your threshold (default $900/adult).

Every data view is presented as a **formatted table + pie chart**.

## Quick start (local)

```bash
nvm use 22                     # or any Node ≥ 20.9
npm install
cp .env.example .env.local     # fill in AMADEUS_* + RESEND_*
npm run dev                    # http://localhost:3000
```

You'll need:

1. **Amadeus** account — https://developers.amadeus.com → register an app → copy `API Key` & `API Secret` into `.env.local`. Free tier = 2,000 calls/month, real airline data.
2. **Resend** account — https://resend.com → API key. Default `from` is `onboarding@resend.dev` (works for testing without verifying a domain).

## Routes

- `/` — Dashboard: table of current cheapest fares per active search, pie chart by origin (JFK vs EWR), pie chart of cost breakdown, 30-day price-history chart per search.
- `/searches` — Add / pause / delete searches. Pie chart of API-call usage per search this month.
- `/settings` — Threshold, alert email, poll cadence. Pie chart of monthly Amadeus quota (used vs remaining). Table of recent alerts sent.

## API

| Method | Path | Purpose |
|---|---|---|
| GET / POST | `/api/searches` | List / add a search |
| PATCH / DELETE | `/api/searches/:id` | Pause/resume / delete |
| GET / PUT | `/api/settings` | Read / update settings |
| POST | `/api/poll` | Force a poll of all active searches |
| POST | `/api/poll?search_id=N` | Force a poll of one search |

## How polling works

`src/lib/cron.ts` schedules `pollAll()` every N minutes (default 30, configurable). Each cycle:

1. Loads active searches from SQLite.
2. For each, calls Amadeus `GET /v2/shopping/flight-offers` with `nonStop=true`, `includedAirlineCodes=MS`, `currencyCode=USD`, `adults=4`, `infants=1`.
3. Picks the cheapest offer, writes a `fare_snapshots` row.
4. If `price_per_adult < threshold` AND lower than the last alert sent for that search → emails you and writes an `alerts_sent` row (so you don't get spammed at the same price).
5. Logs the call in `api_calls` for the quota chart.

## Deploy to Debian 13

See `deploy/setup.sh` — run as root on the fresh box. It installs Node 22 + Caddy + UFW, creates a non-root `egyflights` user, and prints the remaining manual steps (rsync code, fill `.env.local`, install the systemd unit, configure Caddy hostname, harden SSH).

⚠️ **Rotate the root password before deploying** — change it via `passwd root` and disable password SSH (`PasswordAuthentication no` in `/etc/ssh/sshd_config`).

## Files

```
src/
  app/
    layout.tsx              header + nav
    page.tsx                Dashboard
    searches/page.tsx       Search management
    settings/page.tsx       Settings + quota chart + alerts log
    api/
      searches/route.ts     GET/POST searches
      searches/[id]/route.ts PATCH/DELETE
      settings/route.ts     GET/PUT settings (restarts cron on cadence change)
      poll/route.ts         POST manual poll
  components/
    charts.tsx              <PieCard>, <PriceHistory>
    SearchForm.tsx          add-search form
    SearchActions.tsx       pause/delete buttons
    SettingsForm.tsx        settings form
    PollNowButton.tsx       manual poll button
  lib/
    db.ts                   better-sqlite3 + migrations + typed queries
    amadeus.ts              OAuth + flight-offers wrapper
    poller.ts               one polling cycle
    email.ts                Resend alert template
    cron.ts                 node-cron registration
    dashboard-data.ts       server-side dashboard query
    utils.ts                fmt helpers + chart palette
  instrumentation.ts        Next.js boot hook → starts cron
deploy/
  setup.sh                  Debian 13 bootstrap
  egyptair.service          systemd unit
  Caddyfile                 reverse proxy + auto-HTTPS
data/
  fares.db                  SQLite (gitignored)
```

## What this app does NOT do

- It does not **book** flights — it shows the fare and flight numbers; you book on egyptair.com.
- It does not include connecting flights — `nonStop=true` filter only.
- It does not authenticate users — assumes single-user, deployed on a private host. Add HTTP basic auth at the Caddy layer if you want to expose it publicly.

# FlyCheap

[![pipeline status](https://gitlab.com/mirotech94/flycheap-tracker/badges/main/pipeline.svg)](https://gitlab.com/mirotech94/flycheap-tracker/-/commits/main)

Fare intelligence for flights. FlyCheap watches 1,000+ airlines on the routes you care about, records every price it sees, and alerts you the moment a fare drops below your target or looks anomalous — with a buy-or-wait verdict grounded in that route's own history.

Production app package name: `egyptair-tracker` (historical). Current brand: **FlyCheap**.

## What it does

- **Route tracking** — add a route, a date window, and a per-adult target price. Four providers are polled on a schedule; the cheapest round-trip is recorded every cycle.
- **Smart alerts** — threshold crossings and statistical anomalies (e.g. a fare ≥ 3σ below the 30-day mean, a "mistake fare") are scored against the route's own history and delivered by email, SMS, WhatsApp or Telegram.
- **Buy / wait verdicts** — percentile position, 14-day trend slope, and a confidence score, so a wrong call costs a click, not a trip.
- **Explore & Offers** — cheapest fares to every reachable destination, a fare heat-map calendar, hotels and stays, and an interactive map.
- **AI concierge (FarePilot)** — ask in plain English ("cheapest two weeks to Rome in October under $600") and get real numbers.

## Stack

- **Next.js 16** (App Router) on Node, `next start` — React 19
- **better-sqlite3** — single-file SQLite database (`data/fares.db`)
- **node-cron** in-process schedulers for polling, digests, and the agent pipeline
- **Caddy** reverse proxy with automatic TLS and a strict CSP
- **systemd** service (`egyptair`) + timers for the job runner
- **Resend** (email), **Stripe** + **PayPal** (billing), **MapLibre GL** (maps)
- **Zod** for input validation; **Vitest** for tests

## Architecture: three front doors

Hostnames are env-driven (`src/lib/hosts.ts`); the middleware routes by host:

| Host | Role |
|------|------|
| `flycheap.live` / `www` | Marketing front door — the apex serves the **early-access** signup page |
| `my.flycheap.live` | Client portal — the app itself |
| `admin.flycheap.live` | Owner admin portal |

The legacy host `flycheap.18dn.com` still serves during the cutover.

## The AI layer

- **Multi-provider failover registry** (`src/lib/ai/providers.ts`): Groq (free, primary) → Cloudflare Workers AI → OpenRouter → Google Gemini → Anthropic → Ollama, all via OpenAI-compatible endpoints, each dormant until its key is set. Groq's token cap is per-model, so multiple Groq models are tried before any paid provider. `DEPLOY`-safe: see `groqChat` / `groqClient` for the daily-cap and rate-limit handling.
- **Agent pipeline** (`src/agents/**`): curator, verifier, insights, social-poster, storyteller, digest — run as systemd timers, DRY-run by default, with guards against invented numbers.
- **Slack ops agent** (`src/lib/ops/**`): watches production, posts incidents to Slack, and can run safe fixes; gated tools require approval.
- **FarePilot admin operator** (`src/app/api/admin/farepilot/route.ts` + `src/lib/farePilotLoop.ts`): owner-only SQL + shell over production, owner + admin-host + same-origin gated, per-owner rate limit, audit-before-execute, and an optional TOTP step-up (`FAREPILOT_REQUIRE_STEPUP=1`). Provider failover resumes a rate-limited turn on the next model without re-running tools.

## Pricing & trial

Free / Pro ($9/mo) / Enterprise ($39/mo). Every new account gets a **3-month free trial of the entire product** (all Pro and Enterprise features, no card) via the early-access flow; near the end you continue by contacting the owner, otherwise it rolls to Free.

## Mobile

An Expo native app (`ios-app/`, `docs/mobile-app/`) runs over the web app as a headless JSON API under `/api/v1/**` (auth, searches, plans, ai-providers, onboarded, chat). TestFlight builds depend on those endpoints.

## Project structure

```
src/
  app/            App Router pages + API routes (api/v1/** = mobile API)
  agents/         AI content pipeline (curator/verifier/insights/…)
  lib/            core: db, auth, hosts, ai/providers, ops/**, farePilotLoop, …
  components/     UI
deploy/           deploy.sh + Caddyfile + sudoers
scripts/          job runner + maintenance
data/             SQLite DB (gitignored)
docs/             design specs, agents, mobile-app, superpowers
ios-app/          Expo mobile app
```

## Develop

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # vitest
npm run build      # production build
```

Secrets live in `.env.local` (never committed — see `.env.example`).

## Deploy (operations)

**The production server is not a git checkout** (git isn't installed there). Files are shipped as committed blobs and built in place. Deploys are hardened after a run of incidents:

- **Single deploy owner** — only the owner session runs `deploy.sh`; every other session commits and hands off the SHA. Enforced by a token whose SHA-256 lives in `.deploy-owner-hash` on the box.
- **Serialized + gated** — a `flock` serializes concurrent deploys, and `next.config.js` refuses any `next build` not launched under the lock (`DEPLOY_LOCK_HELD`).
- **Safe health checks** — `deploy.sh` health-checks through a real `Host` header on an app-router route, verifies build completeness (BUILD_ID + client manifests) before restart, auto-rolls-back on failure, and enforces a 60s cooldown between deploys.
- **Reconcile before shipping** — because the box diverges from git, `prod-original` must be reconciled against the server before it's a trustworthy mirror.

Deploy: `DEPLOY_OWNER_TOKEN=… bash deploy/deploy.sh` (run by the deploy owner only).

## Repo

Private on GitLab: `gitlab.com/mirotech94/flycheap-tracker`. Push with `git push gitlab prod-original:main`.

---

Operated by Myron Mekhael, New York.

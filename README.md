# FlyCheap

A self-hosted flight-price tracker. Watch the routes you care about, record
every price seen, and get told when a fare drops below your target or looks
anomalous — with a buy-or-wait verdict grounded in that route's own history.

**Free and open source (MIT). No plans, no payment processor, no ads, and no
affiliate commission.** It is not a service being sold and it is not monetised
at all — booking links are plain links to the airline or travel site, with
nothing appended. Every feature is on for everyone, and if the hosted instance
ever disappears, your copy keeps working.

Package name is `egyptair-tracker` for historical reasons.

## Run your own

```bash
git clone <this repo> flycheap && cd flycheap
cp .env.example .env.local     # the only required key is a fare provider
npm install
npm run dev                    # http://localhost:3000
```

SQLite is the whole database — one file at `data/fares.db`, created on first
run. There is nothing else to provision.

## What it does

- **Route tracking** — add a route, a date window, and a per-adult target price. Four providers are polled on a schedule; the cheapest round-trip is recorded every cycle.
- **Smart alerts** — threshold crossings and statistical anomalies (e.g. a fare ≥ 3σ below the 30-day mean, a "mistake fare") are scored against the route's own history and delivered by email or Telegram.
- **Buy / wait verdicts** — percentile position, 14-day trend slope, and a confidence score, so a wrong call costs a click, not a trip.
- **Explore & Offers** — cheapest fares to every reachable destination, a fare heat-map calendar, hotels and stays, and an interactive map.
- **AI concierge (FarePilot)** — ask in plain English ("cheapest two weeks to Rome in October under $600") and get real numbers.

## Stack

- **Next.js 16** (App Router) on Node, `next start` — React 19
- **better-sqlite3** — single-file SQLite database (`data/fares.db`)
- **node-cron** in-process schedulers for polling, digests, and the agent pipeline
- **Caddy** reverse proxy with automatic TLS and a strict CSP
- **systemd** service (`egyptair`) + timers for the job runner
- **Resend** (email), **MapLibre GL** (maps)
- **Zod** for input validation; **Vitest** for tests

## Architecture: three front doors

Hostnames are env-driven (`src/lib/hosts.ts`); the middleware routes by host:

| Host | Role |
|------|------|
| `flycheap.live` / `www` | Marketing front door — the apex serves the **early-access** signup page |
| `my.flycheap.live` | Client portal — the app itself |
| `admin.flycheap.live` | Owner admin portal |

The legacy host `flycheap.18dn.com` is retired: Caddy answers it with a permanent redirect to the `.live` equivalent, so old magic links and bookmarks still land. It is not served.

## The AI layer

- **Multi-provider failover registry** (`src/lib/ai/providers.ts`): Groq (free, primary) → Cloudflare Workers AI → OpenRouter → Google Gemini → Anthropic → Ollama, all via OpenAI-compatible endpoints, each dormant until its key is set. Groq's token cap is per-model, so multiple Groq models are tried before any paid provider. `DEPLOY`-safe: see `groqChat` / `groqClient` for the daily-cap and rate-limit handling.
- **Agent pipeline** (`src/agents/**`): curator, verifier, insights, social-poster, storyteller, digest — run as systemd timers, DRY-run by default, with guards against invented numbers.
- **Slack ops agent** (`src/lib/ops/**`): watches production, posts incidents to Slack, and can run safe fixes; gated tools require approval.
- **FarePilot admin operator** (`src/app/api/admin/farepilot/route.ts` + `src/lib/farePilotLoop.ts`): owner-only, read-only SQL (SELECT only, on a read-only connection) and a fixed allowlist of named ops commands (no shell), owner + admin-host + same-origin gated, per-owner rate limit, audit-before-execute, and a TOTP step-up enforced whenever an authenticator is configured (`OWNER_TOTP_SECRET` or owner 2FA; `FAREPILOT_REQUIRE_STEPUP=0` opts out). Provider failover resumes a rate-limited turn on the next model without re-running tools.

## No pricing

There are no plans. `TIER_LIMITS` resolves every tier name to one unlimited
record, so an account's stored tier — including `free` or `pro` from a database
older than the open-source change — makes no difference to what it can do.

If you fork this and want to meter it, that map is the single place to do it.

## Mobile

An Expo native app (`ios-app/`, `docs/mobile-app/`) runs over the web app as a headless JSON API under `/api/v1/**` (auth, searches, ai-providers, onboarded, chat). TestFlight builds depend on those endpoints.

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

Deploy: `DEPLOY_OWNER_TOKEN=… /usr/local/sbin/flycheap-deploy` (run by the deploy owner only). That is the root-owned copy of `deploy/deploy.sh` that `setup.sh` installs; the script refuses to run from inside `/opt/egyptair-tracker`, which the app user owns. After changing `deploy/*.sh`, copy the new version there from a trusted checkout (e.g. `scp deploy/deploy.sh root@<host>:/usr/local/sbin/flycheap-deploy`), never from the app-owned tree on the server.

## Contributing

`main` is protected and **merge-request-only** — direct pushes are rejected, and a merge request cannot merge until its CI pipeline (the Vitest suite) passes. **Approvals are optional** (a review signal, not a merge blocker on the Free tier), and self-approval is allowed. To land a change:

```bash
git push gitlab HEAD:my-change     # push a feature branch
glab mr create --fill              # open a merge request into main
# CI runs automatically; the MR merges only once it's green
glab mr approve                    # optional — record a review before merging
glab mr merge
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the full guide (setup, commit style, tests).

## Repo

Private on GitLab: `gitlab.com/mirotech94/flycheap-tracker`.

---

Operated by Myron Mekhael, New York.

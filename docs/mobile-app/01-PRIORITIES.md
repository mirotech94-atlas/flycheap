# FlyCheap Mobile App — Organized Priorities & Critical Path

> Companion to [`00-PLAN.md`](./00-PLAN.md). This file is the "what's going on / what's first"
> reorganization. The plan describes *the whole thing*; this describes *the order to do it in*
> and *what blocks what*. Last organized: 2026-06-13.

---

## 🔒 Locked decisions (2026-06-13)
1. **Repo strategy: monorepo** — the Expo app lives inside the existing `egyptair-tracker`
   codebase (shares the API-contract TypeScript types directly). Likely at `mobile/` or
   `apps/mobile/` with the web app; layout to be finalized at scaffold time.
2. **Apple Developer account: already owned** — no enrollment lag. EAS/APNs wire-up proceeds
   when we reach push (Tier 5) and build (Tier 7). (Tier 0.1 calendar risk is **removed**.)
3. **First build task: Backend `/api/v1` (Tier 1)** — start here, reusing existing route query logic.
4. **Mobile session model: fixed 90-day Bearer token** (deviation from plan's refresh-token default).
   Reuses the existing `sessions` table (opaque token, server-enforced `expires_at`). No refresh token in
   v1 — re-login on expiry. `getSession` already enforces expiry; there is no extend/touch primitive, so
   sliding expiry would require token rotation per request (rejected). `verify` → `{ token, expiresAt, user }`.

### Auth-slice build contract (Tier 1, first unit — keep all changes ADDITIVE)
- New `apiAuthBearer(req)` helper: `Authorization: Bearer <token>` → `queries.getSession` → user; cookie
  fallback to existing `getCurrentUser`. **Do not modify** the web cookie path or the existing `/api/auth/verify` GET.
- New non-cookie `consumeMagicLink…` variant that returns `{ token, expiresAt, user }` (90-day session) without setting a cookie.
- Parameterize `sendMagicLink(email, baseUrl, mode)` so the mobile link targets the universal-link path
  (`/m/verify?token=`) with a `flycheap://verify?token=` fallback button — don't fork the email HTML.
- Web-side `/m/verify` page (app-not-installed fallback) + `/.well-known/apple-app-site-association` +
  `/.well-known/assetlinks.json` (Android SHA-256 lands after first EAS build). These ship WITH the auth slice.
- Test full login → bearer → authed GET locally (local sqlite) BEFORE deploying to the VM.
- **Defer** the `devices` table (→ Tier 5 push) and `book-url` marker test (→ Tier 3 booking) — not part of auth slice.

---

## TL;DR — the one paragraph

Build an **Expo (React Native) native app** that treats the existing Next.js web app
(`flycheap.18dn.com`, repo = `egyptair-tracker`) as a **headless JSON API**. We do **not**
rebuild the backend or the poller. The mobile app's reason to exist is **native push alerts**
when a tracked fare crosses threshold — that's the killer feature, and it has the longest lead
time because it needs a paid Apple Developer account + APNs. So we start the slow-to-provision
things on day one, build the cheap/fast foundation (backend `/api/v1` + app shell + auth) first,
and leave push for the middle of the project once the account is live.

---

## The landscape (verified 2026-06-13)

| Thing | Where | State |
|---|---|---|
| Web app (Next.js) | local `…/Egyptair Cheap Flights Project`, package `egyptair-tracker` | Live. **Not git-initialized locally.** |
| Production deploy | VM `flycheap.18dn.com` → `/opt/egyptair-tracker/` | Live, SSH OK. |
| Existing API routes | `src/app/api/` | `auth, searches, settings, offers, me, best-deals, route-dna, …` exist. **No `/api/v1/*` yet.** |
| Mobile app | — | **Does not exist yet.** No `flycheap-app` repo. |

The mobile plan's `/api/v1/*` contract (§4) is mostly a **thin re-expose of routes that already
exist** (auth, searches, settings, offers). That's good news — the backend work is "wrap & shape,"
not "build from scratch."

---

## Build status
- **2026-06-13 — Auth slice DEPLOYED to prod ✓.** `deploy.sh` green (HTTP 200, no rollback). Live checks on
  `flycheap.18dn.com`: `/api/v1/me` 401 without bearer ✓, AASA served `application/json` w/ appID
  `L3NFNQPS55.Miro.k9.flycheap` ✓, `/.well-known/assetlinks.json` ✓ (SHA placeholder), `/m/verify` 200 ✓,
  `request-link` 400 on bad body ✓, web `/login` 200 (no regression) ✓. NOTE: VM `next.config.js` had a
  `typescript.ignoreBuildErrors` block my local lacked — MERGED (local now matches), did not clobber.
- **2026-06-13 — ASC app record created** (by Miro). TestFlight internal group "FlyCheap" + 1 tester
  (myronmekhael5@gmail.com), "No Builds Available" (expected — no build uploaded yet). Apple Dev license
  agreement update pending acceptance (blocks new-app *submission* until accepted). **ASC Apple ID: TODO (ask Miro).**
- **2026-06-13 — Tier 2 Phase 0+1 BUILT** at `mobile/` (monorepo subdir; local-only, never deployed to VM).
  Expo SDK **56.0.11** / expo-router 56 / RN 0.85 / React 19. Stack installed: NativeWind 4.2.5 (+tailwind 3.4.17),
  TanStack Query 5, zod 4, expo-secure-store/notifications/web-browser/linking, react-native-webview, @expo/vector-icons.
  `app.config.ts`: name FlyCheap, scheme `flycheap`, iOS `Miro.k9.flycheap` + `applinks:flycheap.18dn.com`,
  Android `com.flycheap.app` + /m/* intent filter. `eas.json` dev/preview/production. NativeWind wired
  (babel/metro/tailwind/global.css, navy+gold theme). Foundation: `src/lib/config.ts`, `src/api/{client,auth,schemas}.ts`
  (bearer + zod boundary), `src/auth/{storage,AuthProvider,VerifyScreen}.tsx` (secure-store, useAuth, bootstrap).
  Routes: `_layout` (Query+Auth providers + auth gate), `(auth)/login`, `verify` + `m/verify` (both → VerifyScreen),
  `(tabs)/{index=Dashboard,explore,offers,searches,settings}`. Dashboard calls `/api/v1/me`. Demo template files removed.
  Typecheck CLEAN (0 errors); iOS Hermes bundle compiles via `expo export` ✓.
  **Auth-gate bug fixed (advisor catch):** verify routes have segment `verify`/`m`, not `(auth)`, so the post-sign-in
  redirect must trigger on ANY public segment (`token && onPublic → /(tabs)`), else the user hangs on "Signing you in…".
  **Local-env gotchas:** `~/.npm` root-owned → `mobile/.npmrc` sets cache=/tmp/flycheap-npmcache;
  better-sqlite3 rebuilt for Node 20. **Pending:** `eas init` (Expo login → projectId), run on device to test login→dashboard, assetlinks SHA after first build.
- **2026-06-13 — Auth slice BUILT + tested locally.** Additive only; web cookie flow untouched.
  Files: `src/lib/mobileAuth.ts` (bearer helper + 90-day non-cookie consume), `src/lib/auth.ts` (`sendMagicLink`
  gains a `mode` opt), `src/app/api/v1/auth/{request-link,verify}/route.ts`, `src/app/api/v1/me/route.ts`,
  `src/app/m/verify/page.tsx`, `src/app/api/{aasa,assetlinks}/route.ts` + `next.config.js` rewrites for `.well-known`.
  Local test (sqlite): verify→bearer→`/api/v1/me` ✓, no-bearer 401 ✓, single-use 401 ✓, invalid-token 401 ✓,
  AASA served as `application/json` with appID `L3NFNQPS55.Miro.k9.flycheap` ✓, assetlinks ✓ (SHA placeholder), `/m/verify` ✓.
  Typecheck clean (24 pre-existing errors elsewhere, none in new files). **Next:** deploy to VM, then Tier 2 scaffold.

## Design upgrade + fixes (2026-06-13, post-first-build feedback)
- **Design system applied** (via /frontend-design, aligned to canonical web brand): fonts **Instrument Serif**
  (display), **Manrope** (body, 4 weights), **JetBrains Mono** (figures) via @expo-google-fonts + expo-font;
  **expo-linear-gradient** for navy hero gradients; ivory `#f7f5f0` canvas; layered shadows; refined KPI/Offer cards,
  gradient Login + Dashboard/Profile heroes, polished tab bar. Typecheck clean. (Native rebuild needed to preview —
  linear-gradient is a native module.)
- **Double tab bar FIXED:** the bottom row was the *web app's* `MobileBottomNav` rendering inside the Explore WebView.
  Added `?embed=1` chrome-less mode web-side (`ClientChrome.useIsEmbed()` hides nav/footer/widgets + `HideOnEmbed`
  wraps FcTweaks; `AdminAwareMain` goes edge-to-edge). The app already loads `/explore?embed=1`. **Deployed to prod ✓
  and VERIFIED in simulator** — Explore now shows only the native tab bar.
- **401 auto-logout added:** `client.ts` `setOnUnauthorized` → AuthProvider clears session on any authed 401, so an
  expired/revoked session routes to login instead of sticking on an "unauthenticated" error (caught when the cleaned-up
  simdemo session 401'd).
- **REDESIGN VERIFIED in simulator (signed in as real account mirotech94, enterprise, 19 routes / 185k fares):**
  Dashboard hero "185,483 Total flights tracked" (gold mono on navy gradient), KPI cards, real routes; rebuilt natively
  from `/tmp/fcbuild` (linear-gradient is a native module → needs rebuild, not just JS reload).
- **Wrong account in demo:** the simulator showed `simdemo@example.com` because that was my test session — not a bug;
  signing in as the real account shows real data.
- **TestFlight "app gone":** Apple-side, can't inspect their ASC. Likely a filter (Apps → set All Statuses/All Types)
  or the record was removed; an app with no uploaded build won't show in the phone's TestFlight app (only ASC web).

## Build status — Tiers 3–6 (2026-06-13)
- **Backend Tiers 3/4/5 DEPLOYED to prod ✓.** New `/api/v1`: `dashboard` (incl. **totalFlights** KPI via
  `countFareSnapshotsForUser`), `fares`, `offers`, `searches` (GET/POST) + `searches/[id]` (PATCH/DELETE, owner-scoped),
  `settings` (GET/PATCH per-user threshold+push+quiet-hours), `book-url`, `devices` (POST) + `devices/[token]` (DELETE).
  New lib: `bookUrl.ts` (canonical /go builder), `expoPush.ts` (Expo push + quiet-hours). db.ts: `push_devices` table +
  device/fare-count queries. affiliate.ts: `mobile-app` surface. notifier.ts: push hook in `notifyAll` (respects
  push_enabled + quiet hours, `data` deep-links to fare). **Marker integrity VERIFIED on prod** (`marker=727998` on /go).
  All endpoints smoke-tested live; web untouched. Modified files diffed vs VM before deploy (only my edits) — no clobber.
- **Mobile Tiers 3–6 BUILT.** API: `schemas.ts` (all v1 zod), `endpoints.ts` (typed fns), `lib/booking.ts`,
  `notifications/{push,PushManager}.ts(x)`. Screens (NativeWind, navy/gold): tabs = **Dashboard** (Total-flights hero +
  KPIs + routes), **Offers** (native list + in-app Book), **Searches** (CRUD + FAB + pause/delete), **Explore** (WebView
  `/explore?embed=1`), **Profile** (avatar, total flights, → Pricing/Notifications/Help, **Sign out**). Stack screens:
  `search/new` (create form), `fare/[id]` (detail + Book; push deep-link target), `pricing` (Free/Pro + upgrade),
  `help` (FAQ + mailto), `notifications` (threshold/push/quiet-hours). Root layout = Stack over Tabs. Typecheck CLEAN;
  iOS Hermes bundle compiles (4.8MB).
- **FIRST BUILD RAN ✓ — app compiled + launched in iOS simulator (iPhone 17, iOS 26.5).** Verified end-to-end:
  magic-link sign-in via `flycheap://verify` deep link → Dashboard (Total-flights hero), Offers (live JFK→IAD deals
  $284–307 with Book), Profile (Pricing/Notifications/Help/Sign out), Pricing screen — all render in navy/gold.
  **KEY ENV FINDING:** spaces in the repo path (`AI Projects/Egyptair Cheap Flights Project`) break RN 0.85's native
  build (`pod install` artifact extraction fails). Workaround proven: build from a space-free copy (`cp -R mobile /tmp/fcbuild`).
  → For TestFlight, recommend **EAS cloud build** (immune to spaces, needs `eas login`) OR relocate `mobile/` to a
  space-free path for local Xcode. The signed/distributable build needs Miro's Apple/Expo login regardless.
- **First build: native iOS project generated** (`expo prebuild`). Verified bundle `Miro.k9.flycheap`, entitlements
  `aps-environment` + `applinks:flycheap.18dn.com`, scheme `flycheap`. **Signed TestFlight build needs Miro's Apple/Expo
  login** (can't be automated) — flow: `pod install` → open `ios/FlyCheap.xcworkspace` → Xcode auto-signs (team L3NFNQPS55)
  → Archive → Transporter. (EXPO-side `eas build` alt also needs `eas login`.)

## Priority tiers (do them in this order)

### ⏱️ Tier 0 — Start the long-lead clocks NOW (provisioning, not code)
These take real-world calendar time (days), so kick them off before writing app code.
1. **Apple Developer Program enrollment ($99/yr).** Required for *any* iOS build **and** for APNs
   push (Tier 5). Approval can take 24–48h+. **This is the single biggest schedule risk — start it first.**
2. **Repo decision** (separate `flycheap-app` vs monorepo) — needed before scaffolding. See Q&A.
3. Google Play account ($25 one-time) — only needed when we submit Android; can defer (Path B).

### 🧱 Tier 1 — Backend API contract (foundation, blocks the whole app)
The app is inert without this. Add to the **existing Next.js repo** as `/api/v1/*` route handlers,
**reusing existing query logic** — do not duplicate.
- `POST /api/v1/auth/request-link`, `POST /api/v1/auth/verify` (mobile-aware magic link).
- `GET /api/v1/dashboard`, `GET /api/v1/fares`, `GET /api/v1/offers`.
- `GET/POST/PATCH/DELETE /api/v1/searches[/:id]`.
- `GET/PATCH /api/v1/settings`.
- `POST /api/v1/devices`, `DELETE /api/v1/devices/:token` (push-token registry — new table).
- `GET /api/v1/book-url` — **single source of truth for affiliate links.**
- **Revenue guard:** automated test asserting every booking URL carries the Travelpayouts `marker`.
  (We've been bitten by missing markers before — this is non-negotiable.)
- Host `/.well-known/apple-app-site-association` + `/.well-known/assetlinks.json` (Android SHA-256
  lands after first EAS build, so AASA first, assetlinks mid-project).

### 📱 Tier 2 — App scaffold + auth  (plan Phase 0 + 1)
- `create-expo-app` (SDK 56, expo-router TS), install the pinned stack (§3).
- `app.config.ts`: both `flycheap://` scheme **and** universal-link domains; iOS+Android bundle IDs.
- EAS project + `eas.json` (dev/preview/production).
- Typed API client (`src/api/client.ts`) + Zod schemas.
- Magic-link login → deep-link `verify` → secure token storage → auth gate.
- **Gate / demo:** log in on a real device, land on Dashboard.

### 📊 Tier 3 — Core read screens + booking  (plan Phase 2)
- Dashboard (KPI cards + best-fares), Offers (mistake-fare radar), Fare detail.
- Booking flow: `/api/v1/book-url` → in-app browser, **marker preserved** (never build URLs client-side).
- React Query caching, pull-to-refresh, skeletons.

### ✍️ Tier 4 — Searches CRUD  (plan Phase 3)
- List / create / edit / delete watches with optimistic updates.
- Airport autocomplete (reuse backend airport list / static IATA dataset).

### 🔔 Tier 5 — Push notifications  (plan Phase 4) — **KILLER FEATURE, gated on Tier 0.1**
- `registerForPush()` → `POST /api/v1/devices`.
- Extend the **existing poller** (server-side): on threshold-cross / new mistake-fare, look up device
  tokens, POST to Expo Push API. Respect notification prefs (quiet hours, per-route mute).
- Tap → deep-link to fare (foreground / background / cold-start all handled).
- **The app never polls client-side** — all polling stays server-side. Guard against that scope creep.

### 🎨 Tier 6 — Explore (WebView) + Settings + polish  (plan Phase 5)
- Web side: add `?embed=1` chrome-less mode (hides nav/footer/sign-in) + accept token/theme.
- Settings screen, empty/error states, offline banner, icon + splash.

### 🚀 Tier 7 — Build & submit  (plan Phase 6)
- Path A (both stores at once) or Path B (iOS-first, Android later) — decided at submission, not in code.
- TestFlight / Play internal first, then production. Accurate privacy labels (email, push token, affiliate clicks).

---

## Critical-path view (what actually gates the timeline)

```
Tier 0.1 Apple Dev acct ───────────────(days lag)──────────────┐
                                                               ▼
Tier 1 Backend /api/v1 ──► Tier 2 Scaffold+Auth ──► Tier 3 Read+Book ──► Tier 4 CRUD ──► Tier 5 PUSH ──► Tier 6 Polish ──► Tier 7 Ship
                                                                            (Push also needs server poller change + device table from Tier 1)
```
- **Backend (Tier 1) is the true foundation** — nothing in the app renders without it. The plan folds
  backend into each phase; I'm calling it out as the first build task so it isn't an afterthought.
- **Push (the reason to ship at all) has two long dependencies:** the Apple account (calendar) and the
  poller change (code). Start the account in Tier 0; the poller change rides along in Tier 5.

## iOS / Apple identity (from `02-APPLE-DEVELOPER-HANDOFF.md`, locked 2026-06-13)
- **App name:** FlyCheap.
- **Apple Developer Team ID:** `L3NFNQPS55` — **reuse this team; do NOT open a new membership.**
- **iOS bundle ID:** `Miro.k9.flycheap` (permanent once first TestFlight upload lands). Namespace `Miro.k9.*`.
- **Universal-link appID (AASA):** `L3NFNQPS55.Miro.k9.flycheap`.
- **Android package:** `com.flycheap.app` (working default; finalize at scaffold — assetlinks SHA-256 comes from first build).
- **Signing:** Automatic (resolves to `L3NFNQPS55` with the right Apple ID in Xcode).
- **Submit/upload (Tier 7):** GUI flow — `eas build` → IPA → **Transporter / Xcode Organizer** (matches existing K9 Pulse flow,
  **no new App Store Connect API key needed**). Optional: wire EAS Submit with an ASC API key later for hands-off submits.
- **New ASC app record** required (don't reuse K9 Pulse `Miro.k9.attendance` / Apple ID `6773598689`). ASC Apple ID auto-assigned — record it when created.
- K9 Pulse is Capacitor — **reference only**, not our stack (we're Expo).

## Design / brand
Reuse the canonical FlyCheap design system (navy `#0a3a6b`, gold `#d4af37`) so the native app matches web.
Primary color is locked to `#0a3a6b` per the kickoff prompt.

## Non-negotiables (carry these through every tier)
1. **Never construct Aviasales/Travelpayouts URLs in the app** — always `/api/v1/book-url`; marker must survive.
2. **No client-side polling** — push + refetch-on-open only.
3. **Do not touch** the admin portal (`admin.flycheap.18dn.com`) or the poller's core logic (only *extend* it for push).
4. **Reuse existing backend query logic** for `/api/v1/*`; don't fork it.

## Rough estimate
~12–16 focused dev-days for v1 across both platforms (per plan §7), **plus** Apple-account approval lag.

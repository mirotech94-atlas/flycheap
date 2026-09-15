# FlyCheap Mobile App — Build Plan & Claude Code Handoff

> **Target:** Native iOS + Android app for the existing FlyCheap flight-price tracker (`flycheap.18dn.com`).
> **Author hand-off to:** Claude Code.
> **Existing stack:** Next.js web app (Travelpayouts/Aviasales affiliate, 30-min background poller, magic-link auth, admin portal at `admin.flycheap.18dn.com`).
> **Toolchain pinned:** Expo SDK 56 / expo-router 56 / React Native New Architecture (current as of June 2026).

---

## 0. TL;DR for the implementer

Build an **Expo (React Native) app** that talks to the **existing Next.js backend as a JSON API**. Do **not** rebuild the backend. The web app stays the source of truth for polling, affiliate links, and data; the mobile app is a native client plus the thing the web can't do well: **push notifications when a tracked fare crosses threshold**.

Three things make this app worth shipping over the existing PWA:
1. **Native push** on threshold-cross / mistake-fare alerts (the killer feature).
2. **Native watch management** (add/edit/delete route watches, set thresholds) with offline-friendly caching.
3. **Instant deep-link booking** that preserves Travelpayouts affiliate markers (revenue integrity).

Heavy data-viz screens that already exist on the web (route-DNA pattern card, fare-calendar heatmap, carbon ledger, network arc map) are rendered through a **hardened WebView** in v1 rather than rebuilt natively — this is the single biggest time-saver and is called out explicitly below.

---

## 1. Scope

### In scope (v1)
- Auth (magic-link adapted for mobile via deep link).
- **Dashboard** tab — KPI cards (cheapest now, median, below-threshold count), best-fares list.
- **Explore** tab — route intelligence screens (WebView-backed in v1).
- **Offers** tab — mistake-fare radar / best deals list, native list UI.
- **Searches** tab — CRUD on route watches + thresholds (fully native).
- **Settings** tab — account, notification prefs, threshold defaults, theme.
- **Push notifications** — threshold-cross + mistake-fare alerts with deep links into the relevant fare.
- **Booking** — tapping a fare opens the affiliate deep-link (in-app browser), markers preserved.

### Out of scope (v1)
- Rebuilding the poller/backend (reuse Next.js).
- The admin portal (`admin.flycheap.18dn.com`) — desktop/web only, do not port.
- In-app payments / actual ticket purchase (booking happens on Aviasales, as today).
- Native re-implementation of the calendar heatmap / route-DNA viz (WebView in v1; native is a v2 stretch).

### Assumptions (flag if wrong)
- Backend is Next.js (App Router) and you can add API route handlers to it.
- Both iOS and Android are targets.
- Goal is App Store + Play Store distribution (not just personal/sideload).
- The existing `/go?to=...&marker=...` affiliate redirect is the canonical booking entry point and must not be bypassed.

---

## 2. Architecture decision

**Chosen: Expo native client + Next.js as headless API, with WebView for heavy viz.**

| Option | Verdict | Why |
|---|---|---|
| **Expo / React Native (chosen)** | ✅ | True native push, app-store distributable, native feel for watch management. Reuses backend + TS types. WebView covers the expensive viz so v1 ships fast. |
| Capacitor wrapping the web app | ⚠️ fallback | Fastest to "an app exists," but Next.js SSR is awkward to wrap, push is clunkier, and it feels like a website in a frame — which is the thing you're trying to get away from. Keep as fallback only if timeline collapses. |
| PWA enhancement | ❌ | You already have PWA meta tags; iOS PWA push is unreliable and you explicitly want "an app, not a web app." |

**Data flow:**
```
[Expo app] --HTTPS/JSON--> [Next.js API routes] --> [existing DB + Travelpayouts cache]
     ^                                                      |
     |  Expo push token registered                          | poller detects threshold cross
     |                                                       v
[Expo Push Service] <----- POST /api/internal/notify ----- [poller / cron]
```

The poller already runs every 30 min. When it detects a threshold cross for a user with a registered device token, it calls Expo's push API. No new polling infra needed.

---

## 3. Tech stack (pin these)

- **Expo SDK 56** (managed workflow, dev builds — not Expo Go for production).
- **expo-router 56** — file-based routing, native tabs.
- **TypeScript** (share types with the web repo where practical).
- **TanStack Query (React Query) v5** — server state, caching, background refetch, offline persistence.
- **NativeWind v4** (Tailwind for RN) — fastest way to match the existing Tailwind-ish web look; alternatively Tamagui if you want fully native-driven theming. Default to NativeWind.
- **expo-notifications** — push registration + handling.
- **expo-secure-store** — auth token storage.
- **expo-web-browser** — in-app browser for affiliate booking links.
- **react-native-webview** — heavy viz screens in v1.
- **expo-linking** — deep links (magic-link return + notification taps).
- **EAS Build + EAS Submit** — cloud builds and store submission.
- **Zod** — validate API responses at the boundary.

> Pin exact versions at `npx create-expo-app@latest` time; let Expo's `install` resolve compatible native deps rather than hand-pinning native packages.

---

## 4. Backend work (add to the existing Next.js repo)

The app needs a clean JSON contract. Most of this data already exists for the web dashboard — expose it as `/api/v1/*` route handlers returning JSON. **Reuse existing query logic; don't duplicate it.**

### 4.1 Endpoints to expose / confirm

| Method | Path | Purpose | Notes |
|---|---|---|---|
| `POST` | `/api/v1/auth/request-link` | Send magic link to email | Link must contain a mobile-deep-link return path (see §6) |
| `POST` | `/api/v1/auth/verify` | Exchange magic token → session token | Return a long-lived bearer/refresh token for the app |
| `GET` | `/api/v1/dashboard` | KPI summary (cheapest, median, below-threshold count, tracked count, savings YTD) | Mirrors the executive-brief cards |
| `GET` | `/api/v1/fares?filter=&origin=&sort=` | Best-fares list (paged) | Mirrors the "Best fares worldwide" table |
| `GET` | `/api/v1/offers` | Mistake-fare radar items | The anomaly engine output |
| `GET` | `/api/v1/searches` | List user's route watches | |
| `POST` | `/api/v1/searches` | Create a watch (origin, dest, threshold, party) | |
| `PATCH` | `/api/v1/searches/:id` | Edit watch / threshold | |
| `DELETE` | `/api/v1/searches/:id` | Remove watch | |
| `GET` | `/api/v1/settings` / `PATCH` | Notification prefs, default threshold, theme | |
| `POST` | `/api/v1/devices` | Register Expo push token for the user | Store token + platform + user id |
| `DELETE` | `/api/v1/devices/:token` | Unregister on logout | |
| `GET` | `/api/v1/book-url?...` | Return the canonical `/go?...` affiliate URL with marker for a fare | Single source of truth for booking links — **never construct affiliate URLs client-side** |

### 4.2 Push trigger (internal)
- Extend the poller: on threshold-cross or new mistake-fare, look up registered device tokens for affected users, POST to Expo Push API (`https://exp.host/--/api/v2/push/send`).
- Payload includes `{ fareId, route, price, threshold }` in `data` so the app can deep-link to the fare on tap.
- Respect each user's notification prefs (quiet hours, per-route mute) from `/settings`.

### 4.3 Revenue integrity (critical)
- The app must **never** build Aviasales URLs itself. It always calls `/api/v1/book-url` (or embeds the existing `/go?to=...&marker=...` link returned by the fares API).
- Verify every booking deep-link carries the Travelpayouts `marker`. Add a test that asserts the marker is present in API responses (you've been bitten by missing markers before — guard it).

### 4.4 Auth model — support BOTH link types
Magic-link is great for web but needs a mobile return path. **Build both methods; the verify handler is agnostic to how the token arrived.** `expo-linking` routes both through the same listener, so this is little extra work and you can decide which to lead with in the email later.

- **(A) Universal Links (iOS) / App Links (Android)** — primary, nicest UX:
  - Magic link points to `https://flycheap.18dn.com/m/verify?token=...`.
  - App claims that path via associated domains; falls back to opening the web verify page if the app isn't installed.
  - **Requires hosting two verification files on `flycheap.18dn.com`:** `/.well-known/apple-app-site-association` (no extension, JSON, served as `application/json`) and `/.well-known/assetlinks.json` (Android, with the app's signing cert SHA-256).
- **(B) Custom scheme** — fallback, zero hosting:
  - `flycheap://verify?token=...`. Works in dev immediately and as a safety net if universal-link verification ever breaks. Note: some email clients strip/warn on custom schemes, which is exactly why (A) is primary.

**Implementation:** register both the `flycheap` scheme and the associated domains in `app.config.ts`. A single `verify` route reads `token` from the URL params regardless of source, exchanges it at `/api/v1/auth/verify`, and stores the returned session token in `expo-secure-store`. The email link can carry either form (or both — universal link with a `flycheap://` fallback button) and nothing in the app changes.

After verify, issue an app session token stored in `expo-secure-store`. Add refresh handling so users aren't logged out constantly.

---

## 5. App structure (file layout)

```
flycheap-app/
├── app/                          # expo-router
│   ├── _layout.tsx               # root: providers (QueryClient, theme, auth gate)
│   ├── (auth)/
│   │   ├── login.tsx             # email entry → request-link
│   │   └── verify.tsx            # handles deep-link token exchange
│   ├── (tabs)/
│   │   ├── _layout.tsx           # bottom tab bar: Dashboard/Explore/Offers/Searches/Settings
│   │   ├── index.tsx             # Dashboard
│   │   ├── explore.tsx           # Route intelligence (WebView in v1)
│   │   ├── offers.tsx            # Mistake-fare radar list
│   │   ├── searches.tsx          # Watch list (CRUD)
│   │   └── settings.tsx
│   ├── fare/[id].tsx             # Fare detail + Book button (push deep-link target)
│   └── search/
│       ├── new.tsx               # Create watch form
│       └── [id].tsx              # Edit watch
├── src/
│   ├── api/                      # typed client (fetch wrappers + Zod schemas)
│   │   ├── client.ts             # base fetch w/ auth header + error mapping
│   │   ├── dashboard.ts
│   │   ├── fares.ts
│   │   ├── searches.ts
│   │   └── schemas.ts            # Zod schemas mirroring API contract
│   ├── auth/                     # token storage, AuthProvider, useAuth()
│   ├── notifications/            # registerForPush(), notification handlers, deep-link routing
│   ├── components/               # KpiCard, FareRow, ThresholdBadge, OfferCard, etc.
│   ├── hooks/                    # useDashboard, useFares, useSearches (React Query)
│   ├── lib/                      # formatting (currency, route codes, dates), webview helpers
│   └── theme/                    # tokens matching web (#0a3a6b primary, cyberpunk-ish accents)
├── assets/                       # icon, splash, notification icon
├── app.config.ts                 # name, scheme, associated domains, plugins
├── eas.json                      # build profiles (dev/preview/production)
└── package.json
```

---

## 6. Key flows

### 6.1 Booking (revenue-critical)
1. User taps a fare row → `fare/[id]`.
2. App requests the booking URL from `/api/v1/book-url` (or uses the `/go?...` link already in the fare object).
3. Open with `expo-web-browser` (in-app browser, keeps user in-app, preserves marker).
4. Optionally log a `book_tapped` analytics event.

### 6.2 Push notification → deep link
1. Poller detects threshold cross → Expo push with `data.fareId`.
2. User taps notification → app routes to `fare/[id]` via `expo-router` + notification response listener.
3. Cold-start case handled (notification that launched the app is read on boot).

### 6.3 Add a watch
1. Searches tab → "+" → `search/new`.
2. Form: origin (airport autocomplete), destination, threshold price, party size, date window.
3. `POST /api/v1/searches` → optimistic update via React Query → toast confirm.

### 6.4 WebView screens (Explore / viz)
- Load `https://flycheap.18dn.com/explore?embed=1&token=...` (add an `embed` query param on the web side that hides the web nav/footer/sign-in chrome so it reads as a native screen).
- Pass theme + auth so the embedded view matches and is authenticated.
- Add a small JS bridge so taps on "Book" inside the WebView route back through the native booking flow (or just let the existing `/go` link work).

---

## 7. Phased implementation plan

### Phase 0 — Setup (½ day)
- `npx create-expo-app@latest flycheap-app` (TypeScript, expo-router template).
- Add NativeWind, TanStack Query, expo-secure-store, expo-notifications, expo-web-browser, react-native-webview, zod, expo-linking.
- Configure `app.config.ts`: app name, **both** the custom scheme `flycheap` **and** associated domains for universal links to `flycheap.18dn.com`, bundle IDs for both platforms.
- Host the universal-link verification files on the web side: `/.well-known/apple-app-site-association` and `/.well-known/assetlinks.json` (the Android file needs the app's signing cert SHA-256, which EAS gives you after the first build — so this file can land mid-project).
- Create an EAS project; set up `eas.json` with dev/preview/production profiles.
- **Checkpoint:** dev build runs on a simulator + a physical device.

### Phase 1 — API client + auth (1–2 days)
- Build typed API client (`src/api/client.ts`) with bearer auth + Zod validation.
- Implement login (`request-link`) and verify (deep-link token exchange).
- AuthProvider + `useAuth()`, secure token storage, auth gate in root layout.
- **Checkpoint:** can log in via magic link tapped on the device and land on the dashboard.

### Phase 2 — Core read screens (2–3 days)
- Dashboard (KPI cards + best-fares list) wired to `/dashboard` + `/fares`.
- Offers tab (mistake-fare radar) wired to `/offers`.
- Fare detail screen + booking flow (`book-url` → in-app browser).
- React Query caching + pull-to-refresh + skeleton loaders.
- **Checkpoint:** real data renders; tapping a fare opens an affiliate booking link with marker intact.

### Phase 3 — Searches CRUD (2 days)
- Searches list, create, edit, delete with optimistic updates.
- Airport autocomplete (reuse backend airport list or a static IATA dataset).
- **Checkpoint:** can add a watch on device and see it server-side.

### Phase 4 — Push notifications (2 days)
- `registerForPush()` → `POST /api/v1/devices`.
- Backend: extend poller to send Expo push on threshold cross (respect prefs).
- Notification tap → deep link to fare (foreground, background, cold start).
- Settings: notification toggles, quiet hours, per-route mute.
- **Checkpoint:** trigger a test threshold cross → push arrives → tap → opens correct fare.

### Phase 5 — Explore (WebView) + Settings + polish (2 days)
- Add `?embed=1` chrome-less mode on the web side; load in WebView with auth/theme.
- Settings screen (account, threshold defaults, theme toggle).
- Empty states, error boundaries, offline banner, app icon + splash.
- **Checkpoint:** all five tabs functional; app feels coherent.

### Phase 6 — Build & submit (1–2 days + store review lag)
The codebase is cross-platform from Phase 0, so this phase is purely about release sequencing. **Both paths supported — pick at submission time:**

- **Path A — Both stores at once:** EAS production builds for iOS + Android in parallel; submit to TestFlight + Play internal testing together, then promote both. Needs Apple Developer ($99/yr) + Google Play ($25 one-time) accounts ready up front.
- **Path B — iOS-first:** Build and submit iOS only; ship to TestFlight, gather feedback, then run the same EAS production profile for Android and submit to Play later. The Android build is already working (Expo), you're just deferring the store listing. Lets you defer the Play account and Android store assets.

Common to both:
- App Store Connect / Play Console listings (screenshots, privacy labels — declare email, push token, and affiliate-click tracking).
- TestFlight / internal testing track first, then production submit.
- **Checkpoint:** builds accepted to the relevant testing track(s).

> **Rough total:** ~12–16 focused dev-days for v1 across both platforms.

---

## 8. Decisions Miro can defer (both paths now built into the plan)

The two big forks are handled both ways, so nothing blocks Phase 1:

- **Platform — decided at submission, not in code.** The app is cross-platform from day one; choose Path A (both stores) or Path B (iOS-first, Android later) in Phase 6. See §7 Phase 6.
- **Magic-link return — both methods built.** Universal links (primary) + custom scheme (fallback) both wired through one verify handler. See §4.4. You only choose which form the email link leads with, and that's a one-line change later.

Still worth provisioning / confirming when convenient:

1. **App session token lifetime** — how long before re-auth? Refresh token or long-lived bearer? (Default to a refresh-token pair.)
2. **Dev accounts** — Apple Developer ($99/yr) is needed for any iOS submission *and* for APNs push (Phase 4). Google Play ($25 one-time) only when you submit Android. Path B lets you defer the Google one.
3. **NativeWind vs Tamagui** — defaulting to NativeWind unless you want fully native theming.
4. **Repo strategy** — separate `flycheap-app` repo (simpler to start) or a monorepo with the web app (shares the API contract TS types). Either works; say the word and I'll add a monorepo layout.

---

## 9. Claude Code kickoff prompt (paste this)

> Initialize a new Expo app `flycheap-app` using Expo SDK 56 with the expo-router TypeScript template. This is the mobile client for an existing Next.js flight-price tracker; the Next.js backend is the source of truth and I will expose `/api/v1/*` JSON endpoints (see the contract in `flycheap-mobile-app-plan.md` §4).
>
> Start with **Phase 0 and Phase 1** from the plan:
> 1. Scaffold the project and the `app/` + `src/` structure in §5.
> 2. Install and configure: NativeWind v4, TanStack Query v5, expo-secure-store, expo-notifications, expo-web-browser, react-native-webview, expo-linking, zod.
> 3. Set `app.config.ts` to register BOTH the custom scheme `flycheap` AND associated domains for universal links to `flycheap.18dn.com`, configure iOS + Android bundle IDs, and create `eas.json` with dev/preview/production profiles.
> 4. Build the typed API client (`src/api/client.ts`) with bearer auth + Zod-validated responses, and Zod schemas in `src/api/schemas.ts` matching the §4.1 contract.
> 5. Implement the magic-link auth flow: `login` (calls `/api/v1/auth/request-link`), a deep-link `verify` route that reads the token regardless of whether it arrived via universal link (`https://flycheap.18dn.com/m/verify?token=...`) or custom scheme (`flycheap://verify?token=...`) and exchanges it at `/api/v1/auth/verify`, an `AuthProvider`/`useAuth()` with secure token storage, and an auth gate in the root layout.
>
> Use a primary color of `#0a3a6b` to match the web theme. Do NOT construct Aviasales/Travelpayouts booking URLs client-side — always use the booking URL returned by the backend, and preserve the affiliate `marker`. Stop after Phase 1 and show me the running login → dashboard flow before continuing.

---

## 10. Risks & notes

- **WebView auth/theme drift:** the embedded Explore screens must accept a token and an `embed` flag, or they'll show the web sign-in/nav chrome. Add this on the web side early.
- **iOS push entitlement:** requires a paid Apple Developer account and APNs key configured in EAS. Plan for it before Phase 4.
- **Affiliate markers:** add an automated assertion that every booking URL from the API contains the Travelpayouts `marker` — this protects revenue and you've hit missing-marker bugs before.
- **Background refresh ≠ polling:** the app does NOT poll. All polling stays server-side; the app just receives push + refetches on open. Don't let scope creep add client-side polling.
- **Store privacy labels:** declare data collection (email, push token, affiliate click tracking) accurately to avoid review rejection.

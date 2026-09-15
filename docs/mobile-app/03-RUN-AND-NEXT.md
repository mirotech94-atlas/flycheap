# FlyCheap App — Run, Build & Ship

> The app lives at `mobile/` (monorepo subdir, local-only — it builds via Xcode/EAS on the Mac,
> never deployed to the VM). Backend `/api/v1/*` is live on flycheap.18dn.com.

## What's done (2026-06-13)
- **Backend Tiers 1–5 live on prod:** auth (90-day bearer), dashboard, fares, offers, searches CRUD,
  settings, book-url (marker-verified), device registry, and push fired from the poller's alert path.
- **Mobile app fully built (Tiers 1–6):** 5 tabs — Dashboard (Total-flights metric), Offers, Searches
  (CRUD), Explore (WebView), Profile (Pricing, Notifications, Help, Sign out) — plus fare detail, create-watch,
  pricing, help, and notification-settings screens. Typecheck clean; iOS bundle compiles.
- **Native iOS project generated** (`mobile/ios/`) with the correct bundle ID, push + universal-link
  entitlements, and the `flycheap://` scheme.

## Run it on the iOS simulator (fastest)
```bash
cd mobile
# one-time: CocoaPods (brew install cocoapods), then:
npx expo run:ios          # pod install + build + launch in the simulator
# or, for a JS-only quick look against the existing build:
npx expo start            # press 'i' for simulator, or scan QR with Expo Go-style dev client
```

## Build for TestFlight (needs YOUR Apple/Expo credentials — can't be automated)
A signed build requires signing in as the account holder. Two equivalent paths:

**Path A — Xcode (matches the Apple handoff's GUI flow, no new API key):**
```bash
cd mobile/ios && pod install        # generates FlyCheap.xcworkspace
open FlyCheap.xcworkspace
```
In Xcode: select the **FlyCheap** target → Signing & Capabilities → Team = the one resolving to
**L3NFNQPS55** (Automatic). Bump build number → Product ▸ Archive → Organizer ▸ Distribute App ▸
App Store Connect / TestFlight (or save the IPA and upload via **Transporter**).

**Path B — EAS (cloud):**
```bash
cd mobile
npx eas login                                   # your Expo account
npx eas init                                    # writes projectId into app.config.ts extra.eas
npx eas build --profile production --platform ios
# then upload the resulting .ipa via Transporter, or `eas submit` with an ASC API key.
```

After the build processes (~10–30 min), FlyCheap appears in TestFlight for your internal tester.

### Deep-link note (dev builds)
On a dev build, the universal link may not open the app directly (Apple caches associated-domains for
non-store builds). The email's link then opens the web `/m/verify` page, which bounces to `flycheap://` —
tap "Open in the FlyCheap app". This is expected; it verifies cleanly once shipped via TestFlight/App Store.

## Apple TODO (yours)
- Accept the updated Apple Developer license agreement (blocks new-app submission).
- After first build: drop the Android signing **SHA-256** into the web `/.well-known/assetlinks.json`
  (`src/app/api/assetlinks/route.ts`) for Android App Links.
- Send me the auto-assigned **ASC Apple ID** to record.

## Backend next (optional polish)
- Add the web-side `?embed=1` chrome-less mode on `/explore` so the Explore WebView reads fully native.
- Richer offers (true mistake-fare anomaly scoring) if you want Offers to differ more from Fares.

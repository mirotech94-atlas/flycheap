# Apple Developer Account — Handoff for the NEW app

Paste this whole file into the other Claude session before it touches anything iOS.
It tells you which Apple Developer **account / team** to ship the new app under.
Everything here is non-secret (Team IDs and App Store Connect app-IDs are visible in
any distributed app). **No passwords, no API keys, no certificates are in this file —
do not add them.**

## TL;DR — use the SAME team, a NEW app record

- **Apple Developer Program Team ID:** `L3NFNQPS55`  ← this is the account to use.
- **Do NOT create a new Apple Developer account.** Reuse this team.
- **Do create a brand-new App Store Connect app record** for the new app (it gets its
  own Apple ID / SKU). Do **not** reuse the existing app's records below.
- **Signing:** Automatic (`CODE_SIGN_STYLE = Automatic`). With the right Apple ID
  signed into Xcode, automatic signing resolves to team `L3NFNQPS55` on its own.
- **Upload:** GUI only — Xcode → Product → Archive → Organizer → Distribute App, **or**
  Transporter. (There is no App Store Connect API key / `altool` flow checked into the
  repo, so a headless CLI upload is not wired up. Don't assume one exists.)

## The existing app (reference — so you can tell the new one apart, NOT to reuse)

| Field | Existing "K9 Pulse" app | New app |
|---|---|---|
| Apple Developer Team ID | `L3NFNQPS55` | **same — `L3NFNQPS55`** |
| Bundle ID (main) | `Miro.k9.attendance` | **new, e.g. `Miro.k9.<newapp>`** |
| Sub-bundles | `Miro.k9.attendance.AttendanceWidget`, `Miro.k9.attendance.watchkitapp` | only if the new app has a widget/watch target |
| App Store Connect Apple ID | `6773598689` | **leave blank — ASC assigns a new one** |
| Display name | `K9 Pulse` | new |
| Tech | Capacitor iOS WebView wrapping a remote server.url | (your choice) |

> The `Miro.k9.` prefix is the reverse-DNS namespace this team uses. Keep using
> `Miro.k9.<something>` for the new app's bundle ID unless told otherwise — but it MUST
> be a new, unique identifier (you cannot ship two apps under `Miro.k9.attendance`).

## How to VERIFY you're on the right account (do this first)

1. Xcode → **Settings → Accounts**. Confirm an Apple ID is signed in whose team list
   includes **Team ID `L3NFNQPS55`**. If it's missing, stop and ask the user to sign in
   the correct Apple ID — do not proceed under a different team.
2. In the new project's target → **Signing & Capabilities**:
   - Signing: **Automatic**
   - Team: the one resolving to **`L3NFNQPS55`**
   - Bundle Identifier: the new `Miro.k9.<newapp>`
3. Quick CLI sanity check once a project exists:
   ```bash
   grep -m1 "DEVELOPMENT_TEAM" path/to/App.xcodeproj/project.pbxproj
   # expect: DEVELOPMENT_TEAM = L3NFNQPS55;
   ```
4. Confirm the signing identity Xcode will use is under this team:
   ```bash
   security find-identity -p codesigning -v | grep -i "Apple Distribution\|Apple Development"
   ```
   (You're confirming a cert for this team exists locally; the cert's team is L3NFNQPS55.)

## First-app-setup checklist (new app, same team)

1. Create the App Store Connect record: appstoreconnect.apple.com → **Apps → +** →
   pick the team, set the new bundle ID (register it under **Certificates, IDs &
   Profiles → Identifiers** first if it doesn't exist), name, SKU.
2. Set `DEVELOPMENT_TEAM = L3NFNQPS55` and the new bundle ID in the target.
3. Bump version/build, Archive, and distribute via Organizer/Transporter to TestFlight.
4. The new app's own App Store Connect Apple ID is auto-generated — record it in the new
   project's docs, not here.

## Hard don'ts

- ❌ Don't open a second Apple Developer Program membership.
- ❌ Don't reuse bundle ID `Miro.k9.attendance` or ASC Apple ID `6773598689` — those are
  the existing K9 Pulse app.
- ❌ Don't put certificates, provisioning profiles, app-specific passwords, or App Store
  Connect API keys in any repo file. Keep them in Keychain / Xcode / the user's secure
  store only.

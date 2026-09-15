# FlyCheap → TestFlight via EAS (your steps)

EAS is wired up (`eas.json` profiles + `package.json` scripts). EAS cloud builds run in a
clean environment, so they're **immune to the spaces-in-path issue** that blocks local Xcode builds
from this repo. You only need to authenticate (I can't do that for you) and run one command.

## One-time setup
```bash
cd mobile
npx eas login                 # your Expo account
npx eas init                  # creates the EAS project; copy the printed projectId…
```
Then paste that projectId into `mobile/app.config.ts` → `extra.eas.projectId` (replace `undefined`).
This also makes native push tokens resolve (`getExpoPushTokenAsync` needs the projectId).

## Build for TestFlight
```bash
npm run build:ios             # = eas build --profile production --platform ios
```
First run walks you through iOS signing once (sign in with the Apple ID on **Team L3NFNQPS55**, or paste an
App Store Connect API key). EAS stores the credentials, so future builds are just the one command.

When it finishes (~15–25 min), either:
- **`npm run submit:ios`** (needs an ASC API key once), or
- download the `.ipa` from the EAS build page and upload via **Transporter** (matches the Apple handoff; no API key).

After Apple processes it (~10–30 min) FlyCheap appears in TestFlight for your internal tester.

## Profiles (eas.json)
- `development` — dev client, simulator build (internal).
- `preview` — internal distribution (ad-hoc / TestFlight internal).
- `production` — store build, `autoIncrement`, points at `https://flycheap.18dn.com`.

## Notes
- Bundle id `Miro.k9.flycheap`, Apple team `L3NFNQPS55` (automatic signing).
- After the first build, drop the Android signing SHA-256 into the web `/.well-known/assetlinks.json`
  (`src/app/api/assetlinks/route.ts`) to finish Android App Links.
- Session persists across launches (secure-store, 90-day bearer) — returning users skip the magic link.

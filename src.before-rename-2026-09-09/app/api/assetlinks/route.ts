import { NextResponse } from 'next/server';

/**
 * Android App Links — served at `/.well-known/assetlinks.json` via a rewrite in
 * next.config.js. Lets the FlyCheap Android app claim `https://flycheap.18dn.com/m/*`.
 *
 * TODO(Tier 2): replace the placeholder fingerprint with the real SHA-256 of the
 * app's signing cert. EAS gives this after the first Android build:
 *   `eas credentials` (Android → Keystore) → "SHA-256 Fingerprint".
 * Until then App Links won't verify on Android; the custom scheme (flycheap://) and
 * the /m/verify web fallback still work, so this is non-blocking for early phases.
 */
const PLACEHOLDER_SHA256 = 'REPLACE_WITH_EAS_ANDROID_SIGNING_SHA256';

const ASSETLINKS = [
  {
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: 'com.flycheap.app',
      sha256_cert_fingerprints: [PLACEHOLDER_SHA256],
    },
  },
];

export function GET() {
  return NextResponse.json(ASSETLINKS, {
    headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=3600' },
  });
}

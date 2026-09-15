import { NextResponse } from 'next/server';

/**
 * Apple App Site Association — served at `/.well-known/apple-app-site-association`
 * via a rewrite in next.config.js (route handler guarantees the application/json
 * content-type Apple expects; the canonical path has no file extension).
 *
 * appID = <TeamID>.<BundleID> = L3NFNQPS55.Miro.k9.flycheap  (see docs/mobile-app/02-APPLE-DEVELOPER-HANDOFF.md).
 * `paths` claims the mobile magic-link landing so taps open the FlyCheap app.
 */
const AASA = {
  applinks: {
    apps: [],
    details: [
      {
        appID: 'L3NFNQPS55.Miro.k9.flycheap',
        paths: ['/m/verify*', '/m/*'],
      },
    ],
  },
};

export function GET() {
  return NextResponse.json(AASA, {
    headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=3600' },
  });
}

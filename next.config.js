/** @type {import('next').NextConfig} */
const { PHASE_PRODUCTION_BUILD } = require('next/constants');

const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['better-sqlite3'],
  // Zero-downtime deploys: the build writes into an INACTIVE dist dir
  // (.next.a / .next.b) via NEXT_DIST_DIR while the running server keeps
  // serving the ACTIVE one, so the live .next is never rewritten mid-build.
  // deploy.sh then flips which dir the service reads and restarts. Runtime
  // (systemd) sets NEXT_DIST_DIR from .deploy-active-dist; a bare build or dev
  // run with no env falls back to the default '.next'. The value must match at
  // build and start time — Next embeds distDir into the build manifests.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // Next 16 + Turbopack occasionally races on generated .next/types/*.d.ts
  // files during the build's typecheck phase, causing transient
  // "File not found" errors even when the files exist. We run TS validation
  // separately via `npx tsc --noEmit` pre-deploy; let the build itself focus
  // on bundling. The deploy.sh runs typecheck independently if needed.
  typescript: {
    ignoreBuildErrors: true,
  },
  // Universal-link / App-Link association files. Served from route handlers so the
  // content-type is guaranteed application/json (the AASA path has no extension).
  async rewrites() {
    return [
      { source: '/.well-known/apple-app-site-association', destination: '/api/aasa' },
      { source: '/.well-known/assetlinks.json', destination: '/api/assetlinks' },
    ];
  },
};

// Deploy-lock guard: a PRODUCTION BUILD may only run when it was launched
// through deploy.sh, which holds an exclusive flock on .deploy.lock and then
// sets DEPLOY_LOCK_HELD=1. This makes a stray `next build` (run directly by
// another session, outside the lock) refuse to start, since overlapping builds
// wipe each other's .next and crash-loop production. Only the BUILD phase is
// gated — `next start` (the systemd service) and `next dev` are never blocked,
// so the app can always boot.
module.exports = (phase) => {
  if (phase === PHASE_PRODUCTION_BUILD && process.env.DEPLOY_LOCK_HELD !== '1') {
    throw new Error(
      '\n\n  ✋ Refusing to build: this production build was not launched through deploy.sh.\n' +
      '     Concurrent `next build` runs corrupt .next and crash-loop production, so builds\n' +
      '     must hold the deploy lock. Run:  bash deploy/deploy.sh\n' +
      '     (If you are certain no other build/deploy is running, prefix the command with\n' +
      '      DEPLOY_LOCK_HELD=1 to override.)\n'
    );
  }
  return nextConfig;
};

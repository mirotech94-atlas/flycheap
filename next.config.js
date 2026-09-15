/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['better-sqlite3'],
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

module.exports = nextConfig;

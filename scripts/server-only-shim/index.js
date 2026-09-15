// No-op stand-in for the `server-only` package.
//
// `server-only` exists purely to make Next.js fail the build if a server module
// is imported into a client bundle. The standalone job runner (scripts/run-job.mjs)
// is already server-side, so it resolves `server-only` to this empty module —
// otherwise importing db.ts/poller.ts from plain Node throws.
//
// Next's own bundler never sees this file; it substitutes its real stub.
module.exports = {};

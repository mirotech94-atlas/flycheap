#!/usr/bin/env bash
# Build and restart the Cheapflight Tracker on the production server.
# Run as root. Idempotent. Verifies HTTP 200 after restart; auto-rolls
# back if the new build can't serve a request.
#
# Why this exists:
# - Running `npm run build` directly as root leaves .next/ owned by root,
#   which then breaks the egyflights service (EACCES on prerender writes).
# - A partial/broken build can leave .next half-populated → service starts
#   but returns 500 ("client reference manifest missing" / "Invariant" errors).
#   We catch that here and roll back to the previous build automatically.

set -euo pipefail

APP_USER="egyflights"
APP_DIR="/opt/egyptair-tracker"
# Health-check through a REAL Host header on a route that renders an app-router
# page (the apex rewrites to /early-access). A bare localhost/ with no Host
# returned 200 even when flycheap.live/ 500'd on a broken build, so the old
# gate could pass a broken deploy. Hitting the real host exercises the client
# reference manifests that go missing in a half-written .next.
HEALTH_HOST="flycheap.live"
HEALTH_URL="http://localhost:3000/"
HEALTH_TIMEOUT_S=10
HEALTH_MAX_ATTEMPTS=12     # 12 × 5s = 60s grace window after restart

# Cooldown: refuse a deploy that starts within this many seconds of the last
# SUCCESSFUL one. Guards against two sessions deploying near-simultaneously
# (tonight's collision was ~30s apart). Override for a genuine rapid follow-up
# with DEPLOY_FORCE=1.
DEPLOY_COOLDOWN_S=60
# Root's own bookkeeping (lock, cooldown, deps hash) lives in a root-only dir.
# It used to sit in $APP_DIR, which the app user can write: a symlink planted
# there turned root's `>` redirects into writes anywhere on the box.
STATE_DIR="/var/lib/flycheap-deploy"
COOLDOWN_FILE="$STATE_DIR/last-deploy-epoch"
# Where setup.sh installs this script. sudoers points here, never at $APP_DIR.
INSTALLED_PATH="/usr/local/sbin/flycheap-deploy"

# Single place that performs the health request, with the real Host header.
health_code() {
  curl -sL -o /dev/null -w '%{http_code}' --max-time "$HEALTH_TIMEOUT_S" -H "Host: $HEALTH_HOST" "$HEALTH_URL" || echo "000"
}

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root (or with sudo)." >&2
  exit 1
fi

# -------------------------------------------------------------------------
# 0-self. RUN ONLY FROM A ROOT-OWNED PATH. The app user may start this script
#   as root (sudoers → systemd-run). If the file, or ANY directory above it, is
#   writable by someone other than root, that someone can swap the script (or
#   rename its directory and plant a new one) and get root. $APP_DIR is owned
#   by the app user, so the in-tree deploy/deploy.sh never qualifies; the
#   installed copy at $INSTALLED_PATH does.
# -------------------------------------------------------------------------
path_is_root_only() {
  local p="$1" uid mode
  while :; do
    uid=$(stat -c '%u' -- "$p") || return 1
    mode=$(stat -c '%a' -- "$p") || return 1
    if [ "$uid" != "0" ]; then echo "    $p is owned by uid $uid, not root" >&2; return 1; fi
    if (( 8#$mode & 8#022 )); then echo "    $p is group/other-writable (mode $mode)" >&2; return 1; fi
    [ "$p" = "/" ] && return 0
    p="$(dirname -- "$p")"
  done
}
SRC="${BASH_SOURCE[0]:-}"
if [ -n "$SRC" ] && [ -f "$SRC" ]; then
  SELF="$(readlink -f -- "$SRC")"
  if ! path_is_root_only "$SELF"; then
    echo "==> REFUSED: $SELF is not root-only all the way up to /." >&2
    echo "    Run the root-owned copy instead (copy it there from a trusted checkout," >&2
    echo "    not from this app-owned tree, whenever deploy.sh changes):" >&2
    echo "      DEPLOY_OWNER_TOKEN=… $INSTALLED_PATH" >&2
    exit 5
  fi
else
  # Fed on stdin (`bash -s`): the code came from the invoking root shell, not
  # from a file the app user could have swapped. sudoers never runs it so.
  echo "==> Script read from stdin — path ownership check not applicable"
fi

install -d -o root -g root -m 0700 "$STATE_DIR"

# Run a command as the app user. Every write INSIDE $APP_DIR goes through
# this: the app user owns that tree, so a symlink it plants can only ever
# point root's write at something the app user could already write itself.
as_app() { sudo -u "$APP_USER" -- "$@"; }

cd "$APP_DIR"

# -------------------------------------------------------------------------
# 0-owner. SINGLE DEPLOY OWNER — only the owner session may deploy; every
#   other session hands off its commit (the SHA) to the owner, who ships it.
#   This funnels all deploys through one path so two sessions can't collide
#   (the 2026-09-16/17 stale-500 outages). The owner holds a secret token; the
#   server stores only its SHA-256 in .deploy-owner-hash, so a peer (even root)
#   can read the hash but cannot deploy. Present the token via
#   DEPLOY_OWNER_TOKEN. If .deploy-owner-hash is absent, ownership isn't set
#   and anyone may deploy (recovery: `rm .deploy-owner-hash` reopens deploys).
# -------------------------------------------------------------------------
OWNER_HASH_FILE="$APP_DIR/.deploy-owner-hash"
if [ -f "$OWNER_HASH_FILE" ]; then
  GIVEN_HASH=$(printf '%s' "${DEPLOY_OWNER_TOKEN:-}" | sha256sum | cut -d' ' -f1)
  if [ "$GIVEN_HASH" != "$(cat "$OWNER_HASH_FILE" 2>/dev/null)" ]; then
    echo "==> REFUSED: production deploys are owned by another session." >&2
    echo "    Do NOT deploy. Commit your changes and hand the commit SHA to the deploy" >&2
    echo "    owner, who will ship it. (If you ARE the owner, set DEPLOY_OWNER_TOKEN.)" >&2
    exit 4
  fi
fi

# -------------------------------------------------------------------------
# 0. SERIALIZE DEPLOYS — prevent concurrent-build corruption.
#    Multiple sessions each run `rm -rf .next && next build` on the SAME dir;
#    overlapping builds clobber .next -> an incomplete build -> the app
#    crash-loops "Could not find a production build". An exclusive lock makes
#    overlapping deploys QUEUE instead of colliding. (A stray `next build`
#    invoked directly, outside this script, still bypasses the lock — deploy
#    only through deploy.sh.)
# -------------------------------------------------------------------------
exec 200>"$STATE_DIR/deploy.lock"
if ! flock -w 600 200; then
  echo "==> Another deploy is in progress and did not finish within 10 min — aborting." >&2
  exit 1
fi
echo "==> Acquired deploy lock (serialized build)"

# -------------------------------------------------------------------------
# 0b. COOLDOWN — with the lock held, refuse if a deploy SUCCEEDED very
#     recently. Two sessions deploying ~simultaneously both pass the lock in
#     turn; the second reaches here right after the first finished, sees the
#     fresh timestamp, and skips instead of rewriting .next under the first's
#     just-restarted service. A real rapid follow-up sets DEPLOY_FORCE=1.
# -------------------------------------------------------------------------
if [ "${DEPLOY_FORCE:-0}" != "1" ] && [ -f "$COOLDOWN_FILE" ]; then
  LAST_EPOCH=$(cat "$COOLDOWN_FILE" 2>/dev/null || echo 0)
  [[ "$LAST_EPOCH" =~ ^[0-9]+$ ]] || LAST_EPOCH=0
  AGE=$(( $(date +%s) - LAST_EPOCH ))
  if [ "$AGE" -ge 0 ] && [ "$AGE" -lt "$DEPLOY_COOLDOWN_S" ]; then
    echo "==> SKIPPED: a deploy completed ${AGE}s ago (cooldown ${DEPLOY_COOLDOWN_S}s). NOTHING was deployed this run." >&2
    echo "    The recent deploy already shipped the current code. If you have NEW changes to ship right now, re-run with DEPLOY_FORCE=1." >&2
    exit 3
  fi
fi

# -------------------------------------------------------------------------
# 1. PRE-FLIGHT CHECK — confirm the app is healthy BEFORE we touch anything.
#    If it's already down we still proceed (the deploy might fix it), but we
#    log the state so we don't claim "rolled back to the previous version"
#    when the previous version was also broken.
# -------------------------------------------------------------------------
echo "==> Pre-flight: service state before deploy"
PRE_STATE="unknown"
if systemctl is-active --quiet egyptair; then
  PRE_HTTP=$(health_code)
  echo "    service: active · HTTP $PRE_HTTP (Host: $HEALTH_HOST)"
  if [ "$PRE_HTTP" = "200" ]; then
    PRE_STATE="healthy"
  else
    PRE_STATE="degraded"
  fi
else
  echo "    service: inactive — deploying anyway"
  PRE_STATE="inactive"
fi

# -------------------------------------------------------------------------
# 2. ZERO-DOWNTIME BUILD TARGET — build into the INACTIVE dist dir so the
#    running server keeps serving the ACTIVE one, untouched, for the whole
#    build. `.deploy-active-dist` holds `NEXT_DIST_DIR=.next.<a|b>` and is read
#    by BOTH this script and the systemd unit. The ACTIVE dir doubles as the
#    rollback: on any failure we leave it in place (or flip back to it).
# -------------------------------------------------------------------------
ACTIVE_FILE="$APP_DIR/.deploy-active-dist"
ACTIVE_DIST=".next"   # legacy default, before the first color-flip deploy
if [ -f "$ACTIVE_FILE" ]; then
  ACTIVE_DIST="$(sed -n 's/^NEXT_DIST_DIR=//p' "$ACTIVE_FILE" | tail -1)"
  [ -n "$ACTIVE_DIST" ] || ACTIVE_DIST=".next"
fi
# Written as the app user (it lives in the app tree); the rename keeps the
# flip atomic for the systemd unit that reads it.
write_active_dist() {
  printf 'NEXT_DIST_DIR=%s\n' "$1" | as_app tee "$ACTIVE_FILE.tmp" >/dev/null
  as_app mv -f "$ACTIVE_FILE.tmp" "$ACTIVE_FILE"
}
case "$ACTIVE_DIST" in
  .next.a) TARGET_DIST=".next.b" ;;
  *)       TARGET_DIST=".next.a" ;;   # from .next.b OR the legacy .next
esac
echo "==> Active build: $ACTIVE_DIST → building into $TARGET_DIST (live dir stays up)"

# Deps-change detection: `npm ci` replaces node_modules/next, which fails
# (ENOTEMPTY) while `next start` holds it open — the ONLY reason we stop the
# service. A code-only deploy (unchanged lockfile) skips install and stays up.
DEPS_FILE="$STATE_DIR/deps-hash"
# One-time migration from the old in-tree location, so the first deploy after
# the move does not force a needless install + service stop. Only a well-formed
# md5 is trusted; anything else just means "deps changed".
LEGACY_DEPS_FILE="$APP_DIR/.deploy-deps-hash"
if [ ! -f "$DEPS_FILE" ] && [ -f "$LEGACY_DEPS_FILE" ]; then
  LEGACY_HASH="$(head -c 64 "$LEGACY_DEPS_FILE" 2>/dev/null | tr -d '[:space:]')"
  [[ "$LEGACY_HASH" =~ ^[0-9a-f]{32}$ ]] && printf '%s\n' "$LEGACY_HASH" > "$DEPS_FILE"
fi
DEPS_NOW="$(md5sum "$APP_DIR/package-lock.json" 2>/dev/null | cut -d' ' -f1)"
DEPS_CHANGED=yes
if [ -n "$DEPS_NOW" ] && [ -f "$DEPS_FILE" ] && [ "$DEPS_NOW" = "$(cat "$DEPS_FILE" 2>/dev/null)" ] && [ -d "$APP_DIR/node_modules/next" ]; then
  DEPS_CHANGED=no
fi
echo "==> Dependencies changed since last deploy: $DEPS_CHANGED"

# -------------------------------------------------------------------------
# 3. INSTALL + BUILD as the service user so file ownership stays sane.
# -------------------------------------------------------------------------
# Only stop the service when deps actually change (npm ci must replace
# node_modules/next, impossible while `next start` holds it open). A code-only
# deploy keeps the service RUNNING and serving $ACTIVE_DIST throughout — the
# build writes a DIFFERENT dir, so there is no build-window outage.
WAS_ACTIVE=no
if systemctl is-active --quiet egyptair; then WAS_ACTIVE=yes; fi
if [ "$DEPS_CHANGED" = "yes" ] && [ "$WAS_ACTIVE" = "yes" ]; then
  echo "==> Deps changed — stopping service for npm ci (brief downtime THIS deploy only)"
  systemctl stop egyptair
fi

echo "==> Pause systemd timers (they touch the app dir; race the build → EACCES)"
# egyptair-jobs-* timers fire at intervals (poll, digest, best-deals, etc.)
# and run scripts that touch .next or node_modules. If they fire DURING a
# build, they create files as root (since systemd is root) inside paths the
# build needs to own — EACCES cascade. Pause + restore around the build.
TIMERS=(
  egyptair-jobs-poll.timer
  egyptair-jobs-digest.timer
  egyptair-jobs-weekly.timer
  egyptair-jobs-monthly.timer
  egyptair-jobs-six-month.timer
  egyptair-jobs-annual.timer
  egyptair-jobs-best-deals.timer
  egyptair-jobs-bg-poll.timer
  egyptair-jobs-route-intel.timer
  egyptair-jobs-compact.timer
  egyptair-jobs-commissions.timer
  egyptair-post-video.timer
)
PAUSED_TIMERS=()
for t in "${TIMERS[@]}"; do
  if systemctl is-active --quiet "$t"; then
    systemctl stop "$t"
    PAUSED_TIMERS+=("$t")
  fi
done
echo "    paused ${#PAUSED_TIMERS[@]} timers"
# Ensure we ALWAYS restore them, even on failure/rollback paths below.
restore_timers() {
  for t in "${PAUSED_TIMERS[@]}"; do
    systemctl start "$t" 2>/dev/null || true
  done
}
trap restore_timers EXIT

echo "==> Defensive chown: ensure $APP_USER owns .next, node_modules, and source"
# A prior failed deploy may have left root-owned files. The build runs as
# $APP_USER, so any root-owned residue causes EACCES half-way through.
chown -R "$APP_USER:$APP_USER" "$APP_DIR/.next" "$APP_DIR/.next.a" "$APP_DIR/.next.b" "$APP_DIR/node_modules" 2>/dev/null || true
# Leftovers from runs that did this work as root would now block the app-user
# steps below (set -e), so hand them back too.
chown -R "$APP_USER:$APP_USER" "$APP_DIR/.next.static-keep" "$APP_DIR/.node_modules-cache.keep" 2>/dev/null || true
rm -f "$APP_DIR/.deploy-active-dist.tmp"
# The in-tree deploy/ copy stays root-owned and read-only to the app user
# (chown -R does not follow symlinks, so this is safe on an app-owned tree).
chown -R root:root "$APP_DIR/deploy" 2>/dev/null || true
chmod -R go-w "$APP_DIR/deploy" 2>/dev/null || true

# -------------------------------------------------------------------------
# DISK GUARD — npm's content-addressable cache (_cacache) grows unbounded
# across deploys and once filled the disk it OOM-failed a build. If free
# space is under 2 GB, purge the npm caches before installing. They're pure
# cache — npm re-fetches what it needs — so this is always safe.
# -------------------------------------------------------------------------
FREE_KB=$(df --output=avail / | tail -1 | tr -d ' ')
if [ "${FREE_KB:-0}" -lt 2097152 ]; then
  echo "==> Low disk (<2GB free) — purging npm caches"
  rm -rf "/home/$APP_USER/.npm/_cacache" /root/.npm/_cacache 2>/dev/null || true
  journalctl --vacuum-size=100M 2>/dev/null || true
  echo "    free now: $(df -h --output=avail / | tail -1 | tr -d ' ')"
fi

# `npm ci`: install exactly what package-lock.json pins, and fail loudly if
# package.json and the lockfile disagree. `npm install` "healed" drift by
# resolving fresh versions on the production box, so what shipped was never
# what CI tested. If this fails, fix the lockfile in git, not on the server.
# `npm ci` deletes node_modules, so carry the build cache across it: a cold
# build needs ~5GB and can OOM this box (see below).
if [ "$DEPS_CHANGED" = "yes" ]; then
  echo "==> Installing deps as $APP_USER with npm ci (lockfile changed)"
  BUILD_CACHE_KEEP="$APP_DIR/.node_modules-cache.keep"
  as_app rm -rf "$BUILD_CACHE_KEEP"
  if [ -d "$APP_DIR/node_modules/.cache" ]; then as_app mv "$APP_DIR/node_modules/.cache" "$BUILD_CACHE_KEEP"; fi
  as_app npm ci --no-audit --no-fund --prefer-offline
  if [ -d "$BUILD_CACHE_KEEP" ]; then as_app mv "$BUILD_CACHE_KEEP" "$APP_DIR/node_modules/.cache"; fi
else
  echo "==> Skipping npm ci — lockfile unchanged (service stays up)"
fi

# DO NOT wipe node_modules/.cache here — Next's Turbopack cache makes builds
# fit in 2-3GB RAM; cold-build needs ~5GB and OOMs on small VPS instances.
# The previous-build snapshot (Section 2 above) covers us against stale .next
# manifests. Only the .next directory itself is recreated each deploy.

# ---------------------------------------------------------------------------
# Keep the PREVIOUS build's static assets.
#
# Next content-hashes every JS/CSS chunk and deletes the old ones on each
# build. Any browser tab still open from before the deploy is holding HTML
# that points at those deleted filenames — the page loads, the stylesheet
# 404s, and the user sees raw unstyled HTML. That is exactly what happened
# on 2026-09-13 after a run of rapid rebuilds.
#
# Snapshot .next/static before the build, then restore the old files
# afterwards with --no-clobber so the new build wins on any collision and
# the old hashes simply remain available. Costs a few MB; keeps open tabs
# alive across a deploy.
# ---------------------------------------------------------------------------
STATIC_KEEP="$APP_DIR/.next.static-keep"
if [ -d "$APP_DIR/$ACTIVE_DIST/static" ]; then
  as_app rm -rf "$STATIC_KEEP"
  as_app cp -a "$APP_DIR/$ACTIVE_DIST/static" "$STATIC_KEEP"
  echo "==> Snapshotted current static assets for open tabs"
fi

echo "==> Building into $TARGET_DIST as $APP_USER (memory capped at 6GB)"
# --max-old-space-size caps the Node heap so an OOM kills the build cleanly
# rather than the kernel OOM-killer hitting at an arbitrary moment. 6GB lets
# a *cold* build (no node_modules/.cache) complete on this box (9.9GB RAM).
# NEXT_DIST_DIR sends the build into the INACTIVE dir — on a code-only deploy
# the service is still serving $ACTIVE_DIST, so a build failure here costs
# NOTHING: we discard the half-built dir and the live site was never touched.
# DEPLOY_LOCK_HELD=1 tells next.config.js this build holds the deploy lock.
rm -rf "$APP_DIR/$TARGET_DIST"
if ! sudo -u "$APP_USER" NEXT_DIST_DIR="$TARGET_DIST" DEPLOY_LOCK_HELD=1 NODE_OPTIONS="--max-old-space-size=6144" npm run build; then
  echo "==> ❌ BUILD FAILED — live site untouched (still serving $ACTIVE_DIST)" >&2
  rm -rf "$APP_DIR/$TARGET_DIST"
  [ "$DEPS_CHANGED" = "yes" ] && [ "$WAS_ACTIVE" = "yes" ] && systemctl start egyptair
  exit 1
fi

echo "==> Fixing ownership on $TARGET_DIST"
chown -R "$APP_USER:$APP_USER" "$APP_DIR/$TARGET_DIST"

# -------------------------------------------------------------------------
# 3b. BUILD COMPLETENESS GUARD — an interrupted or collided build (killed
#     process, disk-full, a concurrent rm -rf) can leave .next with no
#     BUILD_ID or no client-reference-manifests. Such a build starts the
#     service but 500s at runtime ("client reference manifest does not
#     exist"). Verify the artifact is COMPLETE before we restart onto it;
#     roll back to the previous build if it is not.
# -------------------------------------------------------------------------
echo "==> Verifying build completeness (BUILD_ID + client manifests)"
if [ ! -s "$APP_DIR/$TARGET_DIST/BUILD_ID" ] || \
   [ -z "$(find "$APP_DIR/$TARGET_DIST/server/app" -name '*client-reference-manifest*' -print -quit 2>/dev/null)" ]; then
  echo "==> ❌ Build incomplete ($TARGET_DIST missing BUILD_ID or client manifests) — discarding; live site untouched" >&2
  rm -rf "$APP_DIR/$TARGET_DIST"
  [ "$DEPS_CHANGED" = "yes" ] && [ "$WAS_ACTIVE" = "yes" ] && systemctl start egyptair
  exit 1
fi

# -------------------------------------------------------------------------
# 4. RESTART + HEALTH-CHECK with retry. A new build needs ~5-15s to warm up.
# -------------------------------------------------------------------------
# Carry the previous build's hashed assets into the new dir so tabs opened
# before this deploy keep rendering after the flip. --no-clobber: new wins.
if [ -d "$STATIC_KEEP" ]; then
  # As the app user: $TARGET_DIST/static was written by the build, so a
  # symlink there must not become a root-owned copy into the rest of the box.
  as_app mkdir -p "$APP_DIR/$TARGET_DIST/static"
  as_app cp -an "$STATIC_KEEP/." "$APP_DIR/$TARGET_DIST/static/" 2>/dev/null || true
  as_app rm -rf "$STATIC_KEEP"
  echo "==> Carried previous static assets into $TARGET_DIST (open tabs keep working)"
fi

# THE FLIP — atomically point the service (and future runs) at the fresh dir.
# Until this line the service is still serving $ACTIVE_DIST; the restart below
# is the ONLY moment of impact, and it's a fast `next start` boot, not a build.
echo "==> Flipping active build → $TARGET_DIST"
write_active_dist "$TARGET_DIST"

echo "==> Restarting service onto $TARGET_DIST"
systemctl restart egyptair

echo "==> Health-check loop (up to $((HEALTH_MAX_ATTEMPTS * 5))s grace)"
HEALTHY="no"
for i in $(seq 1 "$HEALTH_MAX_ATTEMPTS"); do
  sleep 5
  if ! systemctl is-active --quiet egyptair; then
    echo "    [$i/$HEALTH_MAX_ATTEMPTS] service inactive — still booting"
    continue
  fi
  CODE=$(health_code)
  if [ "$CODE" = "200" ]; then
    echo "    [$i/$HEALTH_MAX_ATTEMPTS] HTTP 200 ✓ (Host: $HEALTH_HOST)"
    HEALTHY="yes"
    break
  else
    echo "    [$i/$HEALTH_MAX_ATTEMPTS] HTTP $CODE — retrying"
  fi
done

# -------------------------------------------------------------------------
# 5. ROLLBACK if the new build can't serve a 200 within the grace window.
# -------------------------------------------------------------------------
if [ "$HEALTHY" != "yes" ]; then
  echo "==> ❌ NEW BUILD UNHEALTHY — flipping back to $ACTIVE_DIST" >&2
  if [ -d "$APP_DIR/$ACTIVE_DIST" ] && [ "$ACTIVE_DIST" != "$TARGET_DIST" ]; then
    write_active_dist "$ACTIVE_DIST"
    systemctl restart egyptair
    sleep 5
    CODE=$(health_code)
    echo "==> Rollback complete — flipped back to $ACTIVE_DIST, HTTP $CODE" >&2
  else
    echo "==> No previous build dir to roll back to — debug: journalctl -u egyptair -f" >&2
  fi
  exit 1
fi

# -------------------------------------------------------------------------
# 6. SUCCESS — clean up the backup so we don't keep growing disk usage.
# -------------------------------------------------------------------------
# Record the deps hash so the next code-only deploy can skip npm ci and
# stay fully up. Retire the legacy in-place .next once we're safely running
# from a color dir (the first zero-downtime deploy migrates off it); KEEP the
# previous color dir — it's the rollback and the next build's target.
[ -n "$DEPS_NOW" ] && printf '%s\n' "$DEPS_NOW" > "$DEPS_FILE"
if [ "$TARGET_DIST" != ".next" ] && [ -d "$APP_DIR/.next" ]; then
  echo "==> Removing legacy in-place .next (now serving $TARGET_DIST)"
  rm -rf "$APP_DIR/.next"
fi

# Proactively trim the npm cache if it has ballooned past 500 MB — keeps it
# from creeping back up to the disk-full state between deploys.
CACHE_DIR="/home/$APP_USER/.npm/_cacache"
if [ -d "$CACHE_DIR" ]; then
  CACHE_KB=$(du -sk "$CACHE_DIR" 2>/dev/null | cut -f1)
  if [ "${CACHE_KB:-0}" -gt 512000 ]; then
    echo "==> npm cache is $((CACHE_KB / 1024))MB — trimming"
    rm -rf "$CACHE_DIR" 2>/dev/null || true
  fi
fi

echo "==> Disk: $(df -h --output=avail / | tail -1 | tr -d ' ') free"
# Record the success time so a near-simultaneous second deploy hits the cooldown.
date +%s > "$COOLDOWN_FILE" 2>/dev/null || true
echo "==> ✓ Deploy successful. Service active, HTTP 200. Tail logs: journalctl -u egyptair -f"

# -------------------------------------------------------------------------
# 7. RECORD THE RELEASE — lets the ops agent (src/lib/ops/agent.ts) tell
#    whether an incident predates this deploy. The server tree has no git,
#    so prefer `git describe` when available (dev/CI boxes) and otherwise
#    fall back to a UTC timestamp.
# -------------------------------------------------------------------------
# As the app user: a .git/config in the app tree can name hooks/fsmonitor
# programs, which must never run as root.
RELEASE_VALUE="$(as_app git -C "$APP_DIR" describe --always --dirty 2>/dev/null || true)"
if [ -n "$RELEASE_VALUE" ]; then
  RELEASE_VALUE="$RELEASE_VALUE $(date -u +'%Y-%m-%d %H:%M UTC') deploy.sh"
else
  RELEASE_VALUE="$(date -u +'%Y-%m-%d %H:%M UTC') deploy.sh"
fi
if command -v sqlite3 >/dev/null 2>&1 && [ -f "$APP_DIR/data/fares.db" ]; then
  # Escape single quotes for safe SQL string embedding (value is our own
  # git-describe/date output, but escape defensively regardless).
  RELEASE_VALUE_SQL="${RELEASE_VALUE//\'/\'\'}"
  as_app sqlite3 "$APP_DIR/data/fares.db" "INSERT INTO settings(key,value) VALUES('ops_last_release','${RELEASE_VALUE_SQL}') ON CONFLICT(key) DO UPDATE SET value=excluded.value" \
    2>/dev/null || echo "==> WARNING: failed to record ops_last_release (non-fatal)" >&2
else
  echo "==> WARNING: sqlite3 or data/fares.db not found — skipping ops_last_release" >&2
fi
echo "==> Recorded ops_last_release: $RELEASE_VALUE"

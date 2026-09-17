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
COOLDOWN_FILE="$APP_DIR/.last-deploy-epoch"

# Single place that performs the health request, with the real Host header.
health_code() {
  curl -sL -o /dev/null -w '%{http_code}' --max-time "$HEALTH_TIMEOUT_S" -H "Host: $HEALTH_HOST" "$HEALTH_URL" || echo "000"
}

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root (or with sudo)." >&2
  exit 1
fi

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
exec 200>"$APP_DIR/.deploy.lock"
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
# 2. BACKUP CURRENT BUILD so we can roll back if the new one is broken.
# -------------------------------------------------------------------------
BACKUP_DIR="$APP_DIR/.next.previous"
if [ -d "$APP_DIR/.next" ] && [ "$PRE_STATE" = "healthy" ]; then
  echo "==> Snapshotting current .next → .next.previous"
  rm -rf "$BACKUP_DIR"
  cp -r "$APP_DIR/.next" "$BACKUP_DIR"
fi

# -------------------------------------------------------------------------
# 3. INSTALL + BUILD as the service user so file ownership stays sane.
# -------------------------------------------------------------------------
echo "==> Stop egyptair service (it holds node_modules/next files open → ENOTEMPTY on rename)"
# `npm install` updates node_modules/next via atomic rename. If next start is
# running, the directory is busy and rename fails with ENOTEMPTY. We restart
# the service after the build completes.
WAS_ACTIVE=no
if systemctl is-active --quiet egyptair; then
  WAS_ACTIVE=yes
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
chown -R "$APP_USER:$APP_USER" "$APP_DIR/.next" "$APP_DIR/node_modules" 2>/dev/null || true

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

echo "==> Installing deps as $APP_USER"
# `npm ci` is faster + deterministic but breaks hard on any lockfile drift.
# Today's app evolves the lockfile faster than we can keep prod in lock-step,
# so prefer `npm install` which auto-heals drift. Add `--prefer-offline` to
# use the cached tarballs when possible (faster, fewer registry hits).
sudo -u "$APP_USER" npm install --no-audit --no-fund --prefer-offline

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
if [ -d "$APP_DIR/.next/static" ]; then
  rm -rf "$STATIC_KEEP"
  cp -a "$APP_DIR/.next/static" "$STATIC_KEEP"
  echo "==> Snapshotted previous static assets for open tabs"
fi

echo "==> Building as $APP_USER (memory capped at 6GB — survives cold builds)"
# --max-old-space-size caps the Node heap so an OOM kills the build cleanly
# rather than the kernel OOM-killer hitting at an arbitrary moment. 6GB lets
# a *cold* build (no node_modules/.cache) complete on this box (9.9GB RAM);
# warm builds rarely use more than 2GB so the cap doesn't cost anything.
# DEPLOY_LOCK_HELD=1 tells next.config.js this build is running under the deploy
# lock we hold above; a direct `next build` without it is refused (see config).
if ! sudo -u "$APP_USER" DEPLOY_LOCK_HELD=1 NODE_OPTIONS="--max-old-space-size=6144" npm run build; then
  echo "==> ❌ BUILD FAILED — rolling back" >&2
  if [ -d "$BACKUP_DIR" ]; then
    rm -rf "$APP_DIR/.next"
    mv "$BACKUP_DIR" "$APP_DIR/.next"
    systemctl restart egyptair
    echo "==> Restored previous .next; service restarted." >&2
  fi
  exit 1
fi

echo "==> Fixing ownership (in case anything slipped through)"
chown -R "$APP_USER:$APP_USER" "$APP_DIR/.next"

# -------------------------------------------------------------------------
# 3b. BUILD COMPLETENESS GUARD — an interrupted or collided build (killed
#     process, disk-full, a concurrent rm -rf) can leave .next with no
#     BUILD_ID or no client-reference-manifests. Such a build starts the
#     service but 500s at runtime ("client reference manifest does not
#     exist"). Verify the artifact is COMPLETE before we restart onto it;
#     roll back to the previous build if it is not.
# -------------------------------------------------------------------------
echo "==> Verifying build completeness (BUILD_ID + client manifests)"
if [ ! -s "$APP_DIR/.next/BUILD_ID" ] || \
   [ -z "$(find "$APP_DIR/.next/server/app" -name '*client-reference-manifest*' -print -quit 2>/dev/null)" ]; then
  echo "==> ❌ Build incomplete (.next missing BUILD_ID or client manifests) — rolling back" >&2
  if [ -d "$BACKUP_DIR" ]; then
    rm -rf "$APP_DIR/.next"
    mv "$BACKUP_DIR" "$APP_DIR/.next"
    chown -R "$APP_USER:$APP_USER" "$APP_DIR/.next"
    systemctl restart egyptair
    echo "==> Restored previous .next; service restarted." >&2
  else
    echo "==> No backup available — service left stopped; debug with journalctl -u egyptair" >&2
  fi
  exit 1
fi

# -------------------------------------------------------------------------
# 4. RESTART + HEALTH-CHECK with retry. A new build needs ~5-15s to warm up.
# -------------------------------------------------------------------------
echo "==> Restarting service"
# Put the previous build's hashed assets back alongside the new ones so tabs
# opened before this deploy keep rendering. --no-clobber: new build wins.
if [ -d "$STATIC_KEEP" ]; then
  cp -an "$STATIC_KEEP/." "$APP_DIR/.next/static/" 2>/dev/null || true
  chown -R "$APP_USER:$APP_USER" "$APP_DIR/.next/static"
  rm -rf "$STATIC_KEEP"
  echo "==> Restored previous static assets (open tabs keep working)"
fi

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
  echo "==> ❌ NEW BUILD UNHEALTHY — rolling back to .next.previous" >&2
  if [ -d "$BACKUP_DIR" ]; then
    systemctl stop egyptair
    rm -rf "$APP_DIR/.next"
    mv "$BACKUP_DIR" "$APP_DIR/.next"
    chown -R "$APP_USER:$APP_USER" "$APP_DIR/.next"
    systemctl start egyptair
    sleep 5
    CODE=$(health_code)
    echo "==> Rollback complete — HTTP $CODE on previous build" >&2
  else
    echo "==> No backup available — please debug manually (journalctl -u egyptair -f)" >&2
  fi
  exit 1
fi

# -------------------------------------------------------------------------
# 6. SUCCESS — clean up the backup so we don't keep growing disk usage.
# -------------------------------------------------------------------------
if [ -d "$BACKUP_DIR" ]; then
  echo "==> Cleaning up previous-build snapshot"
  rm -rf "$BACKUP_DIR"
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
RELEASE_VALUE="$(git -C "$APP_DIR" describe --always --dirty 2>/dev/null || true)"
if [ -n "$RELEASE_VALUE" ]; then
  RELEASE_VALUE="$RELEASE_VALUE $(date -u +'%Y-%m-%d %H:%M UTC') deploy.sh"
else
  RELEASE_VALUE="$(date -u +'%Y-%m-%d %H:%M UTC') deploy.sh"
fi
if command -v sqlite3 >/dev/null 2>&1 && [ -f "$APP_DIR/data/fares.db" ]; then
  # Escape single quotes for safe SQL string embedding (value is our own
  # git-describe/date output, but escape defensively regardless).
  RELEASE_VALUE_SQL="${RELEASE_VALUE//\'/\'\'}"
  sqlite3 "$APP_DIR/data/fares.db" "INSERT INTO settings(key,value) VALUES('ops_last_release','${RELEASE_VALUE_SQL}') ON CONFLICT(key) DO UPDATE SET value=excluded.value" \
    2>/dev/null || echo "==> WARNING: failed to record ops_last_release (non-fatal)" >&2
else
  echo "==> WARNING: sqlite3 or data/fares.db not found — skipping ops_last_release" >&2
fi
echo "==> Recorded ops_last_release: $RELEASE_VALUE"

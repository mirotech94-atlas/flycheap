#!/bin/bash
# Nightly SQLite backup with rotation. Designed for /etc/cron.d.
# - Uses sqlite3 .backup (consistent online snapshot, safe with WAL)
# - gzips the result
# - Keeps the last 14 days; deletes older
# - Logs to syslog so `journalctl --since today | grep fareintel-backup` works
set -euo pipefail

APP_USER="egyflights"
INSTALLED_PATH="/usr/local/sbin/flycheap-backup"

# Root runs this script, so it must come from a path only root can write: the
# app user owns $APP_DIR, and could otherwise swap this file (or rename its
# directory) and have root run whatever it planted. Install the root-owned
# copy with setup.sh and run that.
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
# The backup only reads the app's DB and writes into the app's own data dir,
# both owned by the app user, so when started as root (cron / the backup
# unit) it drops to the app user before touching anything: a symlinked
# data/backups can then only point at files the app user could already write.
#
# Being RUN as root from an app-writable path is only fixed by pointing cron
# and egyptair-backup.service at $INSTALLED_PATH. This copy can't enforce that
# (a tampered copy would not carry the check), so it warns loudly rather than
# refusing: skipping backups would make things worse, not safer.
if [ "$(id -u)" -eq 0 ]; then
  SELF="$(readlink -f -- "${BASH_SOURCE[0]}")"
  if ! path_is_root_only "$SELF" 2>/dev/null; then
    echo "WARNING: $SELF is writable by a non-root user; point cron and egyptair-backup.service at $INSTALLED_PATH" >&2
    logger -t fareintel-backup "WARNING: started as root from app-writable $SELF; repoint to $INSTALLED_PATH" || true
  fi
  exec runuser -u "$APP_USER" -- /bin/bash "$SELF" "$@"
fi

DB="/opt/egyptair-tracker/data/fares.db"
DEST="/opt/egyptair-tracker/data/backups"
KEEP=14

mkdir -p "$DEST"

STAMP=$(date +%Y-%m-%d_%H%M%S)
OUT="$DEST/fares-$STAMP.db"

logger -t fareintel-backup "starting → $OUT"

# Online backup is safe even while the app is writing; sqlite3 holds a brief
# read lock and copies pages atomically.
sqlite3 "$DB" ".backup '$OUT'"
gzip -f "$OUT"

# Rotation — keep newest $KEEP, delete the rest
ls -1t "$DEST"/fares-*.db.gz 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm --

SIZE=$(du -h "$OUT.gz" 2>/dev/null | cut -f1)
COUNT=$(ls -1 "$DEST"/fares-*.db.gz 2>/dev/null | wc -l)
logger -t fareintel-backup "complete → $SIZE, retained=$COUNT"

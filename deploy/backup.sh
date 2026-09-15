#!/bin/bash
# Nightly SQLite backup with rotation. Designed for /etc/cron.d.
# - Uses sqlite3 .backup (consistent online snapshot, safe with WAL)
# - gzips the result
# - Keeps the last 14 days; deletes older
# - Logs to syslog so `journalctl --since today | grep fareintel-backup` works
set -euo pipefail

DB="/opt/egyptair-tracker/data/fares.db"
DEST="/opt/egyptair-tracker/data/backups"
KEEP=14

mkdir -p "$DEST"
chown egyflights:egyflights "$DEST" 2>/dev/null || true

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

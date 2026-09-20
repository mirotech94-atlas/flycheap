#!/usr/bin/env bash
# Fast rebuild + restart for single-file changes, WITHOUT breaking tabs that
# are already open.
#
# Next content-hashes every chunk and deletes the previous build's files.
# A browser tab opened before the rebuild still references those filenames,
# so it 404s its own stylesheet and renders as raw HTML. Snapshot the old
# static assets, build, then restore them alongside the new ones.
#
# Also re-asserts .env.local ownership: editing it as root leaves it
# root:root mode 600, and the app runs as egyflights — it then starts
# "successfully" with NO environment at all.
set -euo pipefail

APP_DIR=/opt/egyptair-tracker
APP_USER=egyflights
KEEP="$APP_DIR/.next.static-keep"

cd "$APP_DIR"

# Build the dir the service actually reads (deploy.sh's zero-downtime flip
# points `next start` at .next.a/.next.b via .deploy-active-dist). Default to
# the legacy .next if that file is absent. NOTE: this rebuilds the LIVE dir in
# place — quick and fine for a small manual fix, but it briefly disrupts the
# running server. For a clean zero-downtime deploy use deploy/deploy.sh instead.
DIST=".next"
if [ -f "$APP_DIR/.deploy-active-dist" ]; then
  DIST="$(sed -n 's/^NEXT_DIST_DIR=//p' "$APP_DIR/.deploy-active-dist" | tail -1)"
  [ -n "$DIST" ] || DIST=".next"
fi
echo "quick-rebuild: building active dist $DIST in place"

if [ -d "$APP_DIR/$DIST/static" ]; then
  rm -rf "$KEEP"
  cp -a "$APP_DIR/$DIST/static" "$KEEP"
fi

chown -R "$APP_USER:$APP_USER" "$APP_DIR/src" "$APP_DIR/scripts" 2>/dev/null || true
sudo -u "$APP_USER" bash -lc "cd $APP_DIR && NEXT_DIST_DIR=$DIST DEPLOY_LOCK_HELD=1 node node_modules/next/dist/bin/next build"

if [ -d "$KEEP" ]; then
  cp -an "$KEEP/." "$APP_DIR/$DIST/static/" 2>/dev/null || true
  rm -rf "$KEEP"
  echo "restored previous static assets — open tabs keep working"
fi

chown -R "$APP_USER:$APP_USER" "$APP_DIR/$DIST"
chown "$APP_USER:$APP_USER" "$APP_DIR/.env.local"
chmod 600 "$APP_DIR/.env.local"

systemctl restart egyptair
sleep 7
systemctl is-active egyptair

# Prove the ENVIRONMENT loaded, not merely that the process started. A missing
# .env.local still yields an "active" unit serving 200s with no affiliate
# markers, no Stripe and no email.
probe=$(curl -s -o /dev/null -w '%{redirect_url}' -H 'Host: my.flycheap.live' \
  'http://127.0.0.1:3000/go?to=https%3A%2F%2Fwww.aviasales.com%2Fsearch%2FJFK0311CAI17112&provider=aviasales')
case "$probe" in
  *marker=*) echo "env OK — $probe" ;;
  *) echo "!! ENV NOT LOADED — /go produced no marker: $probe" >&2; exit 1 ;;
esac

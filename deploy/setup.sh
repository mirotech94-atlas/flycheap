#!/usr/bin/env bash
# Run as root on a fresh Debian 13 box. Idempotent.
set -euo pipefail

APP_USER="egyflights"
APP_DIR="/opt/egyptair-tracker"
NODE_MAJOR=22

echo "==> Creating user $APP_USER"
id -u "$APP_USER" >/dev/null 2>&1 || useradd -r -m -s /usr/sbin/nologin "$APP_USER"

echo "==> Installing Node $NODE_MAJOR.x via NodeSource"
if ! command -v node >/dev/null || ! node --version | grep -q "^v$NODE_MAJOR"; then
  apt-get update
  apt-get install -y curl ca-certificates gnupg build-essential python3
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
  apt-get install -y nodejs
fi

echo "==> Installing Caddy"
if ! command -v caddy >/dev/null; then
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | \
    gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | \
    tee /etc/apt/sources.list.d/caddy-stable.list
  apt-get update
  apt-get install -y caddy
fi

echo "==> Installing UFW"
apt-get install -y ufw
ufw --force allow 22/tcp
ufw --force allow 80/tcp
ufw --force allow 443/tcp
ufw --force enable

echo "==> Preparing $APP_DIR"
mkdir -p "$APP_DIR"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
# The app user owns the app tree, but nothing root runs may live anywhere it
# can write. deploy/ stays root-owned and read-only to it...
if [ -d "$APP_DIR/deploy" ]; then
  chown -R root:root "$APP_DIR/deploy"
  chmod -R go-w "$APP_DIR/deploy"
fi

echo "==> Installing root-run scripts outside the app tree"
# ...and, because egyflights owns $APP_DIR itself, it could still rename
# deploy/ and plant a new one. So the scripts root actually executes (via
# sudoers, cron, or by hand) are root-owned copies in /usr/local/sbin. They
# refuse to run from any path a non-root user can write. Re-run these
# installs whenever deploy/*.sh changes.
DEPLOY_SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
install -o root -g root -m 0755 "$DEPLOY_SRC/deploy.sh"        /usr/local/sbin/flycheap-deploy
install -o root -g root -m 0755 "$DEPLOY_SRC/quick-rebuild.sh" /usr/local/sbin/flycheap-quick-rebuild
install -o root -g root -m 0755 "$DEPLOY_SRC/backup.sh"        /usr/local/sbin/flycheap-backup
install -d -o root -g root -m 0700 /var/lib/flycheap-deploy

echo "==> Installing ops agent privilege boundary"
# Ops agent privilege boundary — exact commands the app user may run via sudo.
# Source is next to this script (the checkout being provisioned from), not $APP_DIR,
# which is still empty on a fresh box at this point.
SUDOERS_SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/sudoers-egyflights-ops"
visudo -cf "$SUDOERS_SRC"
install -o root -g root -m 0440 "$SUDOERS_SRC" /etc/sudoers.d/egyflights-ops

cat <<EOF

Next steps (run by hand):

  1. As root: rsync the project to $APP_DIR (or git clone), then:
       cd $APP_DIR
       sudo -u $APP_USER cp .env.example .env.local
       sudo -u $APP_USER nano .env.local       # fill AMADEUS_*, RESEND_*, etc.
       chmod 600 .env.local
       chown -R $APP_USER:$APP_USER $APP_DIR
       chown -R root:root $APP_DIR/deploy && chmod -R go-w $APP_DIR/deploy
       sudo -u $APP_USER npm ci
       DEPLOY_OWNER_TOKEN=… /usr/local/sbin/flycheap-deploy   # builds + starts

  2. Install systemd unit:
       cp deploy/egyptair.service /etc/systemd/system/
       systemctl daemon-reload
       systemctl enable --now egyptair
       journalctl -u egyptair -f      # watch logs

  3. Configure Caddy (edit hostname first):
       cp deploy/Caddyfile /etc/caddy/Caddyfile
       systemctl reload caddy

  4. Harden SSH (assuming your key is already in /root/.ssh/authorized_keys):
       cp /root/.ssh/authorized_keys /home/$APP_USER/.ssh/   # if you want SSH access as the app user
       sed -i 's/^#*PermitRootLogin.*/PermitRootLogin no/'    /etc/ssh/sshd_config
       sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
       systemctl reload ssh
EOF

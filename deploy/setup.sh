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

cat <<EOF

Next steps (run by hand):

  1. As root: rsync the project to $APP_DIR (or git clone), then:
       cd $APP_DIR
       sudo -u $APP_USER cp .env.example .env.local
       sudo -u $APP_USER nano .env.local       # fill AMADEUS_*, RESEND_*, etc.
       chmod 600 .env.local
       sudo -u $APP_USER npm ci
       sudo -u $APP_USER npm run build

  2. Install systemd unit:
       cp deploy/egyptair.service /etc/systemd/system/
       systemctl daemon-reload
       systemctl enable --now egyptair
       journalctl -u egyptair -f      # watch logs

       # Ops agent privilege boundary — exact commands the app user may run via sudo.
       install -o root -g root -m 0440 deploy/sudoers-egyflights-ops /etc/sudoers.d/egyflights-ops
       visudo -cf /etc/sudoers.d/egyflights-ops

  3. Configure Caddy (edit hostname first):
       cp deploy/Caddyfile /etc/caddy/Caddyfile
       systemctl reload caddy

  4. Harden SSH (assuming your key is already in /root/.ssh/authorized_keys):
       cp /root/.ssh/authorized_keys /home/$APP_USER/.ssh/   # if you want SSH access as the app user
       sed -i 's/^#*PermitRootLogin.*/PermitRootLogin no/'    /etc/ssh/sshd_config
       sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
       systemctl reload ssh
EOF

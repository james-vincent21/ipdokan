#!/usr/bin/env bash
# Runs ON the VPS (Ubuntu/Debian). Safe to re-run on every deploy.
set -euo pipefail
APP_DIR=/var/www/ipdokan
PUBLIC_URL="${PUBLIC_URL:-https://ipdokan.com}"

if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  apt-get update
  apt-get install -y curl ca-certificates
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
command -v nginx >/dev/null || { apt-get update; apt-get install -y nginx; }
command -v pm2 >/dev/null || npm install -g pm2

cd "$APP_DIR"
npm ci
NODE_ENV=production NEXT_PUBLIC_API_URL="$PUBLIC_URL" npx next build

cp deploy/nginx.conf /etc/nginx/sites-available/ipdokan
ln -sf /etc/nginx/sites-available/ipdokan /etc/nginx/sites-enabled/ipdokan
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx || systemctl restart nginx

PUBLIC_URL="$PUBLIC_URL" pm2 startOrReload deploy/ecosystem.config.cjs --update-env
pm2 save
pm2 startup systemd -u root --hp /root >/dev/null || true

if command -v ufw >/dev/null && ufw status | grep -q active; then
  ufw allow OpenSSH; ufw allow 'Nginx Full'
fi

sleep 3
curl -fsS http://127.0.0.1/api/health && echo && echo "Deployed: $PUBLIC_URL"

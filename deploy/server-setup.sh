#!/usr/bin/env bash
# Runs ON the VPS (Ubuntu/Debian). Safe to re-run on every deploy.
set -euo pipefail
APP_DIR=/var/www/ipdokan
PUBLIC_URL="${PUBLIC_URL:-https://ipdokan.com}"
MAINTENANCE_DIR=/var/www/ipdokan-maintenance

# deploy.sh turns the maintenance page on before copying files; it goes off when this script ends,
# whether the deploy worked or not (a failed build leaves the old version running).
mkdir -p "$MAINTENANCE_DIR"
cp "$APP_DIR/deploy/maintenance.html" "$MAINTENANCE_DIR/index.html"
trap 'rm -f "$MAINTENANCE_DIR/on"; echo "Maintenance page off"' EXIT

if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  apt-get update
  apt-get install -y curl ca-certificates
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
command -v nginx >/dev/null || { apt-get update; apt-get install -y nginx; }
command -v pm2 >/dev/null || npm install -g pm2

# Docker + Redis (deploy/docker-compose.yml). A Redis password is created once and kept in .env.
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi
systemctl enable --now docker >/dev/null
cd "$APP_DIR"
if ! grep -q '^REDIS_PASSWORD=' .env; then
  REDIS_PASSWORD_NEW="$(openssl rand -hex 24)"
  printf '\nREDIS_PASSWORD=%s\nREDIS_URL=redis://:%s@127.0.0.1:6379/0\n' "$REDIS_PASSWORD_NEW" "$REDIS_PASSWORD_NEW" >> .env
  chmod 600 .env
fi
REDIS_PASSWORD="$(grep '^REDIS_PASSWORD=' .env | tail -1 | cut -d= -f2-)" docker compose -f deploy/docker-compose.yml up -d --wait

npm ci
NODE_ENV=production NEXT_PUBLIC_API_URL="$PUBLIC_URL" npx next build

cp deploy/nginx.conf /etc/nginx/sites-available/ipdokan
ln -sf /etc/nginx/sites-available/ipdokan /etc/nginx/sites-enabled/ipdokan
rm -f /etc/nginx/sites-enabled/default
# deploy/nginx.conf is HTTP only. Copying it removes the HTTPS block certbot added, so put it back
# with the existing certificate (no new certificate is requested).
if command -v certbot >/dev/null && [ -d /etc/letsencrypt/live/ipdokan.com ]; then
  certbot install --nginx --cert-name ipdokan.com --redirect --non-interactive || echo "WARNING: certbot install failed; HTTPS may be off"
fi
nginx -t && systemctl reload nginx || systemctl restart nginx

# pm2 cannot reload a process from fork into cluster mode: recreate the API and web processes once.
for app in ipdokan-api ipdokan-web; do
  if pm2 jlist | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.exit(JSON.parse(s).some(p=>p.name===process.argv[1]&&p.pm2_env.exec_mode!=="cluster_mode")?0:1))' "$app"; then
    pm2 delete "$app"
  fi
done
PUBLIC_URL="$PUBLIC_URL" pm2 startOrReload deploy/ecosystem.config.cjs --update-env < /dev/null
pm2 save
pm2 startup systemd -u root --hp /root >/dev/null || true

if command -v ufw >/dev/null && ufw status | grep -q active; then
  ufw allow OpenSSH; ufw allow 'Nginx Full'
fi

sleep 3
curl -fsS http://127.0.0.1:4000/api/health && echo && echo "Deployed: $PUBLIC_URL"

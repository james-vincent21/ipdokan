#!/usr/bin/env bash
# Runs on YOUR Mac from the project root:  bash deploy/deploy.sh
set -euo pipefail
HOST="${HOST:-root@45.140.203.195}"
PUBLIC_URL="${PUBLIC_URL:-https://ipdokan.com}"
cd "$(dirname "$0")/.."

ssh "$HOST" 'mkdir -p /var/www/ipdokan'
rsync -az --delete \
  --exclude node_modules --exclude .next --exclude .git --exclude .DS_Store \
  --exclude '.env' --exclude '.env.*' --include '.env.example' \
  ./ "$HOST:/var/www/ipdokan/"
# The server keeps its own production .env; the local .env (dev database) is never copied over it.
ssh "$HOST" "test -f /var/www/ipdokan/.env || { echo 'Missing /var/www/ipdokan/.env on the server'; exit 1; }"
ssh "$HOST" "chmod 600 /var/www/ipdokan/.env && PUBLIC_URL='$PUBLIC_URL' bash /var/www/ipdokan/deploy/server-setup.sh"

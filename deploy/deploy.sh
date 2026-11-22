#!/usr/bin/env bash
# Runs on YOUR Mac from the project root:  bash deploy/deploy.sh
set -euo pipefail
HOST="${HOST:-root@45.140.203.195}"
PUBLIC_URL="${PUBLIC_URL:-http://45.140.203.195}"
cd "$(dirname "$0")/.."

ssh "$HOST" 'mkdir -p /var/www/ipdokan'
rsync -az --delete \
  --exclude node_modules --exclude .next --exclude .git --exclude .DS_Store \
  --exclude '.env' --exclude '.env.*' --include '.env.example' \
  ./ "$HOST:/var/www/ipdokan/"
# The local .env (MongoDB, Google, auth secret) is copied separately with owner-only permissions.
scp -p .env "$HOST:/var/www/ipdokan/.env"
ssh "$HOST" "chmod 600 /var/www/ipdokan/.env && PUBLIC_URL='$PUBLIC_URL' bash /var/www/ipdokan/deploy/server-setup.sh"

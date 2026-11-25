#!/usr/bin/env bash
# Runs on YOUR Mac from the project root:  bash deploy/deploy.sh
set -euo pipefail
HOST="${HOST:-root@45.140.203.195}"
PUBLIC_URL="${PUBLIC_URL:-https://ipdokan.com}"
cd "$(dirname "$0")/.."

# Visitors see the maintenance page from here until server-setup.sh finishes (it turns it off).
ssh "$HOST" 'mkdir -p /var/www/ipdokan /var/www/ipdokan-maintenance && touch /var/www/ipdokan-maintenance/on && echo "Maintenance page on"'
# If copying fails before server-setup.sh runs, turn the page off again.
trap '[ $? -eq 0 ] || { ssh "$HOST" "rm -f /var/www/ipdokan-maintenance/on"; echo "Deploy failed; maintenance page off"; }' EXIT
rsync -az --delete \
  --exclude node_modules --exclude .next --exclude .git --exclude .DS_Store \
  --exclude '.env' --exclude '.env.*' --include '.env.example' \
  ./ "$HOST:/var/www/ipdokan/"
# The server keeps its own production .env; the local .env (dev database) is never copied over it.
ssh "$HOST" "test -f /var/www/ipdokan/.env || { echo 'Missing /var/www/ipdokan/.env on the server'; exit 1; }"
ssh "$HOST" "chmod 600 /var/www/ipdokan/.env && PUBLIC_URL='$PUBLIC_URL' bash /var/www/ipdokan/deploy/server-setup.sh"

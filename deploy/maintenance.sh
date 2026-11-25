#!/usr/bin/env bash
# Runs on YOUR Mac from the project root. Shows or hides the "Site under maintenance" page for visitors.
#   bash deploy/maintenance.sh on      # visitors see the maintenance page
#   bash deploy/maintenance.sh off     # site is back
#   bash deploy/maintenance.sh status
# The page itself is deploy/maintenance.html; a deploy copies it to the server.
set -euo pipefail
HOST="${HOST:-root@45.140.203.195}"
FLAG=/var/www/ipdokan-maintenance/on

case "${1:-}" in
  on)
    ssh "$HOST" "test -f /var/www/ipdokan-maintenance/index.html || { echo 'Run a deploy once first, so the maintenance page is on the server.'; exit 1; }; touch $FLAG && echo 'Maintenance page ON'" ;;
  off)
    ssh "$HOST" "rm -f $FLAG && echo 'Maintenance page OFF'" ;;
  status)
    ssh "$HOST" "test -f $FLAG && echo 'Maintenance page is ON' || echo 'Maintenance page is OFF'" ;;
  *)
    echo "Usage: bash deploy/maintenance.sh on|off|status"; exit 1 ;;
esac

#!/bin/bash
# Ophelia background cron — runs via PM2 every 15 minutes.
# Handles: auto-categorization (every run) + net worth snapshots (1st of each month).
#
# Setup:
#   chmod +x ophelia-cron.sh
#   pm2 start ./ophelia-cron.sh --name ophelia-cron --cron-restart "*/15 * * * *" --no-autorestart
#   pm2 save

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Read OPHELIA_CRON_SECRET from .env.local (no hardcoded secrets)
CRON_SECRET=$(grep '^OPHELIA_CRON_SECRET=' "$SCRIPT_DIR/.env.local" | cut -d '=' -f2- | tr -d '"' | tr -d "'")

if [ -z "$CRON_SECRET" ]; then
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] ERROR: OPHELIA_CRON_SECRET not found in .env.local"
  exit 1
fi

# ── Auto-categorization (every 15 min) ───────────────────────────────
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3000/api/ophelia/categorize \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json")

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | awk 'NR>1{print prev}{prev=$0}' | head -1)
echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] categorize HTTP $HTTP_CODE — $BODY"

# ── Net worth snapshot (1st of each month only) ──────────────────────
DAY_OF_MONTH=$(date +%-d)
if [ "$DAY_OF_MONTH" -eq 1 ]; then
  NW_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3000/api/cron/net-worth-snapshot \
    -H "Authorization: Bearer $CRON_SECRET" \
    -H "Content-Type: application/json")

  NW_HTTP_CODE=$(echo "$NW_RESPONSE" | tail -1)
  NW_BODY=$(echo "$NW_RESPONSE" | awk 'NR>1{print prev}{prev=$0}' | head -1)
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] net-worth-snapshot HTTP $NW_HTTP_CODE — $NW_BODY"
fi

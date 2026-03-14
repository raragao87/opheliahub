#!/bin/bash
# Ophelia background categorization cron — runs via PM2 every 15 minutes.
# Hits the local Next.js endpoint which processes all households.
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

RESPONSE=$(curl -s -w "\n%{http_code}" -X POST http://localhost:3000/api/ophelia/categorize \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H "Content-Type: application/json")

# Split HTTP code (last line) from body (everything before last line) — macOS compatible
HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | awk 'NR>1{print prev}{prev=$0}' | head -1)

echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] HTTP $HTTP_CODE — $BODY"

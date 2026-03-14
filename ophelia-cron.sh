#!/bin/bash
# Ophelia background categorization cron script.
# Run via PM2:
#   pm2 start ./ophelia-cron.sh --name ophelia-cron --cron-restart "*/15 * * * *" --no-autorestart
#   pm2 save
curl -s -X POST http://localhost:3000/api/ophelia/categorize \
  -H "Authorization: Bearer ${OPHELIA_CRON_SECRET}" \
  -H "Content-Type: application/json" \
  | tee -a /tmp/ophelia-cron.log
echo "" >> /tmp/ophelia-cron.log

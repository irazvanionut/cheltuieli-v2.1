#!/bin/bash
# Sync Asterisk queue_log to local data directory
# Run via cron: * * * * * /opt/cheltuieli-v2.1/scripts/sync_queue_log.sh

SRC="/mnt/asterisk"
DST="/opt/cheltuieli-v2.1/data/asterisk"

mkdir -p "$DST"

# Copy queue_log (current day's active file)
if [ -f "$SRC/queue_log" ]; then
    cp "$SRC/queue_log" "$DST/queue_log"
fi

# Copy yesterday's archive (in case it just rotated)
YESTERDAY=$(date -d "yesterday" +%Y%m%d)
if [ -f "$SRC/queue_log-$YESTERDAY" ] && [ ! -f "$DST/queue_log-$YESTERDAY" ]; then
    cp "$SRC/queue_log-$YESTERDAY" "$DST/queue_log-$YESTERDAY"
fi

# Copy Master.csv (CDR history) - daily at 9 AM via separate cron
# This script handles queue_log only; Master.csv has its own cron entry

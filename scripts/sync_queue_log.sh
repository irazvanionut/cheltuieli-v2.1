#!/bin/bash
# Sync today's Asterisk queue_log to local data directory
# Run via cron: * * * * * /opt/cheltuieli-v2.1/scripts/sync_queue_log.sh

SRC="/mnt/asterisk"
DST="/opt/cheltuieli-v2.1/data/asterisk"
TODAY=$(date +%Y%m%d)

mkdir -p "$DST"

# Copy today's file
if [ -f "$SRC/queue_log-$TODAY" ]; then
    cp "$SRC/queue_log-$TODAY" "$DST/queue_log-$TODAY"
fi

# Also copy the main queue_log (current day's active file)
if [ -f "$SRC/queue_log" ]; then
    cp "$SRC/queue_log" "$DST/queue_log"
fi

#!/bin/bash
# Sync Master.csv (CDR history) from Asterisk to local data directory
# Run via cron: 0 9 * * * /opt/cheltuieli-v2.1/scripts/sync_master_csv.sh

SRC="/mnt/asterisk/cdr-csv/Master.csv"
DST="/opt/cheltuieli-v2.1/data/asterisk/Master.csv"

if [ -f "$SRC" ]; then
    cp "$SRC" "$DST"
fi

#!/bin/bash
# Script to delete old recomandari data

# Database connection (adjust these)
DB_USER="postgres"
DB_NAME="cheltuieli"
DB_HOST="localhost"

# Delete data for specific dates
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "DELETE FROM recomandari_apeluri WHERE data IN ('2026-01-01', '2026-01-03');"

# Show remaining data
echo ""
echo "Remaining data:"
psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "SELECT data, ai_model, total_conversatii FROM recomandari_apeluri ORDER BY data DESC;"

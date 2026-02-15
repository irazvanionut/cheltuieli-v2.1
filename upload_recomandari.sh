#!/bin/bash
# Script to upload orders_insights.json to the backend

BACKEND_URL="http://localhost:8000"
JSON_FILE="orders_insights.json"

echo "📤 Uploading data from ${JSON_FILE}..."
echo ""

# Upload for Ollama on 2026-01-01
echo "Uploading for Ollama, date: 2026-01-01"
RESPONSE=$(curl -s -X POST "${BACKEND_URL}/api/recomandari-apeluri?data=2026-01-01&ai_model=Ollama" \
  -H "Content-Type: application/json" \
  -d @${JSON_FILE})

echo "Response: $RESPONSE"
echo ""

# Verify upload by getting the data back
echo "Verifying uploaded data..."
curl -s "${BACKEND_URL}/api/recomandari-apeluri?data=2026-01-01&ai_model=Ollama" | jq '.conversations[0] | {conversation_index, data, ora, telefon, tip}'

echo ""
echo "✅ Done! Check the output above to see if telefon, data, ora have values (not null)"

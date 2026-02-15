#!/bin/bash
# Script to re-upload orders_insights.json to the backend

# Configuration
BACKEND_URL="http://localhost:8000"
JSON_FILE="orders_insights.json"

# Get authentication token (replace with your actual token or login credentials)
# For now, assuming you need to get a token first
echo "⚠️  Make sure you have a valid authentication token!"
echo ""

# Read token from user
read -p "Enter your auth token (or press Enter to skip): " AUTH_TOKEN

# Upload for Ollama model
echo "📤 Uploading data for Ollama model on 2026-01-01..."
if [ -n "$AUTH_TOKEN" ]; then
  curl -X POST "${BACKEND_URL}/api/recomandari-apeluri?data=2026-01-01&ai_model=Ollama" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${AUTH_TOKEN}" \
    -d @${JSON_FILE}
else
  echo "⚠️  No token provided. This might fail with 401 Unauthorized"
  curl -X POST "${BACKEND_URL}/api/recomandari-apeluri?data=2026-01-01&ai_model=Ollama" \
    -H "Content-Type: application/json" \
    -d @${JSON_FILE}
fi

echo ""
echo "✅ Upload complete!"
echo ""
echo "Now verify in the UI that telefon, data, ora are displayed correctly."

#!/bin/bash
# Verification script for Red Team Round 6 fixes

BASE_URL="https://web-production-631b7.up.railway.app"

echo "=== RED TEAM ROUND 6 FIX VERIFICATION ==="
echo ""

# 1. Health endpoint - apiConfigured field
echo "1. HEALTH ENDPOINT - apiConfigured field:"
curl -s "$BASE_URL/api/health" | jq '{apiConfigured, version, deployTimestamp}'
echo ""

# 2. Search returns sufficient results
echo "2. SEARCH FILTER - castle query (should return 15-20 maps):"
CASTLE_COUNT=$(curl -s "$BASE_URL/api/search?q=castle" | jq '.count')
echo "   Result count: $CASTLE_COUNT"
if [ "$CASTLE_COUNT" -ge 15 ]; then
    echo "   ✅ PASS - Returned $CASTLE_COUNT maps (≥15)"
else
    echo "   ❌ FAIL - Only returned $CASTLE_COUNT maps (<15)"
fi
echo ""

# 3. Download API returns redirect (302)
echo "3. DOWNLOAD API - Should return 302 redirect:"
MAP_ID=$(curl -s "$BASE_URL/api/search?q=castle" | jq -r '.maps[0].id')
echo "   Testing with map ID: $MAP_ID"
HTTP_CODE=$(curl -sI -w "%{http_code}" -o /dev/null "$BASE_URL/api/download/$MAP_ID")
CONTENT_TYPE=$(curl -sI "$BASE_URL/api/download/$MAP_ID" | grep -i "content-type" | tr -d '\r')
echo "   HTTP Status: $HTTP_CODE"
echo "   Content-Type: $CONTENT_TYPE"
if [ "$HTTP_CODE" = "302" ] || [ "$HTTP_CODE" = "301" ]; then
    echo "   ✅ PASS - Returns redirect"
else
    echo "   ❌ FAIL - Returns $HTTP_CODE (expected 302)"
fi
echo ""

# 4. 9Minecraft source name
echo "4. SOURCE NAME - 9Minecraft data quality:"
curl -s "$BASE_URL/api/search?q=castle" | jq '.maps[] | select(.source == "nineminecraft") | {title, source, sourceName, author} | select(. != null)' | head -20
echo ""

# 5. Planet Minecraft error handling
echo "5. PLANET MINECRAFT - Error reporting:"
curl -s "$BASE_URL/api/scrapers/status" | jq '.scrapers.planetminecraft'
echo ""

echo "=== VERIFICATION COMPLETE ==="

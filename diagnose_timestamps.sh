#!/bin/bash

echo "=== Diagnosing adsb2dd Timestamp Issues ==="
echo ""

API_URL="${1:-http://localhost:49155/api/dd}"

echo "1. Checking if json.now changes between consecutive API calls..."
echo "   (Making 5 calls with 2-second intervals)"
echo ""

for i in {1..5}; do
  echo "Call $i ($(date '+%H:%M:%S')):"

  response=$(curl -s "$API_URL")

  echo "$response" | jq -r '
    . as $root |
    keys[] |
    . as $hex |
    "  Aircraft \($hex): timestamp=\($root[$hex].timestamp // "N/A"), delay=\($root[$hex].delay // "N/A"), doppler=\($root[$hex].doppler // "N/A")"
  '

  echo ""
  sleep 2
done

echo ""
echo "2. Checking adsb2dd server logs for timestamp warnings..."
docker logs --tail 50 adsb2dd 2>&1 | grep -i "timestamp\|stale\|now" || echo "   No timestamp-related log entries found"

echo ""
echo "3. Checking source ADS-B server timestamp..."
echo "   (Requires server URL from your API endpoint)"

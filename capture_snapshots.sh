#!/bin/bash
# Capture tar1090 snapshots from tar1.retnode.com

# Configuration
TAR1090_URL="https://tar1.retnode.com/data/aircraft.json"
OUTPUT_DIR="./data/adsb_snapshots"
INTERVAL=1  # seconds between captures
DURATION=300  # total duration in seconds (5 minutes default)

# Parse command line argument for duration
if [ $# -eq 1 ]; then
  DURATION=$1
fi

# Create output directory
mkdir -p "$OUTPUT_DIR"

echo "Capturing ADS-B snapshots from tar1.retnode.com"
echo "Duration: ${DURATION} seconds"
echo "Output directory: $OUTPUT_DIR"
echo ""

START_TIME=$(date +%s)
END_TIME=$((START_TIME + DURATION))
COUNT=0

while [ $(date +%s) -lt $END_TIME ]; do
  TIMESTAMP=$(date +%s)000  # milliseconds (approximate)
  OUTPUT_FILE="${OUTPUT_DIR}/aircraft_${TIMESTAMP}.json"

  # Fetch and save
  if curl -s "$TAR1090_URL" > "$OUTPUT_FILE" 2>/dev/null; then
    COUNT=$((COUNT + 1))
    ELAPSED=$(($(date +%s) - START_TIME))

    # Count aircraft in this snapshot
    AIRCRAFT_COUNT=$(grep -o '"hex"' "$OUTPUT_FILE" | wc -l | tr -d ' ')

    echo -ne "\rCaptured: ${COUNT} snapshots | Elapsed: ${ELAPSED}/${DURATION}s | Aircraft: ${AIRCRAFT_COUNT}  "
  else
    echo -e "\nWarning: Failed to fetch data at $(date)"
  fi

  sleep $INTERVAL
done

echo -e "\n"
echo "Done!"
echo "Total snapshots: $COUNT"
echo "Output directory: $OUTPUT_DIR"
echo "Total size: $(du -sh $OUTPUT_DIR | cut -f1)"
echo ""
echo "Sample snapshot:"
ls -lh "$OUTPUT_DIR" | head -3

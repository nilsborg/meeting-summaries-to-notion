#!/bin/bash

LOG_FILE="/Users/nilsborg/Transscripts/debug.log"
DENO_PATH="/opt/homebrew/bin/deno"
SCRIPT_DIR="/Users/nilsborg/Transscripts"
SCRIPT_PATH="/Users/nilsborg/Transscripts/script.ts"

echo "$(date): Waiting for 20 seconds before running the Deno script..." >> "$LOG_FILE"
sleep 20

# Verify Deno path
if [ ! -x "$DENO_PATH" ]; then
    echo "$(date): Error: Deno not found at $DENO_PATH" >> "$LOG_FILE"
    exit 1
fi

# Verify script path
if [ ! -f "$SCRIPT_PATH" ]; then
    echo "$(date): Error: Deno script not found at $SCRIPT_PATH" >> "$LOG_FILE"
    exit 1
fi

echo "$(date): Running the Deno script..." >> "$LOG_FILE"
$DENO_PATH run --allow-net --allow-write="/Users/nilsborg/Transscripts/summary.txt" --allow-read="$SCRIPT_DIR" "$SCRIPT_PATH" >> "$LOG_FILE" 2>&1
echo "$(date): Finished running the Deno script." >> "$LOG_FILE"

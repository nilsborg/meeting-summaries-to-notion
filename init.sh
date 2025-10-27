#!/bin/bash

FLOW="${1:-meeting}"
LOG_FILE="/Users/nilsborg/Transscripts/debug.log"
DENO_PATH="/opt/homebrew/bin/deno"
SCRIPT_PATH="/Users/nilsborg/Transscripts/main.ts"
ENV_FILE="/Users/nilsborg/Transscripts/.env"

echo "$(date): Waiting for 20 seconds before running the Deno script (flow: $FLOW)..." >> "$LOG_FILE"
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

echo "$(date): Running the Deno script with flow '$FLOW'..." >> "$LOG_FILE"
FLOW_TYPE="$FLOW" OPENROUTER_API_KEY=$OPENROUTER_API_KEY \
  $DENO_PATH run --allow-net --allow-write --allow-run --allow-env --allow-read="." "$SCRIPT_PATH" "$FLOW" >> "$LOG_FILE" 2>&1
echo "$(date): Finished running the Deno script." >> "$LOG_FILE"

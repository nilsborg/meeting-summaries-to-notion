#!/bin/bash

TMP_SCRIPT="/Users/nilsborg/Transscripts/init.sh"
LOG_FILE="/Users/nilsborg/Transscripts/debug.log"

# Ensure the log file is writable
touch "$LOG_FILE" || { echo "Error: Cannot write to $LOG_FILE"; exit 1; }

# Execute the external script in the background using nohup
nohup "$TMP_SCRIPT" >> "$LOG_FILE" 2>&1 &
echo "$(date): Script execution has been started in the background and detached." >> "$LOG_FILE"

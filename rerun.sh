#!/bin/bash

# Navigate to the script directory
cd "$(dirname "$0")"

# Run the TypeScript rerun script with all arguments passed through
deno run --allow-all rerun.ts "$@"

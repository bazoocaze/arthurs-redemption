#!/bin/sh
# Dev server estático (PWA exige http://localhost, não file://)
PORT="${1:-8777}"
cd "$(dirname "$0")/.." || exit 1
echo "Arthur's Redemption → http://localhost:$PORT"
exec python3 -m http.server "$PORT" --bind 127.0.0.1

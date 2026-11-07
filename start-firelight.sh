#!/bin/sh
# Mac / Linux: start the Firelight control panel
cd "$(dirname "$0")/server" || exit 1
npm install --omit=dev --no-fund --no-audit --loglevel=error >/dev/null 2>&1
exec node control.js

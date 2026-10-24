#!/bin/bash
# Double-click to open Slip & Metal. Starts a quiet local server (if it isn't already running),
# opens the page, then closes this Terminal window.
DIR="$(cd "$(dirname "$0")" && pwd)"
"$DIR/dev/serve.sh" >/dev/null
open "http://127.0.0.1:4178/"
osascript -e 'tell application "Terminal" to close (every window whose name contains "STARTTHIS")' >/dev/null 2>&1 &
exit 0

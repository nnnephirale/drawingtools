#!/bin/bash
# Double-click to open Slip & Metal. Starts a quiet local server (if it isn't already running),
# opens the page, then closes this Terminal window.
DIR="$(cd "$(dirname "$0")" && pwd)"
PORT=4178
URL="http://127.0.0.1:$PORT/"

if ! curl -s -o /dev/null "$URL"; then
  cd /tmp && nohup python3 -I -c "
import functools
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
class H(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store'); super().end_headers()
    def log_message(self, *a): pass
ThreadingHTTPServer(('127.0.0.1', $PORT), functools.partial(H, directory='$DIR')).serve_forever()
" >/dev/null 2>&1 &
  disown
  for i in $(seq 1 40); do curl -s -o /dev/null "$URL" && break; sleep 0.15; done
fi

open "$URL"
osascript -e 'tell application "Terminal" to close (every window whose name contains "STARTTHIS")' >/dev/null 2>&1 &
exit 0

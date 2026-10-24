#!/bin/bash
# Starts the quiet local server for this folder on :4178 if it isn't already answering, detached so it
# outlives the terminal, and waits until it does. Used by STARTTHIS.command and before preview_start
# (the preview pane's launch.json is only a proxy to :4178: its sandbox can't read this drive).
DIR="$(cd "$(dirname "$0")/.." && pwd)"
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
curl -s -o /dev/null "$URL" && echo "serving $DIR on $URL"

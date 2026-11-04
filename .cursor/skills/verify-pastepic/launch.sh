#!/bin/sh
# Launch the verification fixture server on 127.0.0.1 and wait until ready.
# Usage: ./launch.sh [port]   (or PASTEPIC_VERIFY_PORT=8931 ./launch.sh)
set -eu
SKILL_DIR="$(cd "$(dirname "$0")" && pwd)"
PORT="${1:-${PASTEPIC_VERIFY_PORT:-8931}}"
PIDFILE="$SKILL_DIR/.fixture-server.pid"
LOGFILE="$SKILL_DIR/.fixture-server.log"

if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE")" 2>/dev/null; then
  echo "fixture server already running (pid $(cat "$PIDFILE")); refusing a second instance" >&2
  exit 1
fi

node "$SKILL_DIR/helpers/fixture-server.mjs" --port "$PORT" >"$LOGFILE" 2>&1 &
echo $! > "$PIDFILE"

for _ in $(seq 1 50); do
  if curl -sf "http://127.0.0.1:$PORT/health" >/dev/null 2>&1; then
    echo "fixture up at http://127.0.0.1:$PORT/fixture-cm5.html"
    exit 0
  fi
  sleep 0.2
done
echo "fixture server did not become ready; see $LOGFILE" >&2
kill "$(cat "$PIDFILE")" 2>/dev/null || true
rm -f "$PIDFILE"
exit 1

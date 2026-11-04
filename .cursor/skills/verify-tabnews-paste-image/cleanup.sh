#!/bin/sh
# Teardown: stop the fixture server started by launch.sh (pid file only —
# never kills by process name). Proof artifacts in artifacts/ are kept.
# Usage: ./cleanup.sh
set -eu
SKILL_DIR="$(cd "$(dirname "$0")" && pwd)"
PIDFILE="$SKILL_DIR/.fixture-server.pid"

if [ ! -f "$PIDFILE" ]; then
  echo "no fixture server pid file; nothing to stop"
else
  PID="$(cat "$PIDFILE")"
  if kill -0 "$PID" 2>/dev/null; then
    kill "$PID"
    echo "stopped fixture server (pid $PID)"
  else
    echo "pid $PID already gone"
  fi
  rm -f "$PIDFILE"
fi

if [ -d "$SKILL_DIR/artifacts" ] && [ -n "$(ls -A "$SKILL_DIR/artifacts" 2>/dev/null)" ]; then
  echo "evidence kept in $SKILL_DIR/artifacts:"
  find "$SKILL_DIR/artifacts" -type f | sort
else
  echo "no artifacts present"
fi

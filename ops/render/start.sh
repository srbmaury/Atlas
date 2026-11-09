#!/usr/bin/env bash
set -eu

uvicorn app.main:app --host 127.0.0.1 --port 8000 &
api_pid=$!

node /app/frontend/node_modules/next/dist/bin/next start /app/frontend \
    --hostname 0.0.0.0 --port "${PORT:-10000}" &
web_pid=$!

stop() {
    kill "$api_pid" "$web_pid" 2>/dev/null || true
    wait "$api_pid" "$web_pid" 2>/dev/null || true
}

trap 'stop; exit 0' TERM INT
status=0
wait -n "$api_pid" "$web_pid" || status=$?
stop
# Render should restart the container if either long-lived server exits.
exit "$((status == 0 ? 1 : status))"

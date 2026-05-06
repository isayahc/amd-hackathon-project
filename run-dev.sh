#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
UVICORN_BIN="$ROOT_DIR/.venv/bin/uvicorn"
BACKEND_HOST="127.0.0.1"
BACKEND_PORT="8000"
FRONTEND_HOST="127.0.0.1"
FRONTEND_PORT="5173"
RUN_DIR="$ROOT_DIR/.run"
LOG_DIR="$RUN_DIR/logs"
BACKEND_PID_FILE="$RUN_DIR/backend.pid"
FRONTEND_PID_FILE="$RUN_DIR/frontend.pid"

require_file() {
    local path="$1"
    local label="$2"
    if [[ ! -e "$path" ]]; then
        echo "$label not found: $path" >&2
        exit 1
    fi
}

port_in_use() {
    local port="$1"
    ss -ltn "( sport = :$port )" | tail -n +2 | grep -q .
}

kill_port_processes() {
    local port="$1"
    local pids

    pids="$({ ss -ltnp "( sport = :$port )" || true; } | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u | tr '\n' ' ')"
    if [[ -z "$pids" ]]; then
        return 0
    fi

    echo "Stopping process(es) on port $port: $pids"
    kill $pids 2>/dev/null || true

    local pid
    for pid in $pids; do
        wait "$pid" 2>/dev/null || true
    done

    if port_in_use "$port"; then
        echo "Force killing process(es) still bound to port $port: $pids"
        kill -9 $pids 2>/dev/null || true
    fi
}

require_file "$BACKEND_DIR/.env" "Backend env file"
require_file "$UVICORN_BIN" "Uvicorn executable"
require_file "$FRONTEND_DIR/package.json" "Frontend package manifest"

mkdir -p "$LOG_DIR"

if port_in_use "$BACKEND_PORT"; then
    kill_port_processes "$BACKEND_PORT"
fi

if port_in_use "$FRONTEND_PORT"; then
    kill_port_processes "$FRONTEND_PORT"
fi

rm -f "$BACKEND_PID_FILE" "$FRONTEND_PID_FILE"

echo "Starting backend on http://$BACKEND_HOST:$BACKEND_PORT"
nohup env \
    BACKEND_DIR="$BACKEND_DIR" \
    UVICORN_BIN="$UVICORN_BIN" \
    BACKEND_HOST="$BACKEND_HOST" \
    BACKEND_PORT="$BACKEND_PORT" \
    bash -lc 'cd "$BACKEND_DIR" && set -a && source .env && set +a && exec "$UVICORN_BIN" app.main:app --host "$BACKEND_HOST" --port "$BACKEND_PORT"' \
    >"$LOG_DIR/backend.log" 2>&1 < /dev/null &
backend_pid=$!
echo "$backend_pid" > "$BACKEND_PID_FILE"

echo "Starting frontend on http://$FRONTEND_HOST:$FRONTEND_PORT"
nohup env \
    FRONTEND_DIR="$FRONTEND_DIR" \
    FRONTEND_HOST="$FRONTEND_HOST" \
    FRONTEND_PORT="$FRONTEND_PORT" \
    bash -lc 'cd "$FRONTEND_DIR" && exec npm run dev -- --host "$FRONTEND_HOST" --port "$FRONTEND_PORT"' \
    >"$LOG_DIR/frontend.log" 2>&1 < /dev/null &
frontend_pid=$!
echo "$frontend_pid" > "$FRONTEND_PID_FILE"

echo "Backend PID: $backend_pid"
echo "Frontend PID: $frontend_pid"
echo "Backend log: $LOG_DIR/backend.log"
echo "Frontend log: $LOG_DIR/frontend.log"
echo "Started both services in the background."
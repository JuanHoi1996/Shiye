#!/usr/bin/env bash
# Dev stack for Shiye. UI port is fixed via SHIYE_UI_PORT (default 5174) so localStorage
# and bookmarks stay on one origin. Old Vite instances on that port are stopped on start.
set -euo pipefail
cd "$(dirname "$0")"

SHIYE_UI_PORT="${SHIYE_UI_PORT:-5174}"
API_PORT="${API_PORT:-3000}"

free_tcp_port() {
  local port="$1"
  if command -v fuser >/dev/null 2>&1; then
    if fuser "${port}/tcp" >/dev/null 2>&1; then
      echo "Port ${port} in use — stopping previous listener (fuser)..."
      fuser -k "${port}/tcp" >/dev/null 2>&1 || true
      sleep 0.4
    fi
    return
  fi
  if command -v lsof >/dev/null 2>&1; then
    local pids
    pids="$(lsof -ti ":${port}" 2>/dev/null || true)"
    if [[ -n "${pids}" ]]; then
      echo "Port ${port} in use — stopping PID(s): ${pids}"
      # shellcheck disable=SC2086
      kill ${pids} 2>/dev/null || true
      sleep 0.4
    fi
  fi
}

echo "Starting SearXNG..."
docker compose up searxng -d

free_tcp_port "${API_PORT}"

echo "Starting vane-api..."
(cd vane-api && npm run dev) &
API_PID=$!

echo "Waiting for vane-api on http://127.0.0.1:${API_PORT}/health ..."
for _ in $(seq 1 90); do
  if curl -sf "http://127.0.0.1:${API_PORT}/health" >/dev/null; then
    echo "vane-api is up."
    break
  fi
  sleep 1
done
if ! curl -sf "http://127.0.0.1:${API_PORT}/health" >/dev/null; then
  echo "Timed out waiting for vane-api; starting UI anyway."
fi

free_tcp_port "${SHIYE_UI_PORT}"

echo "Starting vane-ui on http://127.0.0.1:${SHIYE_UI_PORT} ..."
echo "  → Bookmark: http://localhost:${SHIYE_UI_PORT}"
(cd vane-ui && SHIYE_UI_PORT="${SHIYE_UI_PORT}" npm run dev) &
UI_PID=$!

cleanup() {
  kill "${API_PID}" "${UI_PID}" 2>/dev/null || true
  free_tcp_port "${SHIYE_UI_PORT}"
  docker compose stop searxng 2>/dev/null || true
}
trap cleanup EXIT INT TERM

wait "${API_PID}" "${UI_PID}"

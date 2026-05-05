#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"

echo "Starting SearXNG..."
docker compose up searxng -d

echo "Starting vane-api..."
(cd vane-api && npm run dev) &
API_PID=$!

echo "Waiting for vane-api on http://127.0.0.1:3000/health ..."
for _ in $(seq 1 90); do
  if curl -sf "http://127.0.0.1:3000/health" >/dev/null; then
    echo "vane-api is up."
    break
  fi
  sleep 1
done
if ! curl -sf "http://127.0.0.1:3000/health" >/dev/null; then
  echo "Timed out waiting for vane-api; starting UI anyway."
fi

echo "Starting vane-ui..."
(cd vane-ui && npm run dev) &
UI_PID=$!

cleanup() {
  kill "$API_PID" "$UI_PID" 2>/dev/null || true
  docker compose stop searxng 2>/dev/null || true
}
trap cleanup EXIT INT TERM

wait "$API_PID" "$UI_PID"

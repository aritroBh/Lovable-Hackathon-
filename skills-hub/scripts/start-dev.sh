#!/usr/bin/env bash
# Start Skills Hub API (:3001) + Vite (:5173). Ctrl+C stops API only if we started it.
set -euo pipefail
cd "$(dirname "$0")/.."
npm run seed:skills
lsof -ti :5173 2>/dev/null | xargs kill 2>/dev/null || true
sleep 0.2

API_PID=""
if lsof -ti :3001 >/dev/null 2>&1; then
  if curl -sf -X POST http://127.0.0.1:3001/api/tavus-conversation \
    -H 'Content-Type: application/json' -d '{"skillId":"__health__"}' \
    | grep -q 'Skill not found'; then
    echo "API already on :3001 — reusing"
  else
    echo "Replacing stale process on :3001"
    lsof -ti :3001 | xargs kill 2>/dev/null || true
    sleep 0.2
  fi
fi

if ! lsof -ti :3001 >/dev/null 2>&1; then
  node scripts/dev-api-server.mjs &
  API_PID=$!
  for _ in $(seq 1 25); do
    if curl -sf -X POST http://127.0.0.1:3001/api/tavus-conversation \
      -H 'Content-Type: application/json' -d '{"skillId":"bad"}' >/dev/null 2>&1; then
      break
    fi
    sleep 0.2
  done
fi

if [ -n "$API_PID" ]; then
  trap 'kill "$API_PID" 2>/dev/null' EXIT
  echo "API pid $API_PID → http://127.0.0.1:3001"
fi
exec npm run dev -- --port 5173 --strictPort --host 127.0.0.1

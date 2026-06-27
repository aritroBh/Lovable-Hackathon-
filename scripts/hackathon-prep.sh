#!/usr/bin/env bash
# Pre-demo smoke for Specter laptop + Skills Hub build.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== Specter test:specter =="
npm run test:specter | tail -5

echo "== Memory sidecar (if running) =="
curl -sf http://127.0.0.1:8765/health || echo "(sidecar not up — start npm run dev first)"

echo "== Skills Hub =="
cd skills-hub
API_PID=""
if ! lsof -ti :3001 >/dev/null 2>&1; then
  node scripts/dev-api-server.mjs &
  API_PID=$!
  sleep 1
else
  echo "(API already on :3001)"
fi
npm run verify:e2e
[ -n "$API_PID" ] && kill "$API_PID" 2>/dev/null || true
echo "Local hub: cd skills-hub && npm run start  → http://localhost:5173"
echo "Deploy: cd skills-hub && npx vercel deploy --prod"
echo "OK — see docs/HACKATHON_DEMO_RUNBOOK.md"

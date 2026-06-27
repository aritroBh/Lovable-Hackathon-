#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
echo "=== ghost cursor full verify ==="
npm run test:live-ghost
npm run test:adversarial-cursor
npx ts-node --transpile-only scripts/test-screen-coordinates.ts
npx ts-node --transpile-only scripts/test-replay-viewport-coords.ts
node scripts/ghost-cursor-stress-playwright.cjs
echo "=== all ghost cursor checks passed ==="

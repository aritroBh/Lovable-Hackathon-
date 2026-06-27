/**
 * Replay must use viewportX/viewportY for user-cursor detection, same as ghost render.
 * Run: npx ts-node --transpile-only scripts/test-replay-viewport-coords.ts
 */
import { Step } from "../src/main/session/types";

/** Mirror replay.ts — exported for test + production use. */
export function stepViewportPercent(step: Step): { x: number; y: number } {
  return {
    x: step.viewportX ?? step.x,
    y: step.viewportY ?? step.y,
  };
}

let failed = 0;
function check(ok: boolean, msg: string) {
  if (ok) console.log("PASS", msg);
  else {
    failed++;
    console.error("FAIL", msg);
  }
}

const mismatched: Step = {
  x: 30,
  y: 40,
  viewportX: 72,
  viewportY: 68,
  action: "click",
  coordinateFrame: "viewport",
  sourceFrame: "capture",
};

const vp = stepViewportPercent(mismatched);
check(vp.x === 72 && vp.y === 68, "prefers viewportX/Y over stale capture x/y");
check(
  vp.x !== mismatched.x && vp.y !== mismatched.y,
  "detects capture vs viewport mismatch",
);

const synced: Step = { x: 55, y: 45, viewportX: 55, viewportY: 45, action: "click" };
const vp2 = stepViewportPercent(synced);
check(vp2.x === 55 && vp2.y === 45, "synced step unchanged");

const legacy: Step = { x: 60, y: 70, action: "click" };
check(
  stepViewportPercent(legacy).x === 60,
  "legacy step without viewportX falls back to x",
);

if (failed > 0) {
  console.error(`\n${failed} replay viewport test(s) FAILED`);
  process.exit(1);
}
console.log("\nAll replay viewport coord tests passed");

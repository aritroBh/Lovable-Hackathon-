/**
 * Adversarial tests for cursor grounding / coordinate pipeline.
 * Run: npx ts-node --transpile-only scripts/test-adversarial-cursor.ts
 */
import { isLabelResolvableInVisibleSet } from "../src/main/automation/liveTargetResolver";

let failed = 0;

function check(condition: boolean, msg: string) {
  if (condition) console.log("PASS", msg);
  else {
    failed++;
    console.error("FAIL", msg);
  }
}

function mustNotResolve(label: string, visible: string[], reason: string) {
  check(
    !isLabelResolvableInVisibleSet(label, visible),
    `${reason}: "${label}" must NOT resolve in [${visible.join(", ")}]`,
  );
}

function mustResolve(label: string, visible: string[], reason: string) {
  check(
    isLabelResolvableInVisibleSet(label, visible),
    `${reason}: "${label}" should resolve in [${visible.join(", ")}]`,
  );
}

console.log("=== adversarial substring false positives ===\n");
mustNotResolve("Edit", ["Credit"], "embedded edit in credit");
mustNotResolve("File", ["Profile"], "embedded file in profile");
mustNotResolve("end", ["Recommend"], "embedded end in recommend");
mustNotResolve("Save", ["replaySavedWorkflow"], "save buried in identifier");

console.log("\n=== legitimate matches still work ===\n");
mustResolve("Create Event", ["Create Event"], "exact label");
mustResolve("Agents", ["Cursor Agents"], "whole-token substring");
mustResolve("New Agent", ["New Agent ⌘N"], "label with shortcut hint");
mustResolve("Add", ["Add to Cart"], "add as word prefix");

console.log("\n=== planner gate footguns ===\n");
check(
  !isLabelResolvableInVisibleSet("Delete Everything", []),
  "empty visible label list must not auto-approve",
);
check(
  !isLabelResolvableInVisibleSet("", ["Save"]),
  "empty target label rejected",
);

console.log("\n=== pixel-as-percent guard (screener) ===\n");
{
  // Inline mirror of screener pixelToPercent* — must not clamp raw pixels to 100
  const clamp = (v: number, lo: number, hi: number) =>
    Math.min(hi, Math.max(lo, v));
  const pixelToPercentX = (x: number, width?: number): number | null => {
    if (!width || width <= 0) return null;
    return clamp((x / width) * 100, 0, 100);
  };
  check(pixelToPercentX(842, undefined) === null, "missing width returns null not 100");
  check(
    Math.abs(pixelToPercentX(640, 1280)! - 50) < 0.01,
    "640/1280 maps to 50%",
  );
}

if (failed > 0) {
  console.error(`\n${failed} adversarial test(s) FAILED`);
  process.exit(1);
}
console.log("\nAll adversarial cursor tests passed");

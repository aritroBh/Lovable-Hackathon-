/**
 * screenCoordinates.ts behavioral tests (mocked electron.screen).
 * Run: npx ts-node --transpile-only scripts/test-screen-coordinates.ts
 */
import * as Module from "module";

const primary = {
  id: 1,
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  scaleFactor: 2,
};
const secondary = {
  id: 2,
  bounds: { x: 1920, y: 0, width: 1920, height: 1080 },
  scaleFactor: 2,
};

const origRequire = (Module as any).prototype.require;
(Module as any).prototype.require = function (
  this: NodeModule,
  ...args: [string]
) {
  const [id] = args;
  if (id === "electron") {
    return {
      screen: {
        getAllDisplays: () => [primary, secondary],
        getPrimaryDisplay: () => primary,
        getDisplayNearestPoint: (p: { x: number; y: number }) =>
          p.x >= 1920 ? secondary : primary,
        getCursorScreenPoint: () => ({ x: 960, y: 540 }),
      },
    };
  }
  return origRequire.apply(this, args);
};

let failed = 0;
function check(ok: boolean, msg: string) {
  if (ok) console.log("PASS", msg);
  else {
    failed++;
    console.error("FAIL", msg);
  }
}

async function main() {
  const sc = await import("../src/main/screenCoordinates");

  sc.setActiveCoordinateDisplay(1);

  check(sc.clampPercent(105) === 100, "clampPercent caps at 100");
  check(sc.clampPercent(-5) === 0, "clampPercent floors at 0");

  const captureMeta = {
    imageWidth: 800,
    imageHeight: 600,
    displayBounds: primary.bounds,
    captureBounds: { x: 100, y: 50, width: 800, height: 600 },
    overlayBounds: primary.bounds,
    scaleFactor: 2,
    coordinateMode: sc.COORDINATE_MODE,
    displayId: 1,
  };
  const normalized = sc.normalizeCapturedTargetToViewportPercent(
    { x: 50, y: 50, coordinateFrame: "capture" as const },
    captureMeta,
  );
  const expectedAbsX = 100 + 0.5 * 800;
  const expectedVpX = ((expectedAbsX - 0) / 1920) * 100;
  check(
    Math.abs(normalized.viewportX - expectedVpX) < 0.01,
    `capture→viewport X remap (${normalized.viewportX.toFixed(2)} ≈ ${expectedVpX.toFixed(2)})`,
  );

  const practice = sc.normalizePracticeWindowTargetToViewportPercent(
    { x: 0.5, y: 0.25 },
    { x: 200, y: 100, width: 400, height: 400 },
  );
  check(
    Math.abs(practice.viewportX - 20.833) < 0.1 &&
      Math.abs(practice.viewportY - 18.519) < 0.1,
    "practice window 0.5/0.25 fraction maps to active display viewport %",
  );
  const practicePct = sc.normalizePracticeWindowTargetToViewportPercent(
    { x: 50, y: 50 },
    { x: 0, y: 0, width: 1920, height: 1080 },
  );
  check(
    Math.abs(practicePct.viewportX - 50) < 0.01,
    "practice window 50 percent input accepted",
  );

  const center = await sc.toScreenPoint(50, 50);
  check(center.x === 960 && center.y === 540, "toScreenPoint center on primary");

  const pct = sc.screenPointToPercent(960, 540);
  check(
    Math.abs(pct.x - 50) < 0.01 && Math.abs(pct.y - 50) < 0.01,
    "screenPointToPercent round-trip at center",
  );

  const secPct = sc.screenPointToPercent(2880, 540);
  check(
    Math.abs(secPct.x - 50) < 0.01,
    "screenPointToPercent on secondary monitor",
  );

  const inside = sc.logicalPointToPercent(960, 540);
  check(inside?.x === 50 && inside?.y === 50, "logicalPointToPercent inside active display");

  sc.setActiveCoordinateDisplay(1);
  const outside = sc.logicalPointToPercent(2880, 540);
  check(outside === null, "logicalPointToPercent null outside pinned primary");

  sc.setActiveCoordinateDisplay(2);
  const onSec = sc.logicalPointToPercent(2880, 540);
  check(onSec?.x === 50 && onSec?.y === 50, "logicalPointToPercent on pinned secondary");

  if (failed > 0) {
    console.error(`\n${failed} screen-coordinates test(s) FAILED`);
    process.exit(1);
  }
  console.log("\nAll screen-coordinates tests passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

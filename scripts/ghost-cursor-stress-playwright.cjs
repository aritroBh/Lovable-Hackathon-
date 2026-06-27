#!/usr/bin/env node
/**
 * Playwright stress test: ghost cursor tip alignment vs known targets.
 * Run: node scripts/ghost-cursor-stress-playwright.cjs
 */
const { chromium } = require("../skills-hub/design/node_modules/playwright");
const { readFileSync } = require("fs");
const { join } = require("path");
const { spawn, execSync } = require("child_process");

const DEBUG_LOG = join(__dirname, "../../.cursor/debug-19c5af.log");
const HARNESS = join(__dirname, "fixtures/ghost-cursor-harness.html");
const MAX_TIP_ERROR_PX = 2;
const VIEWPORTS = [
  { name: "1280x720", width: 1280, height: 720 },
  { name: "1920x1080", width: 1920, height: 1080 },
  { name: "1440x900", width: 1440, height: 900 },
  { name: "2560x1440", width: 2560, height: 1440 },
];

const TARGETS = [
  { name: "TL", left: "8%", top: "8%" },
  { name: "TC", left: "50%", top: "8%" },
  { name: "TR", left: "92%", top: "8%" },
  { name: "ML", left: "8%", top: "50%" },
  { name: "C", left: "50%", top: "50%" },
  { name: "MR", left: "92%", top: "50%" },
  { name: "BL", left: "8%", top: "92%" },
  { name: "BC", left: "50%", top: "92%" },
  { name: "BR", left: "92%", top: "92%" },
  { name: "FLIP-X", left: "68%", top: "40%" },
  { name: "FLIP-Y", left: "40%", top: "88%" },
  { name: "FLIP-XY", left: "75%", top: "90%" },
];

let failed = 0;
const results = [];

function debugLog(hypothesisId, location, message, data) {
  const line = JSON.stringify({
    sessionId: "19c5af",
    hypothesisId,
    location,
    message,
    data,
    timestamp: Date.now(),
    runId: "ghost-cursor-stress",
  });
  require("fs").appendFileSync(DEBUG_LOG, line + "\n");
}

function pass(name, detail) {
  results.push({ name, ok: true, detail });
  console.log(`PASS ${name}: ${detail}`);
}

function fail(name, detail) {
  failed++;
  results.push({ name, ok: false, detail });
  console.error(`FAIL ${name}: ${detail}`);
}

async function runViewport(page, vp) {
  await page.setViewportSize({ width: vp.width, height: vp.height });
  const harnessHtml = readFileSync(HARNESS, "utf8");
  await page.setContent(harnessHtml, { waitUntil: "domcontentloaded" });

  const spawned = await page.evaluate((specs) => {
    return window.__GHOST_HARNESS__.spawnTargets(specs);
  }, TARGETS);

  for (const target of spawned) {
    await page.evaluate(
      ({ px, py, name }) => {
        window.__GHOST_HARNESS__.placeGhost(px, py, name, false);
      },
      { px: target.percent.x, py: target.percent.y, name: target.name },
    );

    const m = await page.evaluate((idx) => {
      return window.__GHOST_HARNESS__.measureAlignment(idx);
    }, target.id);

    const caseName = `${vp.name}/${target.name}`;
    debugLog("A", "ghost-cursor-stress-playwright.cjs:alignment", caseName, {
      viewport: vp.name,
      target: target.name,
      percent: target.percent,
      ...m,
    });

    if (m.error) {
      fail(caseName, m.error);
      continue;
    }

    if (m.distancePx > MAX_TIP_ERROR_PX) {
      fail(
        caseName,
        `tip off by ${m.distancePx.toFixed(2)}px (max ${MAX_TIP_ERROR_PX}) tip=(${m.tipPx.x.toFixed(1)},${m.tipPx.y.toFixed(1)}) target=(${m.targetCenter.x.toFixed(1)},${m.targetCenter.y.toFixed(1)})`,
      );
    } else {
      pass(caseName, `tip within ${m.distancePx.toFixed(2)}px`);
    }

    if (m.pillCoversTarget) {
      debugLog("C", "ghost-cursor-stress-playwright.cjs:pill", caseName, m);
      fail(caseName + "/pill", "intent pill covers target center");
    } else {
      pass(caseName + "/pill", "pill clear of target");
    }
  }

  // Hypothesis D: percent clamping at edges
  await page.evaluate(() => {
    window.__GHOST_HARNESS__.placeGhost(105, -5, "CLAMP", false);
  });
  const clampTip = await page.evaluate(() => window.__GHOST_HARNESS__.tipPx());
  const vw = vp.width;
  const vh = vp.height;
  const expectedClampX = vw;
  const expectedClampY = 0;
  const clampOk =
    Math.abs(clampTip.x - expectedClampX) < MAX_TIP_ERROR_PX &&
    Math.abs(clampTip.y - expectedClampY) < MAX_TIP_ERROR_PX;
  debugLog("E", "ghost-cursor-stress-playwright.cjs:clamp", vp.name, {
    clampTip,
    expected: { x: expectedClampX, y: expectedClampY },
  });
  if (clampOk) {
    pass(`${vp.name}/clamp`, "out-of-range coords clamped correctly");
  } else {
    fail(
      `${vp.name}/clamp`,
      `clamp tip (${clampTip.x},${clampTip.y}) expected (~${expectedClampX},~${expectedClampY})`,
    );
  }
}

async function runSpringSettleTest(page) {
  await page.setViewportSize({ width: 1280, height: 720 });
  const harnessHtml = readFileSync(HARNESS, "utf8");
  await page.setContent(harnessHtml);

  // Inline minimal spring mirror (same constants as useGhostSpring)
  const springResult = await page.evaluate(async () => {
    const stiffness = 170;
    const damping = 26;
    const restDelta = 0.05;
    const clamp = (v) => Math.min(100, Math.max(0, v));
    let x = 10;
    let y = 10;
    let vx = 0;
    let vy = 0;
    const tx = 75;
    const ty = 60;
    const frames = [];
    for (let i = 0; i < 300; i++) {
      const dt = 1 / 60;
      for (const [pos, vel, goal] of [
        [x, vx, tx],
        [y, vy, ty],
      ]) {
        /* handled below */
      }
      const ax = -stiffness * (x - tx) - damping * vx;
      const ay = -stiffness * (y - ty) - damping * vy;
      vx += ax * dt;
      vy += ay * dt;
      x += vx * dt;
      y += vy * dt;
      const settled =
        Math.abs(vx) <= restDelta &&
        Math.abs(vy) <= restDelta &&
        Math.abs(x - tx) <= restDelta &&
        Math.abs(y - ty) <= restDelta;
      if (i % 10 === 0) frames.push({ i, x, y, settled });
      if (settled) {
        window.__GHOST_HARNESS__.placeGhost(x, y, "SPRING", false);
        return {
          settledAt: i,
          final: { x, y },
          target: { x: tx, y: ty },
          err: Math.hypot(x - tx, y - ty),
        };
      }
    }
    return { settledAt: -1, final: { x, y }, target: { x: tx, y: ty }, err: 999 };
  });

  debugLog("D", "ghost-cursor-stress-playwright.cjs:spring", "spring-settle", springResult);
  if (springResult.settledAt >= 0 && springResult.err <= 0.05) {
    pass("spring/settle", `settled frame ${springResult.settledAt} err=${springResult.err.toFixed(4)}%`);
  } else {
    fail("spring/settle", JSON.stringify(springResult));
  }
}

function killPort(port) {
  try {
    execSync(`lsof -ti :${port} | xargs kill -9 2>/dev/null`, {
      stdio: "ignore",
    });
  } catch (_) {}
}

async function waitForUrl(url, ms = 30000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`${url} not ready after ${ms}ms`);
}

async function ensureViteServer() {
  const base = "http://localhost:5199";
  try {
    const r = await fetch(`${base}/ghost-cursor-test.html`);
    if (r.ok) return { base, child: null };
  } catch (_) {}
  killPort(5199);
  await new Promise((r) => setTimeout(r, 300));
  const child = spawn("npx", ["vite", "--config", "vite.ghost-test.config.ts"], {
    cwd: join(__dirname, ".."),
    stdio: "ignore",
    detached: true,
  });
  child.unref();
  await waitForUrl(`${base}/ghost-cursor-test.html`, 30000);
  return { base, child };
}

async function runPageIntegration(page, htmlPath, globalKey, label, serverBase) {
  const DEV = `${serverBase}/${htmlPath}`;
  await page.goto(DEV, { waitUntil: "networkidle" });
  await page.waitForFunction(
    (key) => window[key]?.targetCount > 0,
    globalKey,
  );
  const count = await page.evaluate(
    (key) => window[key].targetCount,
    globalKey,
  );
  for (let i = 0; i < count; i++) {
    await page.evaluate(
      ({ key, idx }) => window[key].gotoTarget?.(idx) ?? window[key].showAt?.(idx),
      { key: globalKey, idx: i },
    );
    if (globalKey === "__WALKTHROUGH_TEST__") {
      await page.waitForFunction(
        ({ key, idx }) => {
          const m = window[key].measureRing(idx);
          return !m.error && m.distancePx <= 4;
        },
        { key: globalKey, idx: i },
        { timeout: 3000 },
      );
    }
    let m;
    if (globalKey === "__GHOST_INTEGRATION__") {
      m = await waitForSpringSettle(page, i, globalKey);
    } else if (globalKey === "__GHOST_PREVIEW__") {
      m = await page.evaluate(
        ({ key, idx }) => window[key].measureTip(idx),
        { key: globalKey, idx: i },
      );
    } else {
      m = await page.evaluate(
        ({ key, idx }) => window[key].measureRing(idx),
        { key: globalKey, idx: i },
      );
    }
    const caseName = `${label}/${i}`;
    debugLog("B", "ghost-cursor-stress-playwright.cjs:page", caseName, m);
    if (m.error) {
      fail(caseName, m.error);
      continue;
    }
    const maxPx = globalKey === "__WALKTHROUGH_TEST__" ? 4 : MAX_TIP_ERROR_PX;
    if (m.distancePx > maxPx) {
      fail(caseName, `off by ${m.distancePx.toFixed(2)}px (max ${maxPx})`);
    } else {
      pass(caseName, `within ${m.distancePx.toFixed(2)}px`);
    }
    if (globalKey === "__GHOST_INTEGRATION__" && m.pillCoversTarget) {
      fail(caseName + "/pill", "pill covers target");
    } else if (globalKey === "__GHOST_INTEGRATION__") {
      pass(caseName + "/pill", "pill clear");
    }
    if (globalKey === "__WALKTHROUGH_TEST__" && m.usedViewportNotRaw === false) {
      fail(caseName + "/viewport", "must use viewportX not raw x/y");
    } else if (globalKey === "__WALKTHROUGH_TEST__") {
      pass(caseName + "/viewport", "viewportX precedence ok");
    }
  }
}

async function waitForSpringSettle(page, index, globalKey = "__GHOST_INTEGRATION__") {
  const start = Date.now();
  let last = null;
  while (Date.now() - start < 4000) {
    const m = await page.evaluate(
      ({ key, idx }) => window[key].measureTip(idx),
      { key: globalKey, idx: index },
    );
    last = m;
    if (m.error) return m;
    if (m.distancePx <= MAX_TIP_ERROR_PX) return m;
    await page.waitForTimeout(50);
  }
  return last || { error: "timeout" };
}

async function runReactIntegration(page, serverBase) {
  await runPageIntegration(
    page,
    "ghost-cursor-test.html",
    "__GHOST_INTEGRATION__",
    "react",
    serverBase,
  );
}

async function main() {
  console.log("=== Ghost Cursor Playwright Stress ===\n");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  for (const vp of VIEWPORTS) {
    await runViewport(page, vp);
  }
  await runSpringSettleTest(page);

  let viteChild = null;
  let base = process.env.GHOST_TEST_URL?.replace(/\/[^/]*$/, "");
  if (!base) {
    const s = await ensureViteServer();
    base = s.base;
    viteChild = s.child;
  }

  console.log("\n--- React GhostActionPlayer integration ---\n");
  await runReactIntegration(page, base);
  console.log("\n--- TargetPreviewGhost (useGhostTravel) ---\n");
  await runPageIntegration(
    page,
    "ghost-preview-test.html",
    "__GHOST_PREVIEW__",
    "preview",
    base,
  );
  console.log("\n--- WalkthroughGuide viewport precedence ---\n");
  await runPageIntegration(
    page,
    "walkthrough-guide-test.html",
    "__WALKTHROUGH_TEST__",
    "guide",
    base,
  );

  if (viteChild) killPort(5199);

  await browser.close();

  console.log("\n--- summary ---");
  const passCount = results.filter((r) => r.ok).length;
  const failCount = results.filter((r) => !r.ok).length;
  console.log(`passed: ${passCount}, failed: ${failCount}`);
  debugLog("SUMMARY", "ghost-cursor-stress-playwright.cjs", "done", {
    passCount,
    failCount,
    failedCases: results.filter((r) => !r.ok).map((r) => r.name),
  });

  if (failed > 0) process.exit(1);
  console.log("\nAll ghost cursor stress tests passed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

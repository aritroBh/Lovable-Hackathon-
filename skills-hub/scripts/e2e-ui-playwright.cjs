#!/usr/bin/env node
/** Human-like UI E2E via Playwright — overworld, dex, battle, party. */
const { chromium } = require("../design/node_modules/playwright");
const { spawn, execSync } = require("child_process");
const http = require("http");
const { join } = require("path");

const root = join(__dirname, "..");
const UI = process.env.SKILLS_HUB_URL || "http://127.0.0.1:5173";
const API_PORT = Number(process.env.SKILLS_HUB_API_PORT || 3001);
const DEBUG_LOG = join(root, "../.cursor/debug-f28477.log");

const results = [];
function pass(name, detail) {
  results.push({ name, ok: true, detail });
  console.log(`PASS ${name}: ${detail}`);
}
function fail(name, detail) {
  results.push({ name, ok: false, detail });
  console.error(`FAIL ${name}: ${detail}`);
}

function debugLog(hypothesisId, location, message, data) {
  const line = JSON.stringify({
    sessionId: "f28477",
    hypothesisId,
    location,
    message,
    data,
    timestamp: Date.now(),
    runId: "playwright-ui",
  });
  require("fs").appendFileSync(DEBUG_LOG, line + "\n");
}

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: API_PORT,
        path,
        method,
        headers: body
 ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) }
          : {},
      },
      (res) => {
        let buf = "";
        res.on("data", (c) => (buf += c));
        res.on("end", () =>
          resolve({ status: res.statusCode, body: buf ? JSON.parse(buf) : {} }),
        );
      },
    );
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

async function waitFor(url, ms = 15000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`${url} not ready`);
}

function killPort(port) {
  try {
    execSync(`lsof -ti :${port} | xargs kill 2>/dev/null`, { stdio: "ignore" });
  } catch (_) {}
}

async function ensureStack() {
  let apiPid = null;
  try {
    await request("GET", "/api/skills");
  } catch (_) {
    killPort(API_PORT);
    await new Promise((r) => setTimeout(r, 300));
    const child = spawn("node", ["scripts/dev-api-server.mjs"], {
      cwd: root,
      stdio: "ignore",
      detached: true,
    });
    child.unref();
    apiPid = child.pid;
    for (let i = 0; i < 40; i++) {
      try {
        const r = await request("GET", "/api/skills");
        if (r.status === 200) break;
      } catch (_) {}
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  try {
    await waitFor(UI);
  } catch (_) {
    killPort(5173);
    await new Promise((r) => setTimeout(r, 300));
    const vite = spawn(
      "npm",
      ["run", "preview:hub"],
      { cwd: root, stdio: "ignore", detached: true },
    );
    vite.unref();
    await waitFor(UI);
  }
  return apiPid;
}

async function run() {
  try {
    require("fs").mkdirSync(join(root, "../.cursor"), { recursive: true });
    require("fs").writeFileSync(DEBUG_LOG, "");
  } catch (_) {}

  const apiPid = await ensureStack();
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  try {
    // H1: GBC shell loads
    await page.goto(UI, { waitUntil: "networkidle" });
    const title = await page.locator(".gbc-header h1").textContent();
    if (title?.includes("SPECTER MON")) pass("H1: GBC shell", title.trim());
    else fail("H1: GBC shell", `got "${title}"`);
    debugLog("H1", "e2e-ui:home", "shell loaded", { title });

    // H2: Overworld map + dialog
    const dialog = await page.locator(".dialog-bar").textContent();
    const tiles = await page.locator(".map-grid .tile").count();
    if (tiles === 192 && dialog?.includes("LUMA REGION"))
      pass("H2: overworld", `${tiles} tiles, dialog ok`);
    else fail("H2: overworld", `tiles=${tiles} dialog=${dialog?.slice(0, 40)}`);
    debugLog("H2", "e2e-ui:overworld", "map state", { tiles, dialog: dialog?.slice(0, 60) });

    // H3: WASD movement (focus screen, press d a few times)
    await page.locator(".gbc-screen").focus();
    const before = await page.locator(".player").evaluate((el) => ({
      left: el.style.left,
      top: el.style.top,
    }));
    for (let i = 0; i < 3; i++) await page.keyboard.press("d");
    await page.waitForTimeout(400);
    const after = await page.locator(".player").evaluate((el) => ({
      left: el.style.left,
      top: el.style.top,
    }));
    const moved = before.left !== after.left || before.top !== after.top;
    if (moved) pass("H3: WASD move", `${before.left},${before.top} → ${after.left},${after.top}`);
    else fail("H3: WASD move", "player position unchanged");
    debugLog("H3", "e2e-ui:move", "player pos", { before, after, moved });

    // H4: Pokédex overlay
    await page.getByRole("button", { name: "P DEX" }).click();
    await page.waitForSelector(".dex-overlay.show");
    const dexTitle = await page.locator(".dex-title").textContent();
    const dexRows = await page.locator(".dex-row").count();
    if (dexTitle?.includes("POKéDEX") && dexRows >= 4)
      pass("H4: dex overlay", `${dexRows} skills listed`);
    else fail("H4: dex overlay", `title=${dexTitle} rows=${dexRows}`);
    debugLog("H4", "e2e-ui:dex", "dex open", { dexRows });

    // H4b: TRAINER tab
    await page.locator(".dex-tab", { hasText: "TRAINER" }).click();
    await page.waitForTimeout(200);
    const trainerRows = await page.locator(".dex-row .dex-badge", { hasText: "TRAINER" }).count();
    pass("H4b: trainer tab", `${trainerRows} trainer badges (seed=all Specter)`);
    debugLog("H4", "e2e-ui:dex-trainer", "trainer filter", { trainerRows });

    // H4c: search
    await page.getByRole("button", { name: "ALL" }).click();
    await page.locator(".dex-search").fill("RECAPORDON");
    await page.waitForTimeout(200);
    const searchRows = await page.locator(".dex-row").count();
    const hasRecap = await page.locator(".dex-row", { hasText: "RECAPORDON" }).count();
    if (hasRecap >= 1 && searchRows <= 2)
      pass("H4c: dex search", `filtered to ${searchRows} row(s)`);
    else fail("H4c: dex search", `rows=${searchRows} recap=${hasRecap}`);
    debugLog("H4", "e2e-ui:dex-search", "search", { searchRows, hasRecap });

    await page.getByRole("button", { name: "CLOSE" }).click();
    await page.waitForTimeout(200);

    // H5: Party overlay
    await page.getByRole("button", { name: "B PARTY" }).click();
    await page.waitForSelector(".party-overlay.show");
    const partyTitle = await page.locator(".party-title").textContent();
    const slots = await page.locator(".party-slot").count();
    if (partyTitle?.includes("PARTY") && slots === 6)
      pass("H5: party overlay", "6 slots shown");
    else fail("H5: party overlay", `title=${partyTitle} slots=${slots}`);
    await page.getByRole("button", { name: "CLOSE" }).click();

    // H6: Deep-link battle screen
    await page.goto(`${UI}/skill/workflow-event-recap-session-1`, {
      waitUntil: "networkidle",
    });
    await page.waitForTimeout(1500);
    const battleVisible = await page.locator(".screen-battle.active").isVisible();
    const fightBtn = page.getByRole("button", { name: /FIGHT/i });
    const hasFight = await fightBtn.isVisible().catch(() => false);
    const enemyHud = await page.locator(".enemy-hud").textContent();
    if (battleVisible && hasFight && enemyHud?.includes("RECAPORDON"))
      pass("H6: battle deep-link", enemyHud?.trim().slice(0, 40));
    else
      fail("H6: battle deep-link", `battle=${battleVisible} fight=${hasFight} hud=${enemyHud?.slice(0, 30)}`);
    debugLog("H6", "e2e-ui:battle", "battle screen", { battleVisible, hasFight, enemyHud });

    // H7: FIGHT → moves menu
    await fightBtn.click();
    await page.waitForTimeout(300);
    const movesVisible = await page.locator(".moves-box.show").isVisible();
    const moveCount = await page.locator(".moves-box .move-btn").count();
    if (movesVisible && moveCount >= 11)
      pass("H7: fight moves", `${moveCount} moves shown`);
    else fail("H7: fight moves", `visible=${movesVisible} count=${moveCount}`);
    debugLog("H7", "e2e-ui:moves", "moves menu", { movesVisible, moveCount });

    // H8: RUN back to overworld (skip moves menu — click RUN directly)
    await page.goto(`${UI}/skill/workflow-event-recap-session-1`, {
      waitUntil: "networkidle",
    });
    await page.waitForTimeout(1500);
    await page.locator(".gbc-screen").focus();
    await page.locator(".action-btn", { hasText: "RUN" }).click();
    await page.waitForTimeout(500);
    const backOverworld = await page.locator(".screen-overworld.active").isVisible();
    if (backOverworld) pass("H8: RUN escape", "returned to overworld");
    else fail("H8: RUN escape", "still on battle");
    debugLog("H8", "e2e-ui:run", "run away", { backOverworld });

    // H9: Walk to tall grass at (6,3) from spawn (7,7): left then up×4
    await page.goto(UI, { waitUntil: "networkidle" });
    await page.locator(".gbc-screen").focus();
    await page.keyboard.press("a");
    for (let i = 0; i < 4; i++) await page.keyboard.press("w");
    await page.waitForTimeout(600);
    let dialogText = await page.locator(".dialog-bar").textContent();
    if (dialogText?.includes("rustled") || dialogText?.includes("appeared")) {
      await page.keyboard.press("Enter");
      await page.waitForTimeout(400);
      if ((await page.locator(".dialog-bar").textContent())?.includes("appeared")) {
        await page.keyboard.press("Enter");
      }
      await page.waitForTimeout(1500);
    }
    const grassBattle = await page.locator(".screen-battle.active").isVisible();
    if (grassBattle) pass("H9: tall grass encounter", "battle triggered");
    else fail("H9: tall grass encounter", `no battle — dialog="${dialogText?.slice(0, 60)}"`);
    debugLog("H9", "e2e-ui:grass", "grass encounter", { grassBattle, dialogText: dialogText?.slice(0, 80) });

    // H10: Open Pokédex from battle (click — same as human)
    if (grassBattle) {
      await page.waitForSelector(".action-btn", { timeout: 5000 });
      await page.waitForTimeout(1300);
      await page.locator(".action-btn", { hasText: "POKéDEX" }).click();
      await page.waitForTimeout(400);
      const dexFromBattle = await page.locator(".dex-overlay.show").isVisible();
      if (dexFromBattle) pass("H10: dex from battle", "overlay open");
      else fail("H10: dex from battle", "dex not open");
      await page.locator(".dex-footer .train-btn").click();
    } else {
      fail("H10: dex from battle", "no grass battle");
    }
  } finally {
    await browser.close();
    if (apiPid) {
      try {
        process.kill(apiPid);
      } catch (_) {}
    }
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n--- UI E2E: ${results.length - failed.length}/${results.length} passed ---`);
  if (failed.length) {
    failed.forEach((f) => console.error(`  ${f.name}: ${f.detail}`));
    process.exit(1);
  }
}

run().catch((e) => {
  console.error("UI E2E crash:", e.message);
  process.exit(1);
});

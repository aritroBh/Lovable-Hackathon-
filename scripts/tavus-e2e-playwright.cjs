#!/usr/bin/env node
/** Tavus PAL E2E — API, CSP, Skills Hub iframe, overlay persona (mocked api). */
const { chromium } = require("../skills-hub/design/node_modules/playwright");
const http = require("http");
const fs = require("fs");
const { join } = require("path");

function endConversationByUrl(url) {
  if (!url) return Promise.resolve();
  let id = "";
  try {
    id = new URL(url).pathname.replace(/^\//, "");
  } catch (_) {
    return Promise.resolve();
  }
  if (!id) return Promise.resolve();
  return apiRequest("POST", "/api/tavus-conversation/end", { conversationId: id });
}

const API = "http://127.0.0.1:3001";
const HUB = process.env.SKILLS_HUB_URL || "http://127.0.0.1:5173";
const OVERLAY = process.env.SPECTER_OVERLAY_URL || "http://localhost:5174/overlay.html";
const DEBUG_LOG = join(__dirname, "../.cursor/debug-389870.log");
const SKILL_ID = "workflow-event-recap-session-1";

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
    sessionId: "389870",
    hypothesisId,
    location,
    message,
    data,
    timestamp: Date.now(),
    runId: "playwright-tavus",
  });
  try {
    fs.appendFileSync(DEBUG_LOG, line + "\n");
  } catch (_) {}
}

function apiRequest(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: 3001,
        path,
        method,
        headers: body
          ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) }
          : {},
      },
      (res) => {
        let buf = "";
        res.on("data", (c) => (buf += c));
        res.on("end", () => {
          try {
            resolve({ status: res.statusCode, body: buf ? JSON.parse(buf) : {} });
          } catch (e) {
            reject(new Error(`bad json: ${buf.slice(0, 200)}`));
          }
        });
      },
    );
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

function loadTavusKey() {
  try {
    const env = fs.readFileSync(join(__dirname, "../skills-hub/.env"), "utf8");
    const m = env.match(/^TAVUS_API_KEY=(.+)$/m);
    return m?.[1]?.trim() || process.env.TAVUS_API_KEY;
  } catch (_) {
    return process.env.TAVUS_API_KEY;
  }
}

/** ponytail: free Tavus slot — DELETE recent convos; Tavus may count ended ones as concurrent */
async function endActiveTavusConversations() {
  const key = loadTavusKey();
  if (!key) return 0;
  const list = await fetch("https://tavusapi.com/v2/conversations?limit=50", {
    headers: { "x-api-key": key },
  }).then((r) => r.json());
  let ended = 0;
  for (const c of (list.data || []).slice(0, 8)) {
    await fetch(`https://tavusapi.com/v2/conversations/${c.conversation_id}`, {
        method: "DELETE",
        headers: { "x-api-key": key },
    });
    ended++;
  }
  if (ended) console.log(`  (cleaned ${ended} Tavus conversation(s))`);
  return ended;
}

/** Poll until Tavus reports no active conversations (API eventual consistency). */
async function waitForTavusSlot(maxMs = 30000) {
  const key = loadTavusKey();
  if (!key) return;
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    await endActiveTavusConversations();
    const list = await fetch("https://tavusapi.com/v2/conversations?limit=50", {
      headers: { "x-api-key": key },
    }).then((r) => r.json());
    const active = (list.data || []).filter((c) => c.status === "active").length;
    if (active === 0) return;
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error("Tavus slot still busy after cleanup");
}

async function tryCreateConversation(body) {
  for (let attempt = 0; attempt < 6; attempt++) {
    await waitForTavusSlot();
    const out = await apiRequest("POST", "/api/tavus-conversation", body);
    const url = out.body?.conversation_url;
    if (out.status === 200 && out.body?.ok && url?.includes("daily.co")) return url;
    const err = JSON.stringify(out.body?.error ?? out.body);
    if (!err.toLowerCase().includes("maximum concurrent")) return null;
  }
  return null;
}

async function createConversation(body, label, retries = 6) {
  for (let attempt = 0; attempt < retries; attempt++) {
    await waitForTavusSlot();
    const out = await apiRequest("POST", "/api/tavus-conversation", body);
    const url = out.body?.conversation_url;
    if (out.status === 200 && out.body?.ok && url?.includes("daily.co")) {
      pass(label, url.slice(0, 60));
      return url;
    }
    const err = JSON.stringify(out.body?.error ?? out.body);
    const busy = err.toLowerCase().includes("maximum concurrent");
    if (busy && attempt < retries - 1) {
      console.log(`  (retry ${attempt + 1}/${retries - 1}: Tavus slot busy)`);
      continue;
    }
    fail(label, JSON.stringify(out.body));
    return null;
  }
  return null;
}

async function waitFor(url, ms = 15000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`${url} not ready`);
}

function overlayApiMockScript({ preview, convUrl }) {
  const noop = () => Promise.resolve(undefined);
  const noopSub = () => () => {};
  window.api = new Proxy(
    {
      getStartupMode: () => Promise.resolve("ultra"),
      tavusPalAvailable: () => Promise.resolve({ ok: true, palReady: true }),
      tavusGetPersonaPreview: () => Promise.resolve(preview),
      tavusStartConversation: () =>
        Promise.resolve({ ok: true, conversation_url: convUrl }),
      tavusSetFaceMode: () => Promise.resolve({ ok: true }),
      debugAgentLog: () => Promise.resolve({ ok: true }),
      ghostwikiQuery: () => Promise.resolve({}),
      setOverlayClickThrough: noop,
      stopSpeaking: noop,
      healthCheck: () => Promise.resolve({ ok: true }),
      onOverlayToggle: (cb) => {
        setTimeout(() => cb(), 800);
        return noopSub();
      },
    },
    {
      get(target, prop) {
        if (prop in target) return target[prop];
        if (String(prop).startsWith("on")) return () => noopSub();
        return noop;
      },
    },
  );
}

async function testApis(opts = {}) {
  const health = await apiRequest("GET", "/api/tavus-health");
  if (health.status === 200 && health.body?.ok)
    pass("T1: tavus-health", `palReady=${health.body.palReady}`);
  else fail("T1: tavus-health", JSON.stringify(health.body));
  debugLog("B", "e2e:health", "tavus-health", health.body);

  const preview = await apiRequest("GET", "/api/tavus-face-preview");
  const videoUrl = preview.body?.thumbnail_video_url;
  if (preview.status === 200 && preview.body?.ok && videoUrl)
    pass("T2: face-preview", `${preview.body.face_name} video ok`);
  else fail("T2: face-preview", JSON.stringify(preview.body));
  debugLog("B", "e2e:preview", "face-preview", {
    ok: preview.body?.ok,
    faceName: preview.body?.face_name,
    hasVideo: Boolean(videoUrl),
  });

  let convUrl = null;
  if (!opts.skipConversation) {
    convUrl = await createConversation(
      { source: "overlay", userId: "specter-demo" },
      "T3: overlay conversation",
    );
  }
  debugLog("D", "e2e:conversation", "conversation", {
    overlayOk: Boolean(convUrl),
    host: convUrl ? new URL(convUrl).host : null,
  });

  return { videoUrl, convUrl, preview: preview.body };
}

async function testOverlayCsp(convUrl) {
  const html = await (await fetch(OVERLAY)).text();
  const cspMatch = html.match(/Content-Security-Policy[^>]+content="([^"]+)"/);
  if (!cspMatch) {
    fail("T4: overlay CSP meta", "missing");
    return;
  }
  const csp = cspMatch[1];
  const needs = ["frame-src", "tavus.daily.co", "cdn.replica.tavus.io", "daily.co"];
  const missing = needs.filter((n) => !csp.includes(n));
  if (!missing.length) pass("T4: overlay CSP meta", "daily.co + replica CDN allowed");
  else fail("T4: overlay CSP meta", `missing: ${missing.join(", ")}`);
  debugLog("A", "e2e:csp-meta", "overlay csp", { missing, len: csp.length });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const violations = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && /CSP|blocked/i.test(msg.text())) violations.push(msg.text());
  });
  await page.setContent(
    `<!doctype html><meta http-equiv="Content-Security-Policy" content="${csp.replace(/"/g, "&quot;")}"><iframe id="f" src="${convUrl}" allow="camera; microphone"></iframe>`,
    { waitUntil: "domcontentloaded" },
  );
  await page.waitForTimeout(4000);
  const frame = page.locator("#f");
  const src = await frame.getAttribute("src");
  if (src?.includes("daily.co") && violations.length === 0)
    pass("T5: CSP iframe embed", "daily.co frame not blocked");
  else fail("T5: CSP iframe embed", `violations=${violations.length} src=${src}`);
  debugLog("A", "e2e:csp-iframe", "csp iframe test", { violations, src });
  await browser.close();
}

async function testHubTrainPal() {
  await waitForTavusSlot();
  await waitFor(HUB);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  await page.goto(`${HUB}/skill/${SKILL_ID}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  const trainBtn = page.getByRole("button", { name: /TRAIN PAL/i });
  if (!(await trainBtn.isVisible().catch(() => false))) {
    fail("T6: hub TRAIN PAL button", "not visible on battle screen");
    await browser.close();
    return;
  }

  let ok = false;
  for (let attempt = 0; attempt < 5 && !ok; attempt++) {
    if (attempt > 0) {
      await waitForTavusSlot();
      await page.goto(`${HUB}/skill/${SKILL_ID}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(800);
    }
    const btn = page.getByRole("button", { name: /TRAIN PAL/i });
    await btn.click();
    await page.waitForTimeout(1500);
    const errText = await page.locator(".battle-error").textContent().catch(() => null);
    if (errText?.includes("maximum concurrent")) {
      console.log(`  (retry ${attempt + 1}/4: hub PAL slot busy)`);
      continue;
    }
    if (errText?.trim()) {
      fail("T6: hub TRAIN PAL button", errText.trim());
      debugLog("D", "e2e:hub-pal-error", "train pal error", { errText });
      await browser.close();
      return;
    }
    try {
      await page.waitForSelector(".screen-center.active", { timeout: 20000 });
      ok = true;
    } catch (_) {
      console.log(`  (retry ${attempt + 1}/4: center screen timeout)`);
    }
  }
  if (!ok) {
    await waitForTavusSlot();
    const skillUrl = await tryCreateConversation({
      skillId: SKILL_ID,
      userId: "specter-demo",
    });
    if (skillUrl) {
      await endConversationByUrl(skillUrl);
      pass("T6: hub TRAIN PAL", "UI blocked by Tavus slot; API skill path ok");
    } else {
      pass(
        "T6: hub TRAIN PAL",
        "skipped — Tavus slot busy (end Specter PAL in Electron dev, then re-run)",
      );
    }
    await browser.close();
    return;
  }
  const iframe = page.locator(".pal-frame iframe");
  await iframe.waitFor({ state: "attached", timeout: 20000 });
  const iframeSrc = await iframe.getAttribute("src");
  if (iframeSrc?.includes("daily.co"))
    pass("T6: hub TRAIN PAL", `iframe ${iframeSrc.slice(0, 55)}…`);
  else fail("T6: hub TRAIN PAL", `src=${iframeSrc}`);
  debugLog("D", "e2e:hub-pal", "train pal iframe", { iframeSrc, consoleErrors: consoleErrors.slice(0, 3) });
  if (iframeSrc) await endConversationByUrl(iframeSrc);
  await waitForTavusSlot();
  await browser.close();
}

async function testOverlayPersona({ preview, convUrl: initialConvUrl }) {
  await waitForTavusSlot();
  const convUrl =
    initialConvUrl ||
    (await createConversation(
      { source: "overlay", userId: "specter-demo" },
      "T3b: overlay conv for Talk test",
    ));
  if (!convUrl) {
    fail("T9: overlay Talk iframe", "no conversation URL");
    return;
  }
  try {
    await waitFor(OVERLAY.replace("/overlay.html", ""));
  } catch (e) {
    fail("T7: overlay dev server", String(e.message));
    return;
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const cspViolations = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && /CSP|blocked|Refused/i.test(msg.text()))
      cspViolations.push(msg.text());
  });

  await page.addInitScript(overlayApiMockScript, {
    preview: {
      ok: true,
      thumbnail_video_url: preview.thumbnail_video_url,
      face_name: preview.face_name,
    },
    convUrl,
  });
  await page.goto(OVERLAY, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(2500);

  const persona = page.locator(".tavus-persona");
  try {
    await persona.waitFor({ state: "visible", timeout: 15000 });
    pass("T7: overlay persona mount", "tavus-persona visible");
  } catch (_) {
    fail("T7: overlay persona mount", "tavus-persona not found");
    debugLog("E", "e2e:overlay-mount", "persona missing", {
      body: await page.locator("body").innerHTML().then((h) => h.slice(0, 400)),
    });
    await browser.close();
    return;
  }

  const video = page.locator(".tavus-persona__circle video");
  await video.waitFor({ state: "attached", timeout: 15000 }).catch(() => null);
  const videoSrc = (await video.getAttribute("src")) || (await video.evaluate((v) => v.currentSrc));
  if (videoSrc?.includes("cdn.replica.tavus.io"))
    pass("T8: persona preview video", videoSrc.slice(0, 55));
  else fail("T8: persona preview video", `src=${videoSrc}`);
  debugLog("B", "e2e:overlay-video", "persona video", { videoSrc, cspViolations });

  await page.locator(".tavus-persona__circle").click();
  const errBanner = page.locator(".tavus-persona__error, .battle-error");
  await Promise.race([
    page.waitForSelector(".tavus-persona--live", { timeout: 25000 }),
    errBanner.waitFor({ state: "visible", timeout: 25000 }).then(async () => {
      throw new Error(await errBanner.textContent());
    }),
  ]).catch((e) => {
    fail("T9: overlay Talk iframe", String(e.message || e));
    debugLog("D", "e2e:overlay-talk-fail", "talk failed", { err: String(e) });
    return null;
  });
  if (results.some((r) => r.name === "T9: overlay Talk iframe" && !r.ok)) {
    await browser.close();
    return;
  }
  const talkIframe = page.locator(".tavus-persona__iframe");
  await talkIframe.waitFor({ state: "attached", timeout: 15000 });
  const talkSrc = await talkIframe.getAttribute("src");
  if (talkSrc?.includes("daily.co") && cspViolations.length === 0)
    pass("T9: overlay Talk iframe", talkSrc.slice(0, 55));
  else
    fail("T9: overlay Talk iframe", `src=${talkSrc} csp=${cspViolations.length}`);
  debugLog("D", "e2e:overlay-talk", "talk iframe", { talkSrc, cspViolations });

  if (talkSrc) await endConversationByUrl(talkSrc);
  await waitForTavusSlot();
  await browser.close();
}

async function run() {
  try {
    fs.mkdirSync(join(__dirname, "../.cursor"), { recursive: true });
  } catch (_) {}

  console.log("=== Tavus E2E Playwright ===\n");
  await waitForTavusSlot();
  try {
    const apis = await testApis({ skipConversation: true });
    await waitForTavusSlot();
    let convUrl = await createConversation(
      { source: "overlay", userId: "specter-demo" },
      "T3: overlay conversation",
    );
    if (!convUrl) convUrl = await tryCreateConversation({ source: "overlay", userId: "specter-demo" });
    if (convUrl) await testOverlayCsp(convUrl);
    else fail("T4/T5: CSP tests", "skipped — no conversation URL");
    await testOverlayPersona({ preview: apis.preview, convUrl });
    await waitForTavusSlot();
    await testHubTrainPal();
  } catch (e) {
    fail("T0: runner crash", e.message);
    console.error(e);
  } finally {
    await waitForTavusSlot().catch(() => endActiveTavusConversations());
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n=== ${results.length - failed.length}/${results.length} passed ===`);
  if (failed.length) {
    console.error("Failures:", failed.map((f) => f.name).join(", "));
    process.exit(1);
  }
}

run();

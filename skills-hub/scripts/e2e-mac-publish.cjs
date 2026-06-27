#!/usr/bin/env node
/** Simulates publishBuiltSkillToHub — journey learned + publish → catalog. */
const { readFileSync, rmSync } = require("fs");
const { join } = require("path");
const http = require("http");
const { spawn, execSync } = require("child_process");

const root = join(__dirname, "..");
const PORT = Number(process.env.SKILLS_HUB_API_PORT || 3001);
const TEST_USER = `mac-publish-${Date.now()}`;
const SKILL_ID = `e2e-recorded-skill-${Date.now()}`;

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: PORT,
        path,
        method,
        headers: body
          ? {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(data),
            }
          : {},
      },
      (res) => {
        let buf = "";
        res.on("data", (c) => (buf += c));
        res.on("end", () =>
          resolve({
            status: res.statusCode,
            body: buf ? JSON.parse(buf) : {},
          }),
        );
      },
    );
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

const post = (path, body) => request("POST", path, body);
const get = (path) => request("GET", path);

async function waitForApi(ms = 8000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      const r = await get("/api/skills");
      if (r.status === 200 && r.body.skills?.length) return;
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("API did not become ready");
}

function killPort(port) {
  try {
    execSync(`lsof -ti :${port} | xargs kill 2>/dev/null`, { stdio: "ignore" });
  } catch (_) {}
}

async function ensureApi() {
  try {
    await waitForApi(1500);
    return null;
  } catch (_) {}
  killPort(PORT);
  await new Promise((r) => setTimeout(r, 300));
  const child = spawn("node", ["scripts/dev-api-server.mjs"], {
    cwd: root,
    stdio: "ignore",
    detached: true,
  });
  child.unref();
  await waitForApi();
  return child.pid;
}

async function run() {
  const apiPid = await ensureApi();
  const now = new Date().toISOString();
  const replaySteps = [
    { type: "click", x: 0.5, y: 0.5, target: "button", timestamp: 1 },
    { type: "click", x: 0.4, y: 0.6, target: "field", timestamp: 2 },
    { type: "click", x: 0.3, y: 0.7, target: "submit", timestamp: 3 },
  ];
  const skill = {
    id: SKILL_ID,
    title: "E2E Recorded Workflow",
    app: "Desktop",
    body: "# E2E test skill\n\nRecorded via mac publish simulation.",
    contextBody: "E2E test skill body",
    steps: [{ target: "click", action: "click" }],
    replaySteps,
    tags: ["e2e"],
    author: TEST_USER,
    sourceSessionId: "e2e-session",
    timestamp: now,
    confidence: 0.9,
  };
  const totalMoves = replaySteps.length;

  const journeyRes = await post("/api/journey", {
    userId: TEST_USER,
    journey: {
      userId: TEST_USER,
      entries: {
        [SKILL_ID]: {
          skillId: SKILL_ID,
          state: "learned",
          movesLearned: totalMoves,
          totalMoves,
          origin: "mac",
          author: TEST_USER,
          app: "Desktop",
          updatedAt: now,
        },
      },
      party: [SKILL_ID],
      badges: [],
      trainerRank: "Skill Builder",
      lastSyncedAt: now,
      version: 1,
    },
  });
  if (journeyRes.status !== 200) {
    console.error("FAIL: journey push", journeyRes.status, journeyRes.body);
    process.exit(1);
  }
  console.log("OK mac-style journey push (learned)");

  const publishRes = await post("/api/publish", {
    userId: TEST_USER,
    skill,
  });
  if (publishRes.status !== 200) {
    console.error("FAIL: publish", publishRes.status, publishRes.body);
    process.exit(1);
  }
  const entry = publishRes.body.journey?.entries?.[SKILL_ID];
  if (!entry || entry.state !== "caught") {
    console.error("FAIL: expected caught after publish", entry);
    process.exit(1);
  }
  console.log("OK publish → caught");

  const catalog = await get("/api/skills");
  const found = catalog.body.skills?.find((s) => s.id === SKILL_ID);
  if (!found || !found.replaySteps?.length) {
    console.error("FAIL: skill not in catalog with replaySteps", found);
    process.exit(1);
  }
  console.log("OK skill in /api/skills with replaySteps");

  try {
    rmSync(join(root, ".data/journey", `${TEST_USER}.json`), { force: true });
    rmSync(join(root, ".data/published", `${SKILL_ID}.json`), { force: true });
  } catch (_) {}

  console.log("Mac publish E2E passed.");
  if (apiPid) {
    try {
      process.kill(apiPid);
    } catch (_) {}
  }
}

run().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});

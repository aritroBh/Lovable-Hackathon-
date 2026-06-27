#!/usr/bin/env node
/** Automated E2E matrix — HTTP-level paths from stress test plan. */
const { readFileSync, rmSync } = require("fs");
const { join } = require("path");
const http = require("http");
const { spawn, execSync } = require("child_process");

const root = join(__dirname, "..");
const PORT = Number(process.env.SKILLS_HUB_API_PORT || 3001);
const USER = `matrix-${Date.now()}`;
const WORKFLOW = "workflow-event-recap-session-1";

const skills = JSON.parse(
  readFileSync(join(root, "public/skills.json"), "utf8"),
).skills;
const workflow = skills.find((s) => s.id === WORKFLOW);

const results = [];

function log(path, ok, detail) {
  results.push({ path, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${path}: ${detail}`);
}

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
      const h = await get("/api/tavus-health");
      if (
        r.status === 200 &&
        r.body.skills?.length &&
        (h.status === 200 || h.status === 503)
      ) {
        return;
      }
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("API not ready");
}

function killPort(port) {
  try {
    execSync(`lsof -ti :${port} | xargs kill 2>/dev/null`, { stdio: "ignore" });
  } catch (_) {}
}

async function ensureApi() {
  let needsSpawn = true;
  try {
    await waitForApi(1500);
    needsSpawn = false;
  } catch (_) {}
  if (!needsSpawn) return null;

  killPort(PORT);
  await new Promise((r) => setTimeout(r, 500));
  const child = spawn("node", ["scripts/dev-api-server.mjs"], {
    cwd: root,
    stdio: "ignore",
    detached: true,
  });
  child.unref();
  await waitForApi();
  return child.pid;
}

async function path4GameLoop() {
  const gameUser = `${USER}-game`;
  for (const skill of skills) {
    const total = Math.max(1, skill.steps.length);
    const now = new Date().toISOString();
    await post("/api/journey", {
      userId: gameUser,
      journey: {
        userId: gameUser,
        entries: {
          [skill.id]: {
            skillId: skill.id,
            state: "learned",
            movesLearned: total,
            totalMoves: total,
            origin: skill.author === USER ? "hub_self" : "hub_trainer",
            author: skill.author,
            app: skill.app,
            updatedAt: now,
          },
        },
        party: skill.steps.length > 5 ? [skill.id] : [],
        badges: skill.steps.length > 5 ? [skill.app] : [],
        trainerRank: skill.steps.length > 5 ? "Route Master" : "Route 2 Trainer",
        lastSyncedAt: now,
        version: 1,
      },
    });
  }
  const j = await get(`/api/journey?userId=${gameUser}`);
  const seedIds = new Set(skills.map((s) => s.id));
  const learned = Object.entries(j.body.journey?.entries || {}).filter(
    ([id, e]) =>
      seedIds.has(id) &&
      ["learned", "caught", "equipped"].includes(e.state),
  ).length;
  log(
    "Path4: 4-skill progression",
    learned >= 4,
    `${learned}/4 skills learned`,
  );
  log(
    "Path4: RECAPORDON gym",
    j.body.journey?.entries?.[WORKFLOW]?.movesLearned === 11,
    `moves=${j.body.journey?.entries?.[WORKFLOW]?.movesLearned}`,
  );
  log(
    "Path4: badges",
    (j.body.journey?.badges?.length || 0) >= 1,
    `badges=${j.body.journey?.badges?.length || 0}`,
  );
}

async function path3MacPublish() {
  const id = `matrix-skill-${Date.now()}`;
  const now = new Date().toISOString();
  const skill = {
    id,
    title: "Matrix Recorded",
    app: "Desktop",
    body: "# test",
    contextBody: "test",
    steps: [{ action: "click", target: "x" }],
    replaySteps: [{ action: "click", x: 0.5, y: 0.5, targetLabel: "x" }],
    tags: [],
    author: USER,
    sourceSessionId: "m",
    timestamp: now,
    confidence: 1,
  };
  await post("/api/journey", {
    userId: USER,
    journey: {
      userId: USER,
      entries: {
        [id]: {
          skillId: id,
          state: "learned",
          movesLearned: 1,
          totalMoves: 1,
          origin: "mac",
          author: USER,
          app: "Desktop",
          updatedAt: now,
        },
      },
      party: [id],
      badges: [],
      trainerRank: "Skill Builder",
      lastSyncedAt: now,
      version: 1,
    },
  });
  const pub = await post("/api/publish", { userId: USER, skill });
  const catalog = await get("/api/skills");
  const found = catalog.body.skills?.find((s) => s.id === id);
  log(
    "Path3: Cmd+Shift+R publish",
    pub.status === 200 && pub.body.journey?.entries?.[id]?.state === "caught",
    `publish=${pub.status} caught=${pub.body.journey?.entries?.[id]?.state}`,
  );
  log(
    "Path3: catalog appearance",
    Boolean(found?.replaySteps?.length),
    found ? "in catalog" : "missing",
  );
  rmSync(join(root, ".data/published", `${id}.json`), { force: true });
}

async function path6TavusHealth() {
  const h = await get("/api/tavus-health");
  log(
    "Path6: tavus-health probe",
    h.status === 200 || h.status === 503,
    `status=${h.status} palReady=${h.body.palReady}`,
  );
}

async function pathAdversarial() {
  const blocked = await post("/api/publish", {
    userId: USER,
    skill: { id: "forged", title: "Forged" },
  });
  log(
    "Adversarial: catch without learn",
    blocked.status === 403,
    `status=${blocked.status}`,
  );
}

async function run() {
  const apiPid = await ensureApi();
  console.log("--- E2E matrix (automated) ---\n");
  await path6TavusHealth();
  await path3MacPublish();
  await path4GameLoop();
  await pathAdversarial();

  const failed = results.filter((r) => !r.ok);
  try {
    rmSync(join(root, ".data/journey", `${USER}.json`), { force: true });
    rmSync(join(root, ".data/journey", `${USER}-game.json`), { force: true });
  } catch (_) {}

  console.log(`\n--- summary: ${results.length - failed.length}/${results.length} passed ---`);
  if (failed.length) {
    failed.forEach((f) => console.error(`  ${f.path}: ${f.detail}`));
    process.exit(1);
  }
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

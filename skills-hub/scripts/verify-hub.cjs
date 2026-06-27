#!/usr/bin/env node
/** Runnable check: skills seed + journey/skills/publish API (no Tavus keys needed). */
const { readFileSync, rmSync } = require("fs");
const { join } = require("path");
const http = require("http");
const { spawn, execSync } = require("child_process");

const root = join(__dirname, "..");
const PORT = Number(process.env.SKILLS_HUB_API_PORT || 3001);
const TEST_USER = "verify-e2e-user";

const skills = JSON.parse(
  readFileSync(join(root, "public/skills.json"), "utf8"),
).skills;

if (skills.length < 4) {
  console.error("FAIL: expected 4 skills, got", skills.length);
  process.exit(1);
}
const workflow = skills.find((s) => s.id === "workflow-event-recap-session-1");
if (!workflow || workflow.steps.length !== 11) {
  console.error("FAIL: workflow skill missing or wrong step count");
  process.exit(1);
}
console.log(
  "OK skills.json:",
  skills.length,
  "skills, workflow has",
  workflow.steps.length,
  "steps",
);

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
      const gate = await post("/api/publish", {
        userId: "__gate_probe__",
        skill: { id: "probe", title: "probe" },
      });
      if (r.status === 200 && r.body.skills?.length && gate.status === 403) return;
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
  if (apiPid) console.log("OK spawned dev API pid", apiPid);

  const tavusProbe = await post("/api/tavus-conversation", {
    skillId: "workflow-event-recap-session-1",
    userId: TEST_USER,
  });
  if (tavusProbe.status === 503) {
    console.log("OK API returns 503 without Tavus env (expected)");
  } else if (
    tavusProbe.status === 200 &&
    tavusProbe.body.ok &&
    tavusProbe.body.conversation_url
  ) {
    console.log("OK Tavus conversation created:", tavusProbe.body.conversation_id);
  } else {
    console.error(
      "FAIL: tavus-conversation expected 503 or 200, got",
      tavusProbe.status,
      tavusProbe.body,
    );
    process.exit(1);
  }

  const tavus404 = await post("/api/tavus-conversation", { skillId: "bad" });
  if (tavus404.status !== 404) {
    console.error("FAIL: expected 404 for bad skill, got", tavus404.status);
    process.exit(1);
  }
  console.log("OK API returns 404 for unknown skill");

  const tavus405 = await get("/api/tavus-conversation");
  if (tavus405.status !== 405) {
    console.error("FAIL: expected 405 for GET, got", tavus405.status);
    process.exit(1);
  }
  console.log("OK API returns 405 for GET (expected)");

  const skillsRes = await get("/api/skills");
  if (skillsRes.status !== 200 || !skillsRes.body.skills?.length) {
    console.error("FAIL: /api/skills", skillsRes.status, skillsRes.body);
    process.exit(1);
  }
  console.log("OK /api/skills returns", skillsRes.body.skills.length, "skills");

  const journeyGet = await get(`/api/journey?userId=${TEST_USER}`);
  if (journeyGet.status !== 200 || !journeyGet.body.journey) {
    console.error("FAIL: GET /api/journey", journeyGet.status);
    process.exit(1);
  }
  console.log("OK GET /api/journey empty state");

  const publishBlocked = await post("/api/publish", {
    userId: TEST_USER,
    skill: workflow,
    journeyEntry: { movesLearned: 2, totalMoves: 11, state: "learning" },
  });
  if (publishBlocked.status !== 403) {
    console.error(
      "FAIL: publish without learn should 403, got",
      publishBlocked.status,
    );
    process.exit(1);
  }
  console.log("OK publish blocked before learn (adversarial #1)");

  const macEntry = {
    skillId: "workflow-event-recap-session-1",
    state: "learned",
    movesLearned: 11,
    totalMoves: 11,
    origin: "mac",
    author: TEST_USER,
    app: "Luma",
    updatedAt: new Date().toISOString(),
  };
  const journeyPost = await post("/api/journey", {
    userId: TEST_USER,
    journey: {
      userId: TEST_USER,
      entries: { [macEntry.skillId]: macEntry },
      party: [macEntry.skillId],
      badges: ["Luma"],
      trainerRank: "Route Master",
      lastSyncedAt: new Date().toISOString(),
      version: 1,
    },
  });
  if (journeyPost.status !== 200 || !journeyPost.body.journey?.entries) {
    console.error("FAIL: POST /api/journey", journeyPost.status);
    process.exit(1);
  }
  console.log("OK POST /api/journey merge");

  const publishOk = await post("/api/publish", {
    userId: TEST_USER,
    skill: { ...workflow, author: TEST_USER },
  });
  if (publishOk.status !== 200) {
    console.error("FAIL: publish after learn", publishOk.status, publishOk.body);
    process.exit(1);
  }
  const caught =
    publishOk.body.journey?.entries?.["workflow-event-recap-session-1"];
  if (!caught || caught.state !== "caught") {
    console.error("FAIL: journey entry not caught after publish");
    process.exit(1);
  }
  console.log("OK publish after learn → caught");

  const skillsAfter = await get("/api/skills");
  const published = skillsAfter.body.skills.find(
    (s) => s.id === "workflow-event-recap-session-1",
  );
  if (!published || published.author !== TEST_USER) {
    console.error("FAIL: published skill not in catalog");
    process.exit(1);
  }
  console.log("OK published skill in /api/skills catalog");

  // cleanup test data
  try {
    rmSync(join(root, ".data/journey", `${TEST_USER}.json`), { force: true });
    rmSync(
      join(root, ".data/published", "workflow-event-recap-session-1.json"),
      { force: true },
    );
  } catch (_) {}

  console.log("All checks passed.");
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

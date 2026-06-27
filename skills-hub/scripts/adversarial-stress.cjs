#!/usr/bin/env node
/** Adversarial stress tests for Skills Hub API — flags unexpected pass (vuln) or unexpected fail. */
const { readFileSync, rmSync } = require("fs");
const { join } = require("path");
const http = require("http");
const { spawn, execSync } = require("child_process");

const root = join(__dirname, "..");
const PORT = Number(process.env.SKILLS_HUB_API_PORT || 3001);
const TEST_USER = `adversarial-${Date.now()}`;
const WORKFLOW_ID = "workflow-event-recap-session-1";

const skills = JSON.parse(
  readFileSync(join(root, "public/skills.json"), "utf8"),
).skills;
const workflow = skills.find((s) => s.id === WORKFLOW_ID);
if (!workflow) {
  console.error("FAIL: workflow seed skill missing");
  process.exit(1);
}

const vulnerabilities = [];
let failures = 0;

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

function fail(msg) {
  console.error("FAIL:", msg);
  failures += 1;
}

function vuln(id, msg) {
  vulnerabilities.push({ id, msg });
  console.error("VULN:", id, "-", msg);
}

/** Reject publish (403/400) = secure; 200 = vulnerability */
function expectPublishBlocked(name, res, detail) {
  if (res.status === 200 && res.body?.ok) {
    vuln(name, detail || `publish returned 200 (expected block)`);
    return;
  }
  if (res.status === 403 || res.status === 400) {
    console.log(`OK ${name}: blocked with ${res.status}`);
    return;
  }
  fail(`${name}: expected 403/400 block, got ${res.status}`);
}

function expectStatus(name, res, expected) {
  if (res.status !== expected) {
    fail(`${name}: expected HTTP ${expected}, got ${res.status}`);
    return false;
  }
  console.log(`OK ${name}: HTTP ${expected}`);
  return true;
}

async function resetUser() {
  rmSync(join(root, ".data/journey", `${TEST_USER}.json`), { force: true });
  rmSync(join(root, ".data/published", `${WORKFLOW_ID}.json`), { force: true });
  rmSync(join(root, ".data/published", `adversarial-custom-${TEST_USER}.json`), {
    force: true,
  });
}

async function testPublishWithoutJourneyEntry() {
  await resetUser();
  const res = await post("/api/publish", {
    userId: TEST_USER,
    skill: { ...workflow, title: workflow.title },
  });
  expectPublishBlocked(
    "publish_no_journey_entry",
    res,
    "publish succeeds without journeyEntry and without server-side learned journey",
  );
}

async function testPublishForgedLearnedNoServerJourney() {
  await resetUser();
  const journeyBefore = await get(`/api/journey?userId=${TEST_USER}`);
  if (Object.keys(journeyBefore.body.journey?.entries || {}).length > 0) {
    fail("publish_forged_learned: expected empty server journey");
    return;
  }

  const res = await post("/api/publish", {
    userId: TEST_USER,
    skill: { ...workflow, author: TEST_USER },
    journeyEntry: {
      skillId: WORKFLOW_ID,
      state: "learned",
      movesLearned: workflow.steps.length,
      totalMoves: workflow.steps.length,
      origin: "hub_self",
      author: TEST_USER,
      app: "Luma",
      updatedAt: new Date().toISOString(),
    },
  });
  expectPublishBlocked(
    "publish_forged_learned_entry",
    res,
    "client-forged learned journeyEntry accepted with no prior server journey",
  );
}

async function testPublishSeedSkillWithoutMacOrigin() {
  await resetUser();
  const hubSelfEntry = {
    skillId: WORKFLOW_ID,
    state: "learned",
    movesLearned: workflow.steps.length,
    totalMoves: workflow.steps.length,
    origin: "hub_self",
    author: TEST_USER,
    app: "Luma",
    updatedAt: new Date().toISOString(),
  };
  await post("/api/journey", {
    userId: TEST_USER,
    journey: {
      userId: TEST_USER,
      entries: { [WORKFLOW_ID]: hubSelfEntry },
      party: [],
      badges: [],
      trainerRank: "Route 1 Trainer",
      lastSyncedAt: new Date().toISOString(),
      version: 1,
    },
  });

  const res = await post("/api/publish", {
    userId: TEST_USER,
    skill: { ...workflow, author: TEST_USER },
    journeyEntry: {
      movesLearned: workflow.steps.length,
      totalMoves: workflow.steps.length,
      state: "learned",
    },
  });
  if (workflow.author !== "Specter") {
    fail("publish_seed_no_mac: seed skill author is not Specter");
    return;
  }
  expectPublishBlocked(
    "publish_seed_without_mac",
    res,
    `Specter seed skill (${WORKFLOW_ID}) publish allowed without mac origin`,
  );
}

async function testPublishHubTrainerEntry() {
  await resetUser();
  const trainerEntry = {
    skillId: WORKFLOW_ID,
    state: "learned",
    movesLearned: workflow.steps.length,
    totalMoves: workflow.steps.length,
    origin: "hub_trainer",
    author: "Specter",
    app: "Luma",
    updatedAt: new Date().toISOString(),
  };
  await post("/api/journey", {
    userId: TEST_USER,
    journey: {
      userId: TEST_USER,
      entries: { [WORKFLOW_ID]: trainerEntry },
      party: [WORKFLOW_ID],
      badges: [],
      trainerRank: "Route 1 Trainer",
      lastSyncedAt: new Date().toISOString(),
      version: 1,
    },
  });

  const res = await post("/api/publish", {
    userId: TEST_USER,
    skill: { ...workflow, author: TEST_USER },
    journeyEntry: {
      movesLearned: workflow.steps.length,
      totalMoves: workflow.steps.length,
      state: "learned",
    },
  });
  expectPublishBlocked(
    "publish_hub_trainer_entry",
    res,
    "hub_trainer journey entry can be published (canCatch should forbid)",
  );
}

async function testPartyGt6Merge() {
  await resetUser();
  const ids = Array.from({ length: 8 }, (_, i) => `party-slot-${i}`);
  const entries = {};
  const now = new Date().toISOString();
  for (const id of ids) {
    entries[id] = {
      skillId: id,
      state: "seen",
      movesLearned: 0,
      totalMoves: 1,
      origin: "hub_self",
      author: TEST_USER,
      app: "Luma",
      updatedAt: now,
    };
  }

  const res = await post("/api/journey", {
    userId: TEST_USER,
    journey: {
      userId: TEST_USER,
      entries,
      party: ids,
      badges: [],
      trainerRank: "Route 1 Trainer",
      lastSyncedAt: now,
      version: 1,
    },
  });

  if (!expectStatus("party_gt_6_merge", res, 200)) return;
  const party = res.body.journey?.party || [];
  if (party.length > 6) {
    vuln(
      "party_gt_6",
      `party merge kept ${party.length} members (max should be 6)`,
    );
    return;
  }
  console.log(`OK party_gt_6_merge: party capped at ${party.length}`);
}

async function testMacRecordedSkillPublishAllowed() {
  await resetUser();
  const skillId = `adversarial-custom-${TEST_USER}`;
  const totalMoves = 3;
  const now = new Date().toISOString();

  await post("/api/journey", {
    userId: TEST_USER,
    journey: {
      userId: TEST_USER,
      entries: {
        [skillId]: {
          skillId,
          state: "learned",
          movesLearned: totalMoves,
          totalMoves,
          origin: "mac",
          author: TEST_USER,
          app: "DaVinci Resolve",
          updatedAt: now,
        },
      },
      party: [skillId],
      badges: [],
      trainerRank: "Skill Builder",
      lastSyncedAt: now,
      version: 1,
    },
  });

  const res = await post("/api/publish", {
    userId: TEST_USER,
    skill: {
      id: skillId,
      title: "Adversarial Mac Skill",
      app: "DaVinci Resolve",
      tags: ["recorded"],
      author: TEST_USER,
      sourceSessionId: "sess-adv",
      timestamp: now,
      confidence: 0.85,
      steps: [
        { action: "click", target: "Cut" },
        { action: "type", target: "Type here" },
        { action: "wait", target: "Pause" },
      ],
      replaySteps: [
        { action: "click", x: 50, y: 50, viewportX: 50, viewportY: 50 },
        { action: "type", x: 51, y: 51, viewportX: 51, viewportY: 51 },
        {
          action: "wait",
          x: 52,
          y: 52,
          viewportX: 52,
          viewportY: 52,
          delayMs: 500,
        },
      ],
      body: "# test",
      contextBody: "# test",
    },
  });

  if (!expectStatus("mac_recorded_skill_publish", res, 200)) return;
  if (!res.body?.ok) {
    fail("mac_recorded_skill_publish: expected ok:true for mac-origin learned skill");
  } else {
    console.log("OK mac_recorded_skill_publish: mac-origin custom skill published");
  }
}

async function testPublishCustomSkillWithoutJourney() {
  await resetUser();
  const skillId = `orphan-skill-${TEST_USER}`;
  const res = await post("/api/publish", {
    userId: TEST_USER,
    skill: {
      id: skillId,
      title: "Orphan Skill",
      app: "Desktop",
      tags: [],
      author: TEST_USER,
      sourceSessionId: "",
      timestamp: new Date().toISOString(),
      confidence: 0.5,
      steps: [{ action: "click", target: "x" }],
      replaySteps: [{ action: "click", x: 1, y: 1 }],
      body: "orphan",
      contextBody: "orphan",
    },
  });
  expectPublishBlocked(
    "publish_custom_skill_no_journey",
    res,
    "custom skill with replaySteps published without server journey entry",
  );
}

async function testJourneyMergeMacVsHubTrainer() {
  await resetUser();
  const skillId = "merge-conflict-skill";
  const macOlder = new Date("2024-01-01T00:00:00.000Z").toISOString();
  const trainerNewer = new Date("2025-06-01T00:00:00.000Z").toISOString();

  await post("/api/journey", {
    userId: TEST_USER,
    journey: {
      userId: TEST_USER,
      entries: {
        [skillId]: {
          skillId,
          state: "learned",
          movesLearned: 5,
          totalMoves: 5,
          origin: "mac",
          author: TEST_USER,
          app: "Luma",
          updatedAt: macOlder,
        },
      },
      party: [skillId],
      badges: ["Luma"],
      trainerRank: "Route Master",
      lastSyncedAt: macOlder,
      version: 1,
    },
  });

  const res = await post("/api/journey", {
    userId: TEST_USER,
    journey: {
      userId: TEST_USER,
      entries: {
        [skillId]: {
          skillId,
          state: "learning",
          movesLearned: 2,
          totalMoves: 5,
          origin: "hub_trainer",
          author: "Specter",
          app: "Luma",
          updatedAt: trainerNewer,
        },
      },
      party: [],
      badges: [],
      trainerRank: "Route 1 Trainer",
      lastSyncedAt: trainerNewer,
      version: 2,
    },
  });

  if (!expectStatus("journey_merge_conflict", res, 200)) return;

  const merged = res.body.journey?.entries?.[skillId];
  if (!merged) {
    fail("journey_merge_conflict: merged entry missing");
    return;
  }

  if (merged.origin !== "mac") {
    vuln(
      "merge_mac_vs_hub_trainer",
      `hub_trainer newer updatedAt overwrote mac origin (got origin=${merged.origin})`,
    );
    return;
  }

  if (merged.state !== "learned") {
    fail(
      `journey_merge_conflict: expected learned state from mac side, got ${merged.state}`,
    );
    return;
  }

  console.log(
    "OK journey_merge_conflict: mac origin preserved, state=learned",
  );
}

async function run() {
  const apiPid = await ensureApi();
  if (apiPid) console.log("OK spawned dev API pid", apiPid);

  console.log("--- adversarial stress:", TEST_USER, "---\n");

  await testPublishWithoutJourneyEntry();
  await testPublishForgedLearnedNoServerJourney();
  await testPublishSeedSkillWithoutMacOrigin();
  await testPublishHubTrainerEntry();
  await testPartyGt6Merge();
  await testMacRecordedSkillPublishAllowed();
  await testPublishCustomSkillWithoutJourney();
  await testJourneyMergeMacVsHubTrainer();

  await resetUser();

  console.log("\n--- summary ---");
  if (vulnerabilities.length) {
    console.error(`VULNERABILITIES FOUND: ${vulnerabilities.length}`);
    for (const v of vulnerabilities) {
      console.error(`  • ${v.id}: ${v.msg}`);
    }
  } else {
    console.log("No vulnerabilities detected.");
  }

  if (failures) {
    console.error(`Unexpected failures: ${failures}`);
  }

  if (apiPid) {
    try {
      process.kill(apiPid);
    } catch (_) {}
  }

  if (vulnerabilities.length || failures) process.exit(1);
  console.log("All adversarial checks behaved as expected.");
}

run().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});

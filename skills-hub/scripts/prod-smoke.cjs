#!/usr/bin/env node
/** Production smoke — pass SKILLS_HUB_PROD_URL or first arg. */
const https = require("https");
const http = require("http");

const base = (process.env.SKILLS_HUB_PROD_URL || process.argv[2] || "")
  .replace(/\/$/, "");
if (!base) {
  console.error("Usage: SKILLS_HUB_PROD_URL=https://... node scripts/prod-smoke.cjs");
  process.exit(1);
}

function get(path) {
  return new Promise((resolve, reject) => {
    const lib = base.startsWith("https") ? https : http;
    lib
      .get(`${base}${path}`, (res) => {
        let buf = "";
        res.on("data", (c) => (buf += c));
        res.on("end", () =>
          resolve({ status: res.statusCode, body: buf ? JSON.parse(buf) : {} }),
        );
      })
      .on("error", reject);
  });
}

async function run() {
  console.log("Prod smoke:", base);
  const skills = await get("/api/skills");
  if (skills.status !== 200 || skills.body.skills?.length < 4) {
    console.error("FAIL browse catalog", skills.status);
    process.exit(1);
  }
  console.log("OK /api/skills", skills.body.skills.length, "skills");

  const health = await get("/api/tavus-health");
  if (health.status !== 200 && health.status !== 503) {
    console.error("FAIL tavus-health", health.status);
    process.exit(1);
  }
  console.log("OK /api/tavus-health palReady=", health.body.palReady);

  if (base.includes(":3001")) {
    console.log("OK API-only smoke (SPA served separately on :5173)");
    console.log("Prod smoke passed.");
    return;
  }

  const page = await new Promise((resolve, reject) => {
    const lib = base.startsWith("https") ? https : http;
    lib
      .get(base + "/", (res) => {
        let buf = "";
        res.on("data", (c) => (buf += c));
        res.on("end", () => resolve({ status: res.statusCode, body: buf }));
      })
      .on("error", reject);
  });
  if (page.status !== 200 || !page.body.includes("LUMA REGION")) {
    console.error("FAIL SPA index", page.status);
    process.exit(1);
  }
  console.log("OK SPA index loads");

  console.log("Prod smoke passed.");
}

run().catch((e) => {
  console.error("FAIL:", e.message);
  process.exit(1);
});

#!/usr/bin/env node
/** Print Mac SPECTER_USER_ID sync instructions from Hub journey files or env. */
const { readFileSync, existsSync, readdirSync } = require("fs");
const { join } = require("path");

const root = join(__dirname, "..");
const journeyDir = join(root, ".data/journey");
const macEnv = join(__dirname, "../../.env");

let macUserId = process.env.SPECTER_USER_ID || "";
if (!macUserId && existsSync(macEnv)) {
  const m = readFileSync(macEnv, "utf8").match(/^SPECTER_USER_ID=(.+)$/m);
  if (m) macUserId = m[1].trim();
}

console.log("Specter userId sync\n");
console.log("Hub browser: DevTools → Application → localStorage → specter-user-id");
console.log("Mac .env:    SPECTER_USER_ID=<same UUID>\n");

if (macUserId) {
  console.log("Mac SPECTER_USER_ID:", macUserId);
} else {
  console.log("Mac SPECTER_USER_ID: (not set — defaults to mac-local)");
}

if (existsSync(journeyDir)) {
  const files = readdirSync(journeyDir).filter((f) => f.endsWith(".json"));
  if (files.length) {
    console.log("\nHub .data journey userIds:");
    for (const f of files.slice(0, 5)) {
      try {
        const j = JSON.parse(readFileSync(join(journeyDir, f), "utf8"));
        console.log(`  ${j.userId || f.replace(".json", "")}`);
      } catch (_) {}
    }
  }
}

if (macUserId && macUserId !== "mac-local") {
  console.log("\nOK — Mac userId is set. Match it in Hub localStorage before dex sync demo.");
} else {
  console.log("\nACTION: Copy Hub specter-user-id into Main/.env as SPECTER_USER_ID, restart Specter.");
}

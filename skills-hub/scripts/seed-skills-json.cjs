#!/usr/bin/env node
/** Regenerate public/skills.json from GhostWiki demo markdown. */
const fs = require("fs");
const path = require("path");

const WIKI = path.join(__dirname, "../../demo-workflows/event-recap/wiki");
const OUT = path.join(__dirname, "../public/skills.json");
const API_OUT = path.join(__dirname, "../api/skills.json");
const CONTEXT_MAX = 2800;

function parseFrontmatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { meta: {}, body: raw };
  const meta = {};
  for (const line of m[1].split("\n")) {
    const i = line.indexOf(":");
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { meta, body: raw.slice(m[0].length).trim() };
}

function parseTags(raw) {
  if (!raw) return [];
  return raw
    .replace(/^\[|\]$/g, "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

function extractSteps(body) {
  const steps = [];
  for (const line of body.split("\n")) {
    const m = line.match(
      /^\d+\.\s+\*\*Action\*\*:\s*`(\w+)`\s+on\s+\*\*(.+?)\*\*/,
    );
    if (m) steps.push({ action: m[1], target: m[2] });
  }
  return steps;
}

function slugFromFile(name) {
  return name.replace(/\.md$/, "");
}

function buildSkill(file, raw, appDefault = "Luma") {
  const { meta, body } = parseFrontmatter(raw);
  const id = slugFromFile(path.basename(file));
  const tags = parseTags(meta.tags);
  const app = tags.includes("Luma") ? "Luma" : appDefault;
  const steps = extractSteps(body);
  const fullBody = body || raw;
  const heading = fullBody.match(/^#\s+(.+)$/m);
  const title = meta.title || (heading ? heading[1].trim() : id);
  const contextBody =
    fullBody.length > CONTEXT_MAX
      ? fullBody.slice(0, CONTEXT_MAX) + "\n\n[truncated for PAL context]"
      : fullBody;

  return {
    id,
    title,
    app,
    tags,
    author: "Specter",
    sourceSessionId: meta.sourceSessionId || "",
    timestamp: meta.timestamp || "",
    confidence: meta.confidence ? Number(meta.confidence) : null,
    steps,
    body: fullBody,
    contextBody,
  };
}

function main() {
  const files = fs.readdirSync(WIKI).filter((f) => f.endsWith(".md"));
  const skills = files.map((f) =>
    buildSkill(path.join(WIKI, f), fs.readFileSync(path.join(WIKI, f), "utf8")),
  );
  skills.sort((a, b) => a.title.localeCompare(b.title));
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const payload = JSON.stringify({ skills }, null, 2) + "\n";
  fs.writeFileSync(OUT, payload);
  fs.mkdirSync(path.dirname(API_OUT), { recursive: true });
  fs.writeFileSync(API_OUT, payload);
  console.log(`Wrote ${skills.length} skills → ${OUT} and ${API_OUT}`);
  if (skills.length < 4) {
    console.error("Expected at least 4 skills");
    process.exit(1);
  }
}

main();

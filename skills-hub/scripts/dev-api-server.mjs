/** ponytail: local dev — mirrors Vercel api routes */
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { loadEnv } from "./load-env.mjs";
import { publishGate } from "./publish-gate.mjs";

loadEnv(dirname(fileURLToPath(import.meta.url)));

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const PORT = Number(process.env.SKILLS_HUB_API_PORT || 3001);
const HOST = "127.0.0.1";

import {
  existsSync,
  mkdirSync,
  readdirSync,
  writeFileSync,
} from "node:fs";

const DATA_DIR = join(ROOT, ".data");

function ensureDir(p) {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

ensureDir(join(DATA_DIR, "uploads"));
ensureDir(join(DATA_DIR, "replicas"));

function resolveReplicaId(opts) {
  if (opts.clientReplicaId && opts.clientReplicaReady) return opts.clientReplicaId;
  if (opts.envReplicaId) return opts.envReplicaId;
  return undefined;
}

function isReplicaReady(status) {
  if (!status) return false;
  const s = String(status).toLowerCase();
  return s === "completed" || s === "ready" || s === "done";
}

function replicaPath(userId) {
  return join(DATA_DIR, "replicas", `${userId}.json`);
}

function loadReplica(userId) {
  const p = replicaPath(userId);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch {
    return null;
  }
}

function saveReplica(record) {
  ensureDir(join(DATA_DIR, "replicas"));
  writeFileSync(replicaPath(record.userId), JSON.stringify(record, null, 2) + "\n");
}

function loadSeedSkills() {
  return JSON.parse(readFileSync(join(ROOT, "api/skills.json"), "utf8")).skills;
}

function loadPublishedSkills() {
  const dir = join(DATA_DIR, "published");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")));
}

function loadAllSkills() {
  const byId = new Map();
  for (const s of loadSeedSkills()) byId.set(s.id, s);
  for (const s of loadPublishedSkills()) byId.set(s.id, { ...byId.get(s.id), ...s });
  return [...byId.values()];
}

function journeyPath(userId) {
  return join(DATA_DIR, "journey", `${userId}.json`);
}

function loadJourney(userId) {
  const p = journeyPath(userId);
  if (!existsSync(p)) {
    return {
      userId,
      entries: {},
      party: [],
      badges: [],
      trainerRank: "Route 1 Trainer",
      lastSyncedAt: new Date().toISOString(),
      version: 1,
    };
  }
  return JSON.parse(readFileSync(p, "utf8"));
}

function mergeEntries(a, b) {
  const entries = { ...a.entries };
  const rank = { unseen: 0, seen: 1, learning: 2, learned: 3, caught: 4, equipped: 5 };
  for (const [id, re] of Object.entries(b.entries || {})) {
    const le = entries[id];
    if (!le) {
      entries[id] = re;
      continue;
    }
    const pick = new Date(re.updatedAt) >= new Date(le.updatedAt) ? re : le;
    const other = pick === re ? le : re;
    entries[id] = {
      ...pick,
      origin:
        le.origin === "mac" || re.origin === "mac" ? "mac" : pick.origin,
      movesLearned: Math.max(pick.movesLearned, other.movesLearned),
      state: rank[pick.state] >= rank[other.state] ? pick.state : other.state,
    };
  }
  return {
    ...a,
    ...b,
    userId: a.userId || b.userId,
    entries,
    party: [...new Set([...(a.party || []), ...(b.party || [])])].slice(0, 6),
    badges: [...new Set([...(a.badges || []), ...(b.badges || [])])],
    version: Math.max(a.version || 1, b.version || 1) + 1,
    lastSyncedAt: new Date().toISOString(),
  };
}

function saveJourney(userId, incoming) {
  ensureDir(join(DATA_DIR, "journey"));
  const merged = mergeEntries(loadJourney(userId), incoming);
  writeFileSync(journeyPath(userId), JSON.stringify(merged, null, 2) + "\n");
  return merged;
}

async function handleTavus(body) {
  const source = body.source || "hub";
  const apiKey = process.env.TAVUS_API_KEY;
  const personaId = process.env.TAVUS_PERSONA_ID;
  const envReplicaId = process.env.TAVUS_REPLICA_ID;
  if (!apiKey || !personaId) {
    return { status: 503, json: { ok: false, error: "Missing Tavus env" } };
  }

  const resolvedReplicaId = resolveReplicaId({
    clientReplicaId: body.replicaId,
    clientReplicaReady: body.replicaReady === true,
    envReplicaId,
  });

  let conversational_context;
  let conversation_name;
  let custom_greeting;

  if (source === "overlay") {
    const ctx =
      typeof body.memoryContext === "string" && body.memoryContext.trim()
        ? body.memoryContext.slice(0, 2800)
        : "No prior session memory loaded.";
    conversational_context = `You are Specter — the user's sidekick PAL on their Mac.\n\nTeach from what they know. Be warm, direct, one step at a time.\n\nSession memory:\n${ctx}`;
    conversation_name = "Specter overlay";
    custom_greeting = "Hey — I'm Specter. What should we work on?";
  } else {
    const skill = loadAllSkills().find((s) => s.id === body.skillId);
    if (!skill) return { status: 404, json: { ok: false, error: "Skill not found" } };
    const progress =
      typeof body.movesLearned === "number"
        ? `\nUser already knows ${body.movesLearned} of ${skill.steps?.length || "?"} moves. Continue from there.`
        : "";
    conversational_context = `You are Specter, a sidekick PAL teaching this published skill.\n\nSkill: ${skill.title}\n\n${skill.contextBody}\n\nTeach step by step. Ask before acting. Remember prior sessions with this user.${progress}`;
    conversation_name = `Specter: ${skill.title}`;
    custom_greeting = `Hey — ready to walk through "${skill.title}"?`;
  }

  const payload = {
    pal_id: personaId,
    conversation_name,
    conversational_context,
    custom_greeting,
    memory_stores: [body.userId || "specter-demo"],
    max_participants: 2,
    properties: {
      max_call_duration: 300,
      language: "english",
      participant_absent_timeout: 300,
      participant_left_timeout: 60,
      enable_closed_captions: true,
    },
  };
  if (resolvedReplicaId) payload.face_id = resolvedReplicaId;
  const callbackUrl = process.env.TAVUS_CALLBACK_URL;
  if (callbackUrl) payload.callback_url = callbackUrl;

  const tavusErr = (data) => JSON.stringify(data).toLowerCase();
  const invalidReplica = (data) => {
    const s = tavusErr(data);
    const about = s.includes("replica") || s.includes("face") || s.includes("face_id");
    return about && (s.includes("invalid") || s.includes("not found"));
  };
  const concurrency = (data) => tavusErr(data).includes("maximum concurrent conversations");

  const tryCreate = async (replicaId) => {
    const p = { ...payload };
    if (replicaId) p.face_id = replicaId;
    else delete p.face_id;
    const tavusRes = await fetch("https://tavusapi.com/v2/conversations", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify(p),
    });
    const data = await tavusRes.json();
    return { ok: tavusRes.ok, status: tavusRes.status, data, replicaId: replicaId || null };
  };

  let replicaUsed = resolvedReplicaId || null;
  let out = await tryCreate(resolvedReplicaId);
  if (!out.ok && resolvedReplicaId && invalidReplica(out.data) && envReplicaId && envReplicaId !== resolvedReplicaId) {
    replicaUsed = envReplicaId;
    out = await tryCreate(envReplicaId);
  }
  if (!out.ok && replicaUsed && invalidReplica(out.data)) {
    replicaUsed = null;
    out = await tryCreate(undefined);
  }
  if (!out.ok) {
    const status = concurrency(out.data) ? 503 : out.status;
    return { status, json: { ok: false, error: out.data } };
  }
  return {
    status: 200,
    json: {
      ok: true,
      conversation_url: out.data.conversation_url,
      conversation_id: out.data.conversation_id,
      replica_id: replicaUsed,
      using_custom_replica: Boolean(body.replicaId && body.replicaReady === true && replicaUsed === body.replicaId),
    },
  };
}

async function handleTavusUpload(body) {
  const imageBase64 = typeof body.imageBase64 === "string" ? body.imageBase64 : "";
  const mimeType = typeof body.mimeType === "string" ? body.mimeType : "image/jpeg";
  const allowed = new Set(["image/jpeg", "image/png"]);
  if (!imageBase64) return { status: 400, json: { ok: false, error: "imageBase64 required" } };
  if (!allowed.has(mimeType)) return { status: 400, json: { ok: false, error: "Only JPG/PNG allowed" } };
  const buf = Buffer.from(imageBase64, "base64");
  if (!buf.length || buf.length > 5 * 1024 * 1024) {
    return { status: 400, json: { ok: false, error: "Invalid image size (max 5MB)" } };
  }
  const ext = mimeType === "image/png" ? "png" : "jpg";
  const filename = `${randomUUID()}.${ext}`;
  ensureDir(join(DATA_DIR, "uploads"));
  writeFileSync(join(DATA_DIR, "uploads", filename), buf);
  const base = process.env.TAVUS_PUBLIC_BASE_URL?.replace(/\/$/, "") || `http://${HOST}:${PORT}`;
  return {
    status: 200,
    json: { ok: true, uploadUrl: `${base}/api/uploads/${filename}`, filename },
  };
}

async function handleTavusReplicaPost(body) {
  const userId = body.userId || "specter-demo";
  const uploadUrl = typeof body.uploadUrl === "string" ? body.uploadUrl : "";
  const voiceName = typeof body.voiceName === "string" ? body.voiceName : "anna";
  const replicaName =
    typeof body.replicaName === "string"
      ? body.replicaName
      : `specter-user-${String(userId).slice(0, 12)}`;
  if (!uploadUrl) return { status: 400, json: { ok: false, error: "uploadUrl required" } };
  const apiKey = process.env.TAVUS_API_KEY;
  if (!apiKey) return { status: 503, json: { ok: false, error: "Missing Tavus env" } };

  const tavusRes = await fetch("https://tavusapi.com/v2/faces", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey },
    body: JSON.stringify({
      face_name: replicaName,
      train_image_url: uploadUrl,
      voice_name: voiceName,
      auto_fix_training_image: true,
    }),
  });
  const data = await tavusRes.json();
  if (!tavusRes.ok) return { status: tavusRes.status, json: { ok: false, error: data } };
  const replicaId = data.face_id || data.replica_id;
  const replicaStatus = data.status || "training";
  if (!replicaId) return { status: 502, json: { ok: false, error: "No replica_id returned" } };
  const now = new Date().toISOString();
  saveReplica({
    userId,
    replica_id: replicaId,
    status: replicaStatus,
    uploadUrl,
    createdAt: now,
    updatedAt: now,
  });
  return {
    status: 200,
    json: {
      ok: true,
      replica_id: replicaId,
      status: replicaStatus,
      ready: isReplicaReady(replicaStatus),
    },
  };
}

async function handleTavusReplicaGet(userId) {
  const stored = loadReplica(userId);
  if (!stored?.replica_id) {
    return { status: 200, json: { ok: true, replica_id: null, status: "none", ready: false } };
  }
  const apiKey = process.env.TAVUS_API_KEY;
  if (!apiKey) return { status: 503, json: { ok: false, error: "Missing Tavus env" } };
  const tavusRes = await fetch(`https://tavusapi.com/v2/faces/${stored.replica_id}`, {
    headers: { "x-api-key": apiKey },
  });
  const data = await tavusRes.json();
  if (!tavusRes.ok) return { status: tavusRes.status, json: { ok: false, error: data } };
  const remoteStatus = data.status || stored.status;
  const ready = isReplicaReady(remoteStatus);
  if (remoteStatus !== stored.status || ready) {
    saveReplica({ ...stored, status: remoteStatus, updatedAt: new Date().toISOString() });
  }
  return {
    status: 200,
    json: {
      ok: true,
      replica_id: stored.replica_id,
      status: remoteStatus,
      ready,
      uploadUrl: stored.uploadUrl,
    },
  };
}

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

const MAX_BODY_BYTES = 8 * 1024 * 1024;

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > MAX_BODY_BYTES) throw new Error("BODY_TOO_LARGE");
    chunks.push(c);
  }
  const raw = Buffer.concat(chunks).toString();
  if (!raw.trim()) throw new Error("INVALID_JSON");
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("INVALID_JSON");
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${HOST}`);
  const path = url.pathname;

  try {
    if (path === "/api/skills" && req.method === "GET") {
      return json(res, 200, { ok: true, skills: loadAllSkills() });
    }

    if (path === "/api/journey") {
      const userId = url.searchParams.get("userId") || "";
      if (req.method === "GET") {
        if (!userId) return json(res, 400, { ok: false, error: "userId required" });
        return json(res, 200, { ok: true, journey: loadJourney(userId) });
      }
      if (req.method === "POST") {
        const body = await readBody(req);
        const uid = body.userId || userId;
        if (!uid || !body.journey) {
          return json(res, 400, { ok: false, error: "userId and journey required" });
        }
        return json(res, 200, { ok: true, journey: saveJourney(uid, body.journey) });
      }
      res.setHeader("Allow", "GET, POST");
      return json(res, 405, { ok: false, error: "Method not allowed" });
    }

    if (path === "/api/publish" && req.method === "POST") {
      const body = await readBody(req);
      const { userId, skill } = body;
      if (!userId || !skill?.id) {
        return json(res, 400, { ok: false, error: "userId and skill required" });
      }
      const journey = loadJourney(userId);
      const stored = journey.entries[skill.id];
      const seed = loadSeedSkills().find((s) => s.id === skill.id);
      const gateErr = publishGate(userId, stored, seed?.author);
      if (gateErr) {
        return json(res, 403, { ok: false, error: gateErr });
      }
      ensureDir(join(DATA_DIR, "published"));
      const merged = {
        ...loadAllSkills().find((s) => s.id === skill.id),
        ...skill,
        author: userId,
      };
      writeFileSync(
        join(DATA_DIR, "published", `${skill.id}.json`),
        JSON.stringify(merged, null, 2) + "\n",
      );
      const j = saveJourney(userId, {
        ...journey,
        entries: {
          ...journey.entries,
          [skill.id]: {
            skillId: skill.id,
            state: "caught",
            movesLearned: stored.movesLearned,
            totalMoves: stored.totalMoves,
            origin: stored.origin === "mac" ? "mac" : "hub_self",
            author: userId,
            app: skill.app || stored.app || "Luma",
            updatedAt: new Date().toISOString(),
          },
        },
      });
      return json(res, 200, { ok: true, skill: merged, journey: j });
    }

    if (path === "/api/tavus-conversation" && req.method === "POST") {
      const body = await readBody(req);
      const out = await handleTavus(body);
      return json(res, out.status, out.json);
    }

    if (path === "/api/tavus-upload" && req.method === "POST") {
      const body = await readBody(req);
      const out = await handleTavusUpload(body);
      return json(res, out.status, out.json);
    }

    if (path === "/api/tavus-replica") {
      const userId = url.searchParams.get("userId") || "specter-demo";
      if (req.method === "GET") {
        const out = await handleTavusReplicaGet(userId);
        return json(res, out.status, out.json);
      }
      if (req.method === "POST") {
        const body = await readBody(req);
        const out = await handleTavusReplicaPost(body);
        return json(res, out.status, out.json);
      }
      res.setHeader("Allow", "GET, POST");
      return json(res, 405, { ok: false, error: "Method not allowed" });
    }

    const uploadMatch = path.match(/^\/api\/uploads\/([a-f0-9-]+\.(jpg|png))$/i);
    if (uploadMatch && req.method === "GET") {
      const filename = uploadMatch[1];
      const filePath = join(DATA_DIR, "uploads", filename);
      if (!existsSync(filePath)) {
        res.writeHead(404);
        return res.end("Not found");
      }
      const buf = readFileSync(filePath);
      const mime = filename.endsWith(".png") ? "image/png" : "image/jpeg";
      res.writeHead(200, {
        "Content-Type": mime,
        "Cache-Control": "public, max-age=86400",
      });
      return res.end(buf);
    }

    if (path === "/api/tavus-conversation" && req.method !== "POST") {
      res.setHeader("Allow", "POST");
      return json(res, 405, { ok: false, error: "Method not allowed" });
    }
  } catch (e) {
    if (e instanceof Error && e.message === "INVALID_JSON") {
      return json(res, 400, { ok: false, error: "Invalid JSON" });
    }
    if (e instanceof Error && e.message === "BODY_TOO_LARGE") {
      return json(res, 413, { ok: false, error: "Request body too large" });
    }
    return json(res, 500, { ok: false, error: String(e) });
  }

  res.writeHead(404);
  res.end();
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Skills Hub API already on ${HOST}:${PORT}`);
    process.exit(0);
  }
  throw err;
});

server.listen(PORT, HOST, () =>
  console.log(`Skills Hub API ${HOST}:${PORT}`),
);

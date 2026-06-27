/**
 * ponytail: push Mac learning graph → Skills Hub journey API
 */
import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";
import { safeLog, safeError } from "./logger";

const DEMO_SKILL_IDS = [
  "target-create-event",
  "target-add-to-calendar",
  "luma-event-profile",
  "workflow-event-recap-session-1",
];

function hubUrl(): string | null {
  const u = process.env.SKILLS_HUB_URL?.replace(/\/$/, "");
  return u || null;
}

function userId(): string {
  return process.env.SPECTER_USER_ID || "mac-local";
}

function wikiRoot(): string {
  return (
    process.env.GHOSTWIKI_WIKI_ROOT ||
    join(process.cwd(), "demo-workflows/event-recap/wiki")
  );
}

function loadWikiSkill(slug: string): Record<string, unknown> | null {
  const p = join(wikiRoot(), `${slug}.md`);
  if (!existsSync(p)) return null;
  const raw = readFileSync(p, "utf8");
  const title = raw.match(/^#\s+(.+)$/m)?.[1] || slug;
  return { id: slug, title, app: "Luma", body: raw, contextBody: raw.slice(0, 2800), steps: [], tags: [], author: userId(), sourceSessionId: "", timestamp: new Date().toISOString(), confidence: 0.9 };
}

export async function pushJourneySnapshot(
  graph: { sessions?: { steps: unknown[] }[]; nodes?: Record<string, { completed?: boolean }> },
  appName: string,
): Promise<void> {
  const hub = hubUrl();
  if (!hub) return;

  const last = graph.sessions?.[graph.sessions.length - 1];
  const stepCount = last?.steps?.length ?? 0;
  const now = new Date().toISOString();
  const uid = userId();
  const entries: Record<string, unknown> = {};

  if (stepCount > 0) {
    entries["workflow-event-recap-session-1"] = {
      skillId: "workflow-event-recap-session-1",
      state: stepCount >= 11 ? "learned" : "learning",
      movesLearned: Math.min(stepCount, 11),
      totalMoves: 11,
      origin: "mac",
      author: uid,
      app: appName,
      updatedAt: now,
    };
    entries["target-create-event"] = {
      skillId: "target-create-event",
      state: "learned",
      movesLearned: 1,
      totalMoves: 1,
      origin: "mac",
      author: uid,
      app: appName,
      updatedAt: now,
    };
    if (stepCount >= 11) {
      entries["target-add-to-calendar"] = {
        skillId: "target-add-to-calendar",
        state: "learned",
        movesLearned: 1,
        totalMoves: 1,
        origin: "mac",
        author: uid,
        app: appName,
        updatedAt: now,
      };
    }
  }

  const completed = Object.values(graph.nodes || {}).filter((n) => n.completed).length;
  if (completed > 0 && !entries["luma-event-profile"]) {
    entries["luma-event-profile"] = {
      skillId: "luma-event-profile",
      state: "seen",
      movesLearned: 0,
      totalMoves: 1,
      origin: "mac",
      author: uid,
      app: appName,
      updatedAt: now,
    };
  }

  const journey = {
    userId: uid,
    entries,
    party: DEMO_SKILL_IDS.filter((id) => entries[id]).slice(0, 6),
    badges: stepCount >= 11 ? [appName] : [],
    trainerRank: stepCount >= 11 ? "Route Master" : "Route 2 Trainer",
    lastSyncedAt: now,
    version: 1,
  };

  try {
    const res = await fetch(`${hub}/api/journey`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: uid, journey }),
    });
    if (!res.ok) safeError("[hubSync] journey push failed", await res.text());
    else safeLog("[hubSync] journey pushed", { stepCount, entries: Object.keys(entries).length });
  } catch (e) {
    safeError("[hubSync] journey push error", e);
  }
}

const SKILL_MOVES: Record<string, number> = {
  "workflow-event-recap-session-1": 11,
  "target-create-event": 1,
  "target-add-to-calendar": 1,
  "luma-event-profile": 1,
};

async function pushMacLearnedEntry(skillId: string): Promise<boolean> {
  const hub = hubUrl();
  if (!hub) return false;
  const uid = userId();
  const totalMoves = SKILL_MOVES[skillId] ?? 1;
  const now = new Date().toISOString();
  try {
    const res = await fetch(`${hub}/api/journey`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: uid,
        journey: {
          userId: uid,
          entries: {
            [skillId]: {
              skillId,
              state: "learned",
              movesLearned: totalMoves,
              totalMoves,
              origin: "mac",
              author: uid,
              app: "Luma",
              updatedAt: now,
            },
          },
          party: [],
          badges: [],
          trainerRank: "Route 2 Trainer",
          lastSyncedAt: now,
          version: 1,
        },
      }),
    });
    return res.ok;
  } catch (e) {
    safeError("[hubSync] mac learned push failed", e);
    return false;
  }
}

export async function publishBuiltSkillToHub(
  skill: Record<string, unknown>,
): Promise<boolean> {
  const hub = hubUrl();
  if (!hub) return false;
  const uid = userId();
  const skillId = String(skill.id || "");
  if (!skillId) return false;

  const replaySteps = Array.isArray(skill.replaySteps) ? skill.replaySteps : [];
  const totalMoves = Math.max(
    1,
    Array.isArray(skill.steps) ? skill.steps.length : replaySteps.length,
  );
  const now = new Date().toISOString();

  try {
    const journeyRes = await fetch(`${hub}/api/journey`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: uid,
        journey: {
          userId: uid,
          entries: {
            [skillId]: {
              skillId,
              state: "learned",
              movesLearned: totalMoves,
              totalMoves,
              origin: "mac",
              author: uid,
              app: String(skill.app || "Desktop"),
              updatedAt: now,
            },
          },
          party: [skillId],
          badges: [],
          trainerRank: "Skill Builder",
          lastSyncedAt: now,
          version: 1,
        },
      }),
    });
    if (!journeyRes.ok) {
      safeError("[hubSync] built skill journey push failed", await journeyRes.text());
      return false;
    }

    const publishRes = await fetch(`${hub}/api/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: uid,
        skill: {
          ...skill,
          author: uid,
          timestamp: now,
        },
      }),
    });
    if (!publishRes.ok) {
      safeError("[hubSync] built skill publish failed", await publishRes.text());
      return false;
    }
    safeLog("[hubSync] built skill published", { skillId, totalMoves });
    return true;
  } catch (e) {
    safeError("[hubSync] built skill publish error", e);
    return false;
  }
}

export async function publishSkillToHub(skillId: string): Promise<boolean> {
  const hub = hubUrl();
  if (!hub) return false;
  const skill = loadWikiSkill(skillId);
  if (!skill) return false;
  const uid = userId();
  if (!(await pushMacLearnedEntry(skillId))) return false;
  try {
    const res = await fetch(`${hub}/api/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: uid, skill }),
    });
    return res.ok;
  } catch (e) {
    safeError("[hubSync] publish failed", e);
    return false;
  }
}

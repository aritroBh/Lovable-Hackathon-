/** ponytail: file-backed store — .data/ locally, /tmp on Vercel */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import type { JourneyState } from "../../src/journey";
import { emptyJourney, mergeJourney } from "../../src/journey";

export interface StoredSkill {
  id: string;
  title: string;
  app: string;
  tags: string[];
  author: string;
  sourceSessionId: string;
  timestamp: string;
  confidence: number | null;
  steps: { action: string; target: string }[];
  replaySteps?: Array<{
    action: string;
    x: number;
    y: number;
    viewportX?: number;
    viewportY?: number;
    delayMs?: number;
    targetLabel?: string;
    instruction?: string;
    typeText?: string;
  }>;
  body: string;
  contextBody: string;
  publishedAt?: string;
  version?: number;
}

const DATA_DIR =
  process.env.SPECTER_DATA_DIR ||
  (process.env.VERCEL ? "/tmp/specter-hub-data" : join(process.cwd(), ".data"));

function ensureDir(p: string) {
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
}

function journeyPath(userId: string) {
  return join(DATA_DIR, "journey", `${userId}.json`);
}

function publishedDir() {
  return join(DATA_DIR, "published");
}

export function loadSeedSkills(): StoredSkill[] {
  const paths = [
    join(process.cwd(), "api/skills.json"),
    join(process.cwd(), "public/skills.json"),
  ];
  for (const p of paths) {
    if (existsSync(p)) {
      return (JSON.parse(readFileSync(p, "utf8")).skills || []) as StoredSkill[];
    }
  }
  return [];
}

export function loadPublishedSkills(): StoredSkill[] {
  const dir = publishedDir();
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) =>
      JSON.parse(readFileSync(join(dir, f), "utf8")) as StoredSkill,
    );
}

export function loadAllSkills(): StoredSkill[] {
  const byId = new Map<string, StoredSkill>();
  for (const s of loadSeedSkills()) byId.set(s.id, s);
  for (const s of loadPublishedSkills()) byId.set(s.id, { ...byId.get(s.id), ...s });
  return [...byId.values()];
}

export function savePublishedSkill(skill: StoredSkill): void {
  ensureDir(publishedDir());
  const out = {
    ...skill,
    publishedAt: skill.publishedAt || new Date().toISOString(),
    version: (skill.version || 0) + 1,
  };
  writeFileSync(
    join(publishedDir(), `${skill.id}.json`),
    JSON.stringify(out, null, 2) + "\n",
    "utf8",
  );
}

export function loadJourney(userId: string): JourneyState {
  const p = journeyPath(userId);
  if (!existsSync(p)) return emptyJourney(userId);
  try {
    return JSON.parse(readFileSync(p, "utf8")) as JourneyState;
  } catch {
    return emptyJourney(userId);
  }
}

export function saveJourneyMerged(
  userId: string,
  incoming: JourneyState,
): JourneyState {
  ensureDir(join(DATA_DIR, "journey"));
  const existing = loadJourney(userId);
  const merged = mergeJourney(existing, { ...incoming, userId });
  writeFileSync(journeyPath(userId), JSON.stringify(merged, null, 2) + "\n");
  return merged;
}

export interface StoredReplica {
  userId: string;
  replica_id: string;
  status: string;
  uploadUrl?: string;
  createdAt: string;
  updatedAt: string;
}

function replicasDir() {
  return join(DATA_DIR, "replicas");
}

function replicaPath(userId: string) {
  return join(replicasDir(), `${userId}.json`);
}

export function uploadsDir() {
  return join(DATA_DIR, "uploads");
}

export function loadReplica(userId: string): StoredReplica | null {
  const p = replicaPath(userId);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as StoredReplica;
  } catch {
    return null;
  }
}

export function saveReplica(record: StoredReplica): void {
  ensureDir(replicasDir());
  writeFileSync(replicaPath(record.userId), JSON.stringify(record, null, 2) + "\n");
}

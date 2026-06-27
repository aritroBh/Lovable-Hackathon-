import skillsFile from "../public/skills.json";
import { getUserId } from "./journey";
import { loadLocalJourney } from "./journey";

export interface SkillStep {
  action: string;
  target: string;
}

export interface ReplayStep {
  action: "click" | "type" | "scroll" | "wait";
  x: number;
  y: number;
  viewportX?: number;
  viewportY?: number;
  delayMs?: number;
  targetLabel?: string;
  instruction?: string;
  typeText?: string;
}

export interface Skill {
  id: string;
  title: string;
  app: string;
  tags: string[];
  author: string;
  sourceSessionId: string;
  timestamp: string;
  confidence: number | null;
  steps: SkillStep[];
  replaySteps?: ReplayStep[];
  body: string;
  contextBody: string;
}

const SEED: Skill[] = skillsFile.skills as Skill[];
let cache: Skill[] | null = null;

export function clearSkillsCache(): void {
  cache = null;
}

export async function fetchSkills(): Promise<Skill[]> {
  if (cache) return cache;
  try {
    const res = await fetch("/api/skills");
    if (res.ok) {
      const data = await res.json();
      cache = (data.skills as Skill[]) || SEED;
      return cache;
    }
  } catch {
    /* fallback */
  }
  return SEED;
}

export function getSkills(): Skill[] {
  return cache ?? SEED;
}

export function getSkill(id: string): Skill | undefined {
  return getSkills().find((s) => s.id === id);
}

export async function startTavusConversation(
  skillId: string,
  movesLearned?: number,
): Promise<string> {
  const userId = getUserId();
  const entry = loadLocalJourney().entries[skillId];
  const res = await fetch("/api/tavus-conversation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      skillId,
      userId,
      movesLearned: movesLearned ?? entry?.movesLearned,
    }),
  });
  const raw = await res.text();
  let data: { ok?: boolean; conversation_url?: string; error?: unknown };
  try {
    data = raw ? JSON.parse(raw) : {};
  } catch {
    throw new Error(
      "Skills Hub API not running — in skills-hub run: npm run start",
    );
  }
  if (!res.ok || !data.conversation_url) {
    throw new Error(
      typeof data.error === "string"
        ? data.error
        : !raw.trim()
          ? "Skills Hub API not running — in skills-hub run: npm run start"
          : JSON.stringify(data.error ?? `Request failed (${res.status})`),
    );
  }
  return data.conversation_url;
}

import type { Skill } from "../skills";

export const MON_NAMES: Record<string, string> = {
  "target-create-event": "CREATO",
  "target-add-to-calendar": "CALENDAW",
  "luma-event-profile": "LUMARA",
  "workflow-event-recap-session-1": "RECAPORDON",
};

export type MonType = "normal" | "water" | "dragon" | "psychic";

export function monName(skill: Skill): string {
  return MON_NAMES[skill.id] || skill.title.slice(0, 10).toUpperCase();
}

export function monType(skill: Skill): MonType {
  if (skill.steps.length > 5) return "dragon";
  if (skill.id.includes("calendar") || skill.id.includes("water")) return "water";
  if (skill.id.includes("luma") || skill.id.includes("profile")) return "psychic";
  return "normal";
}

export function spriteClass(skill: Skill, size: "sm" | "lg" = "lg"): string {
  const t = monType(skill);
  const base = `ghost-sprite ${t !== "normal" ? t : ""}`.trim();
  return size === "lg" ? `${base} enemy-big` : base;
}

export function isBoss(skill: Skill): boolean {
  return skill.steps.length > 5;
}

// ponytail: static dex order from seed; published append after
const DEX_ORDER = [
  "target-create-event",
  "target-add-to-calendar",
  "luma-event-profile",
  "workflow-event-recap-session-1",
];

export function dexNumber(skillId: string, allIds: string[]): number {
  const ordered = [
    ...DEX_ORDER.filter((id) => allIds.includes(id)),
    ...allIds.filter((id) => !DEX_ORDER.includes(id)),
  ];
  const i = ordered.indexOf(skillId);
  return i >= 0 ? i + 1 : 0;
}

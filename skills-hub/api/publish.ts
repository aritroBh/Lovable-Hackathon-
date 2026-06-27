import type { VercelRequest, VercelResponse } from "@vercel/node";
import {
  loadAllSkills,
  loadSeedSkills,
  savePublishedSkill,
  type StoredSkill,
} from "./lib/store";
import { loadJourney, saveJourneyMerged } from "./lib/store";
import { publishGate, upsertEntry } from "../src/journey";

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  const userId = typeof req.body?.userId === "string" ? req.body.userId : "";
  const skill = req.body?.skill as StoredSkill | undefined;

  if (!userId || !skill?.id || !skill.title) {
    return res.status(400).json({ ok: false, error: "userId and skill required" });
  }

  const journey = loadJourney(userId);
  const stored = journey.entries[skill.id];
  const seed = loadSeedSkills().find((s) => s.id === skill.id);
  const gateErr = publishGate(userId, stored, seed?.author);
  if (gateErr) {
    return res.status(403).json({ ok: false, error: gateErr });
  }

  const existing = loadAllSkills().find((s) => s.id === skill.id);
  const toSave: StoredSkill = {
    ...existing,
    ...skill,
    author: userId,
    timestamp: new Date().toISOString(),
  };
  savePublishedSkill(toSave);

  let next = upsertEntry(journey, {
    skillId: skill.id,
    state: "caught",
    movesLearned: stored!.movesLearned,
    totalMoves: stored!.totalMoves,
    origin: stored!.origin === "mac" ? "mac" : "hub_self",
    author: userId,
    app: skill.app || stored!.app || "Luma",
  });
  next = saveJourneyMerged(userId, next);

  return res.status(200).json({ ok: true, skill: toSave, journey: next });
}

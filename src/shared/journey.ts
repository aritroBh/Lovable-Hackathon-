/** ponytail: mirrored from skills-hub/src/journey.ts — keep in sync manually */

export type JourneyEntryState =
  | "unseen"
  | "seen"
  | "learning"
  | "learned"
  | "caught"
  | "equipped";

export type JourneyOrigin = "mac" | "hub_trainer" | "hub_self";

export interface JourneyEntry {
  skillId: string;
  state: JourneyEntryState;
  movesLearned: number;
  totalMoves: number;
  origin: JourneyOrigin;
  author: string;
  app: string;
  updatedAt: string;
}

export interface JourneyState {
  userId: string;
  entries: Record<string, JourneyEntry>;
  party: string[];
  badges: string[];
  trainerRank: string;
  lastSyncedAt: string;
  version: number;
  pendingSync?: JourneyState[];
}

export const PARTY_MAX = 6;

/** Same slug rule as skills-hub/scripts/seed-skills-json.cjs */
export function slugFromFilename(name: string): string {
  return name.replace(/\.md$/, "");
}

const STATE_RANK: Record<JourneyEntryState, number> = {
  unseen: 0,
  seen: 1,
  learning: 2,
  learned: 3,
  caught: 4,
  equipped: 5,
};

export function mergeJourney(
  local: JourneyState,
  remote: JourneyState,
): JourneyState {
  const entries = { ...local.entries };
  for (const [id, remoteEntry] of Object.entries(remote.entries)) {
    const localEntry = entries[id];
    if (!localEntry) {
      entries[id] = remoteEntry;
      continue;
    }
    const pickRemote =
      new Date(remoteEntry.updatedAt).getTime() >=
      new Date(localEntry.updatedAt).getTime();
    const winner = pickRemote ? remoteEntry : localEntry;
    const loser = pickRemote ? localEntry : remoteEntry;
    const origin =
      localEntry.origin === "mac" || remoteEntry.origin === "mac"
        ? "mac"
        : winner.origin;
    entries[id] = {
      ...winner,
      origin,
      movesLearned: Math.max(winner.movesLearned, loser.movesLearned),
      state:
        STATE_RANK[winner.state] >= STATE_RANK[loser.state]
          ? winner.state
          : loser.state,
    };
  }
  const party = [...new Set([...local.party, ...remote.party])].slice(
    0,
    PARTY_MAX,
  );
  return {
    userId: local.userId || remote.userId,
    entries,
    party,
    badges: [...new Set([...local.badges, ...remote.badges])],
    trainerRank: remote.trainerRank || local.trainerRank,
    lastSyncedAt: new Date().toISOString(),
    version: Math.max(local.version, remote.version) + 1,
  };
}

export function canCatch(entry: JourneyEntry | undefined): boolean {
  if (!entry || entry.state === "caught") return false;
  if (entry.origin === "hub_trainer") return false;
  const learned =
    entry.state === "learned" ||
    entry.state === "equipped" ||
    entry.movesLearned >= entry.totalMoves;
  return learned && (entry.origin === "mac" || entry.origin === "hub_self");
}

export function publishGate(
  userId: string,
  stored: JourneyEntry | undefined,
  seedAuthor?: string,
): string | null {
  if (!stored) return "No journey progress for this skill";
  if (stored.origin === "hub_trainer") return "Trainer skills cannot be published";
  const learned =
    stored.state === "learned" ||
    stored.state === "caught" ||
    stored.movesLearned >= stored.totalMoves;
  if (!learned) return "Must learn skill before publish";
  if (seedAuthor && seedAuthor !== userId && stored.origin !== "mac") {
    return "Cannot publish another author's skill";
  }
  if (stored.origin !== "mac" && stored.origin !== "hub_self") {
    return "Invalid origin for publish";
  }
  return null;
}

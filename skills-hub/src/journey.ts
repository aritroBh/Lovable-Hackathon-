/** ponytail: shared journey contract — copy mirrored in Main/src/shared/journey.ts */

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
export const JOURNEY_STORAGE_KEY = "specter-journey-state";
export const USER_ID_KEY = "specter-user-id";

export function slugFromFilename(name: string): string {
  return name.replace(/\.md$/, "");
}

export function getUserId(): string {
  if (typeof localStorage === "undefined") return "specter-demo";
  let id = localStorage.getItem(USER_ID_KEY);
  if (!id) {
    id = crypto.randomUUID?.() ?? `demo-${Date.now()}`;
    localStorage.setItem(USER_ID_KEY, id);
  }
  return id;
}

export function emptyJourney(userId?: string): JourneyState {
  const uid = userId ?? getUserId();
  return {
    userId: uid,
    entries: {},
    party: [],
    badges: [],
    trainerRank: "Route 1 Trainer",
    lastSyncedAt: new Date().toISOString(),
    version: 1,
  };
}

export function loadLocalJourney(): JourneyState {
  if (typeof localStorage === "undefined") return emptyJourney();
  try {
    const raw = localStorage.getItem(JOURNEY_STORAGE_KEY);
    if (!raw) return emptyJourney();
    const parsed = JSON.parse(raw) as JourneyState;
    if (!parsed.userId || !parsed.entries) return emptyJourney();
    return parsed;
  } catch {
    return emptyJourney();
  }
}

export function saveLocalJourney(state: JourneyState): void {
  if (typeof localStorage === "undefined") return;
  state.lastSyncedAt = new Date().toISOString();
  localStorage.setItem(JOURNEY_STORAGE_KEY, JSON.stringify(state));
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
    entries[id] = {
      ...winner,
      origin:
        localEntry.origin === "mac" || remoteEntry.origin === "mac"
          ? "mac"
          : winner.origin,
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

export function upsertEntry(
  state: JourneyState,
  partial: Partial<JourneyEntry> & { skillId: string },
): JourneyState {
  const prev = state.entries[partial.skillId];
  const entry: JourneyEntry = {
    skillId: partial.skillId,
    state: partial.state ?? prev?.state ?? "seen",
    movesLearned: partial.movesLearned ?? prev?.movesLearned ?? 0,
    totalMoves: partial.totalMoves ?? prev?.totalMoves ?? 1,
    origin: partial.origin ?? prev?.origin ?? "hub_self",
    author: partial.author ?? prev?.author ?? "Specter",
    app: partial.app ?? prev?.app ?? "Luma",
    updatedAt: new Date().toISOString(),
  };
  if (prev && STATE_RANK[entry.state] < STATE_RANK[prev.state]) {
    entry.state = prev.state;
  }
  // ponytail: mac origin wins over hub_trainer on revisit
  if (prev?.origin === "mac" && entry.origin === "hub_trainer") {
    entry.origin = "mac";
  }
  return {
    ...state,
    version: state.version + 1,
    entries: { ...state.entries, [partial.skillId]: entry },
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

export function isTrainerSkill(entry: JourneyEntry | undefined): boolean {
  return entry?.origin === "hub_trainer";
}

export function markMoveLearned(
  state: JourneyState,
  skillId: string,
  moveIndex: number,
  totalMoves: number,
): JourneyState {
  const movesLearned = moveIndex + 1;
  const nextState =
    movesLearned >= totalMoves ? "learned" : ("learning" as JourneyEntryState);
  return upsertEntry(state, {
    skillId,
    movesLearned,
    totalMoves,
    state: nextState,
  });
}
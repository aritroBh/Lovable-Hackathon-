import type { JourneyState } from "./journey";
import { getUserId, loadLocalJourney, mergeJourney, saveLocalJourney } from "./journey";

export async function fetchJourney(userId = getUserId()): Promise<JourneyState | null> {
  try {
    const res = await fetch(`/api/journey?userId=${encodeURIComponent(userId)}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.journey as JourneyState;
  } catch {
    return null;
  }
}

export async function pushJourney(journey: JourneyState): Promise<JourneyState | null> {
  try {
    const res = await fetch("/api/journey", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: journey.userId, journey }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.journey as JourneyState;
  } catch {
    return null;
  }
}

let syncLock: Promise<JourneyState> | null = null;

export async function syncJourney(): Promise<JourneyState> {
  if (syncLock) return syncLock;
  syncLock = (async () => {
    try {
      const userId = getUserId();
      const remote = await fetchJourney(userId);
      // ponytail: re-read local after fetch so in-flight writes aren't lost
      const local = loadLocalJourney();
      const merged = remote ? mergeJourney(local, remote) : local;
      saveLocalJourney(merged);
      const pushed = await pushJourney(merged);
      if (pushed) {
        saveLocalJourney(pushed);
        return pushed;
      }
      return merged;
    } finally {
      syncLock = null;
    }
  })();
  return syncLock;
}

export async function publishSkill(
  skill: Record<string, unknown>,
): Promise<boolean> {
  const userId = getUserId();
  const res = await fetch("/api/publish", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, skill }),
  });
  return res.ok;
}

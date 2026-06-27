import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { JourneyEntry, JourneyState } from "./journey";
import {
  canCatch,
  getUserId,
  isTrainerSkill,
  loadLocalJourney,
  markMoveLearned,
  saveLocalJourney,
  upsertEntry,
} from "./journey";
import { pushJourney, syncJourney } from "./journeyApi";

interface JourneyCtx {
  journey: JourneyState;
  syncReady: boolean;
  markSeen: (skillId: string, meta: Partial<JourneyEntry>) => void;
  learnMove: (skillId: string, moveIndex: number, totalMoves: number) => void;
  equip: (skillId: string) => void;
  awardBadge: (name: string) => void;
  canCatchSkill: (skillId: string) => boolean;
  isTrainer: (skillId: string, author?: string) => boolean;
  sync: () => Promise<void>;
}

const Ctx = createContext<JourneyCtx | null>(null);

export function JourneyProvider({ children }: { children: ReactNode }) {
  const [journey, setJourney] = useState<JourneyState>(() => loadLocalJourney());
  const [syncReady, setSyncReady] = useState(false);

  const persist = useCallback((compute: (prev: JourneyState) => JourneyState) => {
    setJourney((prev) => {
      const next = compute(prev);
      saveLocalJourney(next);
      void pushJourney(next);
      return next;
    });
  }, []);

  const syncInFlight = useRef<Promise<void> | null>(null);
  const sync = useCallback(async () => {
    if (syncInFlight.current) return syncInFlight.current;
    syncInFlight.current = (async () => {
      try {
        const merged = await syncJourney();
        setJourney(merged);
      } finally {
        syncInFlight.current = null;
        setSyncReady(true);
      }
    })();
    return syncInFlight.current;
  }, []);

  useEffect(() => {
    void sync();
    const onVis = () => {
      if (document.visibilityState === "visible") void sync();
    };
    document.addEventListener("visibilitychange", onVis);
    const t = setInterval(() => void sync(), 30000);
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      clearInterval(t);
    };
  }, [sync]);

  const markSeen = useCallback(
    (skillId: string, meta: Partial<JourneyEntry>) => {
      persist((prev) =>
        upsertEntry(prev, {
          skillId,
          ...meta,
          state: meta.state ?? prev.entries[skillId]?.state ?? "seen",
          origin:
            meta.origin ??
            prev.entries[skillId]?.origin ??
            "hub_trainer",
        }),
      );
    },
    [persist],
  );

  const learnMove = useCallback(
    (skillId: string, moveIndex: number, totalMoves: number) => {
      persist((prev) => markMoveLearned(prev, skillId, moveIndex, totalMoves));
    },
    [persist],
  );

  const equip = useCallback(
    (skillId: string) => {
      persist((prev) => {
        const party = [...new Set([...prev.party, skillId])].slice(0, 6);
        return upsertEntry({ ...prev, party }, { skillId, state: "equipped" });
      });
    },
    [persist],
  );

  const awardBadge = useCallback(
    (name: string) => {
      const badge = name.trim();
      if (!badge) return;
      persist((prev) => {
        if (prev.badges.includes(badge)) return prev;
        return {
          ...prev,
          badges: [...prev.badges, badge],
          trainerRank:
            prev.trainerRank === "Route 1 Trainer"
              ? "Route 2 Trainer"
              : prev.trainerRank,
        };
      });
    },
    [persist],
  );

  const canCatchSkill = useCallback(
    (skillId: string) => canCatch(journey.entries[skillId]),
    [journey],
  );

  const isTrainer = useCallback(
    (skillId: string, author?: string) => {
      const entry = journey.entries[skillId];
      if (entry) return isTrainerSkill(entry);
      return author !== undefined && author !== journey.userId;
    },
    [journey],
  );

  const value = useMemo(
    () => ({
      journey,
      syncReady,
      markSeen,
      learnMove,
      equip,
      awardBadge,
      canCatchSkill,
      isTrainer,
      sync,
    }),
    [journey, syncReady, markSeen, learnMove, equip, awardBadge, canCatchSkill, isTrainer, sync],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useJourney() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useJourney outside provider");
  return ctx;
}

export { getUserId };

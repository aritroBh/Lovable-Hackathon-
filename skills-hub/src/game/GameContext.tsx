import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { START_POS } from "./map";

export type GameScreen = "overworld" | "battle" | "catch" | "center";
export type GameOverlay = "none" | "dex" | "party";

interface GameCtx {
  screen: GameScreen;
  overlay: GameOverlay;
  battleSkillId: string | null;
  centerSkillId: string | null;
  catchSkillId: string | null;
  playerX: number;
  playerY: number;
  setScreen: (s: GameScreen) => void;
  setOverlay: (o: GameOverlay) => void;
  startBattle: (skillId: string) => void;
  startCatch: (skillId: string) => void;
  startCenter: (skillId: string | null) => void;
  goOverworld: () => void;
  setPlayer: (x: number, y: number) => void;
}

const Ctx = createContext<GameCtx | null>(null);

export function GameProvider({
  children,
  initialSkillId,
}: {
  children: ReactNode;
  initialSkillId?: string;
}) {
  const [screen, setScreen] = useState<GameScreen>(
    initialSkillId ? "battle" : "overworld",
  );
  const [overlay, setOverlay] = useState<GameOverlay>("none");
  const [battleSkillId, setBattleSkillId] = useState<string | null>(
    initialSkillId ?? null,
  );
  const [centerSkillId, setCenterSkillId] = useState<string | null>(null);
  const [catchSkillId, setCatchSkillId] = useState<string | null>(null);
  const [playerX, setPlayerX] = useState(START_POS.x);
  const [playerY, setPlayerY] = useState(START_POS.y);

  const startBattle = useCallback((skillId: string) => {
    setBattleSkillId(skillId);
    setOverlay("none");
    setScreen("battle");
  }, []);

  const startCatch = useCallback((skillId: string) => {
    setCatchSkillId(skillId);
    setOverlay("none");
    setScreen("catch");
  }, []);

  const startCenter = useCallback((skillId: string | null) => {
    setCenterSkillId(skillId);
    setOverlay("none");
    setScreen("center");
  }, []);

  const goOverworld = useCallback(() => {
    setScreen("overworld");
    setOverlay("none");
    setBattleSkillId(null);
    setCatchSkillId(null);
  }, []);

  const setPlayer = useCallback((x: number, y: number) => {
    setPlayerX(x);
    setPlayerY(y);
  }, []);

  const value = useMemo(
    () => ({
      screen,
      overlay,
      battleSkillId,
      centerSkillId,
      catchSkillId,
      playerX,
      playerY,
      setScreen,
      setOverlay,
      startBattle,
      startCatch,
      startCenter,
      goOverworld,
      setPlayer,
    }),
    [
      screen,
      overlay,
      battleSkillId,
      centerSkillId,
      catchSkillId,
      playerX,
      playerY,
      startBattle,
      startCatch,
      startCenter,
      goOverworld,
      setPlayer,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGame() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useGame outside GameProvider");
  return ctx;
}

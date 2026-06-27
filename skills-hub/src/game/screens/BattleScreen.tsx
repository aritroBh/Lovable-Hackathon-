import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useJourney } from "../../JourneyContext";
import {
  fetchSkills,
  getSkill,
  startTavusConversation,
  type Skill,
} from "../../skills";
import { isSpecterAgentOnline, playSkillOnMac } from "../../specterAgent";
import { useGame } from "../GameContext";
import { isBoss, monName, spriteClass } from "../mons";

const ACTIONS = ["fight", "catch", "dex", "run"] as const;

function hpClass(pct: number): string {
  if (pct < 25) return "low";
  if (pct < 50) return "mid";
  return "";
}

export default function BattleScreen({ skillId }: { skillId: string }) {
  const navigate = useNavigate();
  const {
    journey,
    syncReady,
    markSeen,
    learnMove,
    equip,
    awardBadge,
    canCatchSkill,
    isTrainer,
  } = useJourney();
  const { goOverworld, startCatch, setOverlay, startCenter } = useGame();

  const [skill, setSkill] = useState<Skill | undefined>();
  const [msg, setMsg] = useState("What will you do?");
  const [phase, setPhase] = useState<"intro" | "menu" | "moves">("intro");
  const [actionSel, setActionSel] = useState(0);
  const [moveSel, setMoveSel] = useState(0);
  const [showMoves, setShowMoves] = useState(false);
  const [enemyHpPct, setEnemyHpPct] = useState(100);
  const [flash, setFlash] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ghostLoading, setGhostLoading] = useState(false);
  const [agentOnline, setAgentOnline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationUrl, setConversationUrl] = useState<string | null>(null);

  useEffect(() => {
    void fetchSkills().then(() => setSkill(getSkill(skillId)));
  }, [skillId]);

  useEffect(() => {
    void isSpecterAgentOnline().then(setAgentOnline);
  }, []);

  const entry = skill ? journey.entries[skill.id] : undefined;
  const totalMoves = Math.max(1, skill?.steps.length || 1);
  const movesLearned = entry?.movesLearned ?? 0;
  const trainer = skill ? isTrainer(skill.id, skill.author) : false;
  const mon = skill ? monName(skill) : "???";
  const boss = skill ? isBoss(skill) : false;

  useEffect(() => {
    if (!skill || !syncReady) return;
    const existing = journey.entries[skill.id];
    if (existing?.state && existing.state !== "unseen") return;
    const origin =
      existing?.origin ??
      (skill.author === journey.userId ? "hub_self" : "hub_trainer");
    markSeen(skill.id, {
      app: skill.app,
      author: skill.author,
      totalMoves,
      origin,
      state: "seen",
    });
  }, [skill?.id, syncReady, journey.entries, journey.userId, markSeen, totalMoves, skill]);

  useEffect(() => {
    if (!skill) return;
    setMsg(`${trainer ? "" : "Wild "}${mon} appeared!`);
    setPhase("intro");
    const t = setTimeout(() => {
      setPhase("menu");
      setMsg(`What will ${mon} do?`);
    }, 1200);
    return () => clearTimeout(t);
  }, [skill?.id, mon, trainer]);

  useEffect(() => {
    if (!skill) return;
    const remaining = Math.max(0, totalMoves - movesLearned);
    setEnemyHpPct(Math.round((remaining / totalMoves) * 100));
  }, [movesLearned, totalMoves, skill]);

  const steps =
    skill && skill.steps.length > 0
      ? skill.steps
      : skill
        ? [{ action: "scout", target: skill.title }]
        : [];

  const useMove = useCallback(
    (i: number) => {
      if (!skill || i > movesLearned) return;
      const st = steps[i];
      setMsg(`Used ${st?.target || "move"}! (${i + 1}/${totalMoves})`);
      setFlash(true);
      setTimeout(() => setFlash(false), 300);
      learnMove(skill.id, i, totalMoves);
      const newLearned = i + 1;
      const remaining = Math.max(0, totalMoves - newLearned);
      const pct = Math.round((remaining / totalMoves) * 100);
      setEnemyHpPct(pct);
      setShowMoves(false);
      setPhase("menu");

      if (newLearned >= totalMoves) {
        setTimeout(() => {
          setMsg(`You defeated ${mon}! Skill learned. TRAIN with PAL or CATCH.`);
          if (boss) {
            equip(skill.id);
            awardBadge(skill.app);
          }
        }, 800);
      } else {
        setTimeout(() => {
          setMsg(`What will ${mon} do?`);
        }, 1000);
      }
    },
    [skill, steps, totalMoves, movesLearned, learnMove, mon, boss, equip, awardBadge],
  );

  const runAway = useCallback(() => {
    navigate("/");
    goOverworld();
  }, [navigate, goOverworld]);

  const doAction = useCallback(
    (act: (typeof ACTIONS)[number]) => {
      if (!skill) return;
      if (act === "fight") {
        setPhase("moves");
        setShowMoves(true);
        setMsg("Choose a move to LEARN:");
        setMoveSel(movesLearned);
      } else if (act === "catch") {
        if (!canCatchSkill(skill.id)) {
          setMsg(
            trainer
              ? "Can't catch a TRAINER's skill!"
              : "Must learn all moves before CATCH!",
          );
          return;
        }
        startCatch(skill.id);
      } else if (act === "dex") {
        setOverlay("dex");
      } else {
        runAway();
      }
    },
    [skill, movesLearned, canCatchSkill, trainer, startCatch, setOverlay, runAway],
  );

  const talk = useCallback(async () => {
    if (!skill) return;
    setLoading(true);
    setError(null);
    try {
      const url = await startTavusConversation(skill.id, movesLearned);
      setConversationUrl(url);
      startCenter(skill.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [skill, movesLearned, startCenter]);

  const playGhost = useCallback(async () => {
    if (!skill?.replaySteps?.length) {
      setError("No ghost replay — record on Mac with Cmd+Shift+R.");
      return;
    }
    setGhostLoading(true);
    setError(null);
    try {
      await playSkillOnMac(skill.id, skill.replaySteps);
      setMsg("Ghost walkthrough running on your Mac!");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGhostLoading(false);
      void isSpecterAgentOnline().then(setAgentOnline);
    }
  }, [skill]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const k = e.key;
      if (phase === "menu" && !showMoves) {
        if (k === "ArrowRight" || k === "d") setActionSel((s) => (s + 1) % 4);
        if (k === "ArrowLeft" || k === "a") setActionSel((s) => (s + 3) % 4);
        if (k === "ArrowDown" || k === "s") setActionSel((s) => (s + 2) % 4);
        if (k === "ArrowUp" || k === "w") setActionSel((s) => (s + 2) % 4);
        if (k === "Enter") doAction(ACTIONS[actionSel]!);
        if (k === "Escape") runAway();
      } else if (showMoves) {
        if (k === "ArrowDown" || k === "s")
          setMoveSel((s) => Math.min(steps.length - 1, s + 1));
        if (k === "ArrowUp" || k === "w") setMoveSel((s) => Math.max(0, s - 1));
        if (k === "Enter") useMove(moveSel);
        if (k === "Escape") {
          setShowMoves(false);
          setPhase("menu");
          setMsg(`What will ${mon} do?`);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, showMoves, actionSel, moveSel, steps.length, doAction, useMove, runAway, mon]);

  if (!skill) {
    return (
      <div className="msg-box" style={{ margin: 16 }}>
        Loading…
      </div>
    );
  }

  const playerMon = journey.party[0]
    ? monName(getSkill(journey.party[0]) ?? skill)
    : "SPECTER";
  const playerHp = 100;

  return (
    <>
      <div className="battle-field">
        <div className="hud-box enemy-hud">
          <div className="hp-label">
            <span>
              {trainer ? "TRAINER" : "WILD"} {mon}
            </span>
            <span>Lv.{totalMoves}</span>
          </div>
          <div className="hp-bar">
            <div
              className={`hp-fill ${hpClass(enemyHpPct)}`}
              style={{ width: `${enemyHpPct}%` }}
            />
          </div>
        </div>
        <div className="platform enemy" />
        <div
          className={`mon-sprite enemy ${spriteClass(skill)}${flash ? " damage-flash" : ""}`}
        />
        <div className="platform player" />
        <div className="mon-sprite player ghost-sprite" />
        <div className="hud-box player-hud">
          <div className="hp-label">
            <span>{playerMon}</span>
            <span>Lv.{movesLearned || 1}</span>
          </div>
          <div className="hp-bar">
            <div className="hp-fill" style={{ width: `${playerHp}%` }} />
          </div>
        </div>
      </div>
      <div className="battle-panel">
        <div className="battle-panel-row">
          <div className="msg-box">{msg}</div>
          {!showMoves ? (
            <div className="action-box">
              {ACTIONS.map((act, i) => (
                <button
                  key={act}
                  type="button"
                  className={`action-btn${i === actionSel ? " selected" : ""}`}
                  onClick={() => {
                    setActionSel(i);
                    doAction(act);
                  }}
                >
                  <span className="arrow">▶</span>
                  {act === "fight"
                    ? "FIGHT"
                    : act === "catch"
                      ? "CATCH"
                      : act === "dex"
                        ? "POKéDEX"
                        : "RUN"}
                </button>
              ))}
            </div>
          ) : (
            <div className="moves-box show">
              {steps.map((st, i) => (
                <button
                  key={i}
                  type="button"
                  className={`move-btn${i === moveSel ? " selected" : ""}${i < movesLearned ? " learned" : ""}`}
                  disabled={i > movesLearned}
                  onClick={() => useMove(i)}
                >
                  <span className="arrow">▶</span>
                  {(st.target || st.action).slice(0, 18)}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="battle-extras">
          <button
            type="button"
            className="battle-extra-btn"
            disabled={ghostLoading || !skill.replaySteps?.length}
            onClick={() => void playGhost()}
          >
            {ghostLoading ? "GHOST…" : agentOnline ? "GHOST" : "GHOST OFF"}
          </button>
          <button
            type="button"
            className="battle-extra-btn"
            disabled={loading}
            onClick={() => void talk()}
          >
            {loading ? "PAL…" : "TRAIN PAL"}
          </button>
          {entry?.origin === "hub_trainer" && movesLearned >= totalMoves && (
            <button
              type="button"
              className="battle-extra-btn"
              onClick={() => equip(skill.id)}
            >
              ADD PARTY
            </button>
          )}
        </div>
        {error && <p className="battle-error">{error}</p>}
      </div>
      {conversationUrl && null}
    </>
  );
}

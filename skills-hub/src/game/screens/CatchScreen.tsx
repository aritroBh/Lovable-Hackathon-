import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useJourney } from "../../JourneyContext";
import { publishSkill } from "../../journeyApi";
import {
  clearSkillsCache,
  fetchSkills,
  getSkill,
} from "../../skills";
import { useGame } from "../GameContext";
import { monName } from "../mons";

export default function CatchScreen({ skillId }: { skillId: string }) {
  const navigate = useNavigate();
  const { journey, markSeen, sync, canCatchSkill } = useJourney();
  const { goOverworld } = useGame();
  const [step, setStep] = useState(0);
  const [shaking, setShaking] = useState(false);
  const [done, setDone] = useState(false);
  const [text, setText] = useState("Press ENTER or click the ball!");

  const skill = getSkill(skillId);
  const name = skill ? monName(skill) : "???";
  const totalMoves = Math.max(1, skill?.steps.length || 1);
  const entry = journey.entries[skillId];

  const throwBall = useCallback(async () => {
    if (done || !skill || !canCatchSkill(skillId)) return;
    setShaking(true);
    setText("…");
    setTimeout(() => setShaking(false), 500);
    const next = step + 1;
    setStep(next);

    if (next >= 3) {
      setDone(true);
      await sync();
      const ok = await publishSkill(skill as unknown as Record<string, unknown>);
      if (ok) {
        markSeen(skill.id, {
          app: skill.app,
          author: journey.userId,
          totalMoves,
          movesLearned: totalMoves,
          origin: entry?.origin === "mac" ? "mac" : "hub_self",
          state: "caught",
        });
        clearSkillsCache();
        await fetchSkills();
        await sync();
        setText(`Gotcha! ${name} was caught! Published to Hub.`);
      } else {
        setText("Publish failed — learn all moves first.");
        setDone(false);
        setStep(0);
      }
    } else {
      setTimeout(() => setText("Press ENTER to throw again!"), 600);
    }
  }, [done, skill, skillId, canCatchSkill, step, sync, markSeen, journey.userId, totalMoves, entry?.origin, name]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        void throwBall();
      }
      if (e.key === "Escape") {
        navigate("/");
        goOverworld();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [throwBall, navigate, goOverworld]);

  return (
    <div className="catch-scene">
      <div className="catch-name">{name}</div>
      <button
        type="button"
        className={`pokeball${shaking ? " shake" : ""}`}
        aria-label="Throw Poké Ball"
        onClick={() => void throwBall()}
      />
      <div className="catch-text">{text}</div>
      {done && <div className="sparkles">✦ ✦ ✦</div>}
      {done && (
        <button
          type="button"
          className="train-btn"
          style={{ marginTop: 16, maxWidth: 280 }}
          onClick={() => {
            navigate("/");
            goOverworld();
          }}
        >
          CONTINUE
        </button>
      )}
    </div>
  );
}

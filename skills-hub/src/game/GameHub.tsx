import { useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { useJourney } from "../JourneyContext";
import { GameProvider, useGame } from "./GameContext";
import ExternalHud from "./screens/ExternalHud";
import Overworld from "./screens/Overworld";
import BattleScreen from "./screens/BattleScreen";
import CatchScreen from "./screens/CatchScreen";
import CenterScreen from "./screens/CenterScreen";
import DexOverlay from "./screens/DexOverlay";
import PartyOverlay from "./screens/PartyOverlay";

function GameScreenInner() {
  const screenRef = useRef<HTMLDivElement>(null);
  const { journey } = useJourney();
  const {
    screen,
    overlay,
    battleSkillId,
    catchSkillId,
    centerSkillId,
    setOverlay,
    startCenter,
  } = useGame();

  useEffect(() => {
    screenRef.current?.focus();
  }, [screen, overlay]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "p" || e.key === "P") setOverlay("dex");
      if (e.key === "b" || e.key === "B") setOverlay("party");
      if ((e.key === "c" || e.key === "C") && screen === "overworld" && overlay === "none") {
        startCenter(journey.party[0] ?? null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [screen, overlay, setOverlay, startCenter, journey.party]);

  return (
    <div className="gbc-shell">
      <div className="gbc-label">NINTENDO GAME BOY COLOR · SPECTER SKILLS HUB</div>
      <div className="gbc-screen" ref={screenRef} tabIndex={0}>
        <div className={`screen screen-overworld${screen === "overworld" ? " active" : ""}`}>
          <Overworld />
        </div>
        <div className={`screen screen-battle${screen === "battle" ? " active" : ""}`}>
          {battleSkillId && <BattleScreen skillId={battleSkillId} />}
        </div>
        <div className={`screen screen-catch${screen === "catch" ? " active" : ""}`}>
          {catchSkillId && <CatchScreen skillId={catchSkillId} />}
        </div>
        <div className={`screen screen-center${screen === "center" ? " active" : ""}`}>
          <CenterScreen skillId={centerSkillId} />
        </div>
        {overlay === "dex" && <DexOverlay />}
        {overlay === "party" && <PartyOverlay />}
      </div>
    </div>
  );
}

export default function GameHub() {
  const { id } = useParams<{ id?: string }>();

  return (
    <GameProvider initialSkillId={id}>
      <div className="gbc-page">
        <div className="gbc-page-inner">
          <header className="gbc-header">
            <h1>SPECTER MON — LUMA REGION</h1>
            <p>Walk the route · Battle to learn · Catch to publish · Train with PAL</p>
          </header>
          <div className="gbc-legend">
            <span>⚔ BATTLE = Learn workflow steps</span>
            <span>◓ CATCH = Publish skill to Hub</span>
            <span>♥ TRAIN = PAL reinforces</span>
            <span>▣ POKéDEX = Browse skills</span>
          </div>
          <ExternalHud />
          <GameScreenInner />
          <p className="controls-hint">
            <kbd>↑↓←→</kbd> or <kbd>WASD</kbd> move · <kbd>ENTER</kbd> confirm ·{" "}
            <kbd>P</kbd> dex · <kbd>B</kbd> party · <kbd>C</kbd> center
          </p>
          <p className="gbc-footer">
            Battle to learn · Catch to publish · PAL trains your party. Synced via
            /api/journey
          </p>
        </div>
      </div>
    </GameProvider>
  );
}

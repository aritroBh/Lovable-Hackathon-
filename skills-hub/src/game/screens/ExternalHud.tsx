import { useJourney } from "../../JourneyContext";
import { useGame } from "../GameContext";

export default function ExternalHud() {
  const { journey } = useJourney();
  const { setOverlay, startCenter } = useGame();

  const dexCount = Object.keys(journey.entries).length;

  return (
    <div className="external-hud">
      <div className="external-hud-stats">
        <span>LUMA REGION</span>
        <span>PARTY {journey.party.length}/6</span>
        <span>POKéDEX {dexCount}</span>
        <span>BADGES {journey.badges.length}</span>
        <span>{journey.trainerRank.toUpperCase()}</span>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <button type="button" className="hud-chip" onClick={() => setOverlay("dex")}>
          P DEX
        </button>
        <button type="button" className="hud-chip" onClick={() => setOverlay("party")}>
          B PARTY
        </button>
        <button
          type="button"
          className="hud-chip"
          onClick={() => startCenter(journey.party[0] ?? null)}
        >
          C CENTER
        </button>
      </div>
    </div>
  );
}

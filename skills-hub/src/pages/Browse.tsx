import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useJourney } from "../JourneyContext";
import { fetchSkills, type Skill } from "../skills";

const MON: Record<string, string> = {
  "target-create-event": "CREATO",
  "target-add-to-calendar": "CALENDAW",
  "luma-event-profile": "LUMARA",
  "workflow-event-recap-session-1": "RECAPORDON",
};

export default function Browse() {
  const { journey } = useJourney();
  const [skills, setSkills] = useState<Skill[]>([]);

  useEffect(() => {
    void fetchSkills().then(setSkills);
  }, [journey.lastSyncedAt]);

  const caught = Object.values(journey.entries).filter(
    (e) => e.state === "caught" || e.state === "equipped",
  ).length;
  const learned = Object.values(journey.entries).filter((e) =>
    ["learned", "caught", "equipped"].includes(e.state),
  ).length;

  return (
    <div className="game-hub">
      <div className="game-hud">
        <span>LUMA REGION</span>
        <span>PARTY {journey.party.length}/6</span>
        <span>LEARNED {learned}</span>
        <span>CAUGHT {caught}</span>
        <span>{journey.trainerRank}</span>
      </div>
      <p className="tagline">
        Walk the route — battle to learn moves — catch to publish — train with
        PAL at the Pokémon Center.
      </p>
      <div className="route-map">
        {skills.map((s) => {
          const entry = journey.entries[s.id];
          const mon = MON[s.id] || s.title;
          const total = Math.max(1, s.steps.length || 1);
          const hp = entry
            ? Math.round((entry.movesLearned / total) * 100)
            : 0;
          const isBoss = s.steps.length > 5;
          return (
            <Link key={s.id} to={`/skill/${s.id}`} className="encounter-card">
              <div className={`mon-sprite-sm ${isBoss ? "boss" : ""}`} />
              <h2>{mon}</h2>
              <p className="meta">
                {s.app} · Lv.{total} · {entry?.state ?? "unseen"}
              </p>
              <div className="hp-track">
                <div className="hp-fill" style={{ width: `${hp}%` }} />
              </div>
              <span className="encounter-cta">
                {isBoss ? "GYM BATTLE" : "FIGHT"}
              </span>
            </Link>
          );
        })}
      </div>
      <p className="game-foot">
        Wild = learn on Mac · Trainer = learn from published skill · Catch =
        publish yours
      </p>
    </div>
  );
}

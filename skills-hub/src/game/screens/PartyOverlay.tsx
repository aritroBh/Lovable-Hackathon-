import { useCallback, useEffect, useState } from "react";
import { PARTY_MAX } from "../../journey";
import { useJourney } from "../../JourneyContext";
import { fetchSkills, getSkill } from "../../skills";
import { monName } from "../mons";
import { useGame } from "../GameContext";

export default function PartyOverlay() {
  const { journey, unequip } = useJourney();
  const { setOverlay, startCenter } = useGame();
  const [sel, setSel] = useState(0);

  useEffect(() => {
    void fetchSkills();
  }, [journey.lastSyncedAt]);

  const slots: (string | null)[] = [];
  for (let i = 0; i < PARTY_MAX; i++) {
    slots.push(journey.party[i] ?? null);
  }

  const close = useCallback(() => setOverlay("none"), [setOverlay]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowDown") setSel((s) => Math.min(PARTY_MAX - 1, s + 1));
      if (e.key === "ArrowUp") setSel((s) => Math.max(0, s - 1));
      if (e.key === "Enter") {
        const id = slots[sel];
        if (id) startCenter(id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close, slots, sel, startCenter]);

  return (
    <div className="party-overlay show">
      <div className="party-title">YOUR PARTY ({journey.party.length}/{PARTY_MAX})</div>
      <div className="party-list">
        {slots.map((id, i) => {
          if (!id) {
            return (
              <div key={i} className={`party-slot empty${i === sel ? " selected" : ""}`}>
                [{i + 1}] — empty —
              </div>
            );
          }
          const skill = getSkill(id);
          const e = journey.entries[id];
          const total = Math.max(1, skill?.steps.length || 1);
          const hp = e ? Math.round((e.movesLearned / total) * 100) : 0;
          const name = skill ? monName(skill) : id;
          return (
            <div
              key={i}
              className={`party-slot${i === sel ? " selected" : ""}`}
              onClick={() => setSel(i)}
            >
              <span>
                [{i + 1}] {name} Lv.{total}
              </span>
              <span className="dex-mini-hp">
                <span className="hp-fill" style={{ width: `${hp}%`, display: "block" }} />
              </span>
            </div>
          );
        })}
      </div>
      <div className="party-footer">
        <button
          type="button"
          className="train-btn"
          style={{ flex: 1 }}
          disabled={!slots[sel]}
          onClick={() => {
            const id = slots[sel];
            if (id) {
              setOverlay("none");
              startCenter(id);
            }
          }}
        >
          TRAIN PAL
        </button>
        <button
          type="button"
          className="train-btn"
          style={{ flex: 1 }}
          disabled={!slots[sel]}
          onClick={() => {
            const id = slots[sel];
            if (id) unequip(id);
          }}
        >
          REMOVE
        </button>
        <button type="button" className="train-btn" style={{ flex: 1 }} onClick={close}>
          CLOSE
        </button>
      </div>
    </div>
  );
}

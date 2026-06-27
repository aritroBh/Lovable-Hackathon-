import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useJourney } from "../../JourneyContext";
import { fetchSkills, type Skill } from "../../skills";
import { dexNumber, isBoss, monName } from "../mons";
import { useGame } from "../GameContext";

type DexTab = "all" | "caught" | "learned" | "unseen" | "trainer";

function entryLabel(
  skill: Skill,
  journey: ReturnType<typeof useJourney>["journey"],
): string {
  const e = journey.entries[skill.id];
  if (!e || e.state === "unseen") return "unseen";
  if (e.state === "equipped") return "equipped";
  if (e.state === "caught") return "caught";
  if (e.state === "learned") return "learned";
  if (e.state === "learning") return "learning";
  return "seen";
}

function rowClass(state: string): string {
  if (state === "caught" || state === "equipped") return "caught";
  if (state === "seen" || state === "unseen") return "seen";
  return "";
}

export default function DexOverlay() {
  const navigate = useNavigate();
  const { journey, isTrainer } = useJourney();
  const { setOverlay, startBattle } = useGame();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<DexTab>("all");
  const [sel, setSel] = useState(0);

  useEffect(() => {
    void fetchSkills().then(setSkills);
  }, [journey.lastSyncedAt]);

  const allIds = useMemo(() => skills.map((s) => s.id), [skills]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return skills.filter((s) => {
      const e = journey.entries[s.id];
      const state = entryLabel(s, journey);
      const trainer = isTrainer(s.id, s.author);

      if (tab === "caught" && !["caught", "equipped"].includes(state)) return false;
      if (tab === "learned" && !["learned", "caught", "equipped"].includes(state))
        return false;
      if (tab === "unseen" && state !== "unseen" && e) return false;
      if (tab === "trainer" && !trainer) return false;

      if (!q) return true;
      const hay = [monName(s), s.title, s.app, s.author, ...(s.tags || [])]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [skills, journey, search, tab, isTrainer]);

  const close = useCallback(() => setOverlay("none"), [setOverlay]);

  const fight = useCallback(
    (skill: Skill) => {
      navigate(`/skill/${skill.id}`);
      startBattle(skill.id);
      setOverlay("none");
    },
    [navigate, startBattle, setOverlay],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) {
        if (e.key === "Escape") close();
        return;
      }
      if (e.key === "Escape") close();
      if (e.key === "ArrowDown") setSel((s) => Math.min(filtered.length - 1, s + 1));
      if (e.key === "ArrowUp") setSel((s) => Math.max(0, s - 1));
      if (e.key === "Enter" && filtered[sel]) fight(filtered[sel]!);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [filtered, sel, close, fight]);

  useEffect(() => {
    setSel(0);
  }, [tab, search]);

  const tabs: { id: DexTab; label: string }[] = [
    { id: "all", label: "ALL" },
    { id: "caught", label: "CAUGHT" },
    { id: "learned", label: "LEARNED" },
    { id: "unseen", label: "UNSEEN" },
    { id: "trainer", label: "TRAINER" },
  ];

  return (
    <div className="dex-overlay show">
      <div className="dex-title">PROF. SPECTER&apos;s POKéDEX</div>
      <input
        className="dex-search"
        placeholder="Search skills…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="dex-tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`dex-tab${tab === t.id ? " active" : ""}`}
            aria-label={`Filter ${t.label}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="dex-list">
        {filtered.map((s, i) => {
          const num = dexNumber(s.id, allIds);
          const state = entryLabel(s, journey);
          const e = journey.entries[s.id];
          const total = Math.max(1, s.steps.length || 1);
          const hp = e ? Math.round((e.movesLearned / total) * 100) : 0;
          const trainer = isTrainer(s.id, s.author);
          const secret = state === "unseen" && !e && !search.trim();
          const label = secret ? "???" : monName(s);
          return (
            <div
              key={s.id}
              role="button"
              tabIndex={0}
              className={`dex-row ${rowClass(state)}${i === sel ? " selected" : ""}`}
              onClick={() => fight(s)}
            >
              <span>
                #{String(num).padStart(3, "0")} {label} — {s.app} · Lv.
                {total} · {state.toUpperCase()}
                {isBoss(s) ? " ★" : ""}
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {trainer && <span className="dex-badge">TRAINER</span>}
                <span className="dex-mini-hp">
                  <span className="hp-fill" style={{ width: `${hp}%`, display: "block" }} />
                </span>
              </span>
            </div>
          );
        })}
        {!filtered.length && (
          <div className="dex-row seen">No skills match.</div>
        )}
      </div>
      <div className="dex-footer">
        <button type="button" className="train-btn" style={{ flex: 1 }} onClick={close}>
          CLOSE
        </button>
      </div>
    </div>
  );
}

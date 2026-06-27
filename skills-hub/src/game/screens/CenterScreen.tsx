import { useCallback, useEffect, useState } from "react";
import { useJourney } from "../../JourneyContext";
import { fetchSkills, getSkill, startTavusConversation, endTavusConversation } from "../../skills";
import { useGame } from "../GameContext";
import { monName } from "../mons";

export default function CenterScreen({ skillId }: { skillId: string | null }) {
  const { journey } = useJourney();
  const { goOverworld } = useGame();
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sid = skillId ?? journey.party[0] ?? null;
  const skill = sid ? getSkill(sid) : undefined;
  const entry = sid ? journey.entries[sid] : undefined;
  const mon = skill ? monName(skill) : "your party";

  useEffect(() => {
    void fetchSkills();
  }, []);

  const loadPal = useCallback(async () => {
    if (!sid) return;
    setLoading(true);
    setError(null);
    try {
      const conversationUrl = await startTavusConversation(
        sid,
        entry?.movesLearned,
      );
      setUrl(conversationUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [sid, entry?.movesLearned]);

  useEffect(() => {
    void loadPal();
  }, [loadPal]);

  useEffect(() => {
    return () => {
      if (url) void endTavusConversation(url);
    };
  }, [url]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" || e.key === "Escape") goOverworld();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goOverworld]);

  return (
    <>
      <div className="center-sign">★ POKéMON CENTER ★</div>
      <div className="pal-frame">
        {url ? (
          <iframe
            src={url}
            title="Specter PAL"
            allow="camera; microphone; fullscreen; display-capture; autoplay"
          />
        ) : (
          <div className="pal-placeholder">
            {loading ? "Starting PAL…" : error ?? "Select a skill to TRAIN"}
          </div>
        )}
      </div>
      <p className="center-body">
        Specter restored {mon}!
        <br />
        Ready to TRAIN with PAL?
      </p>
      {error && !url && <p className="battle-error">{error}</p>}
      <button type="button" className="train-btn" onClick={goOverworld}>
        CONTINUE ADVENTURE
      </button>
    </>
  );
}

import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useJourney } from "../JourneyContext";
import { publishSkill } from "../journeyApi";
import {
  clearSkillsCache,
  fetchSkills,
  getSkill,
  startTavusConversation,
  type Skill,
} from "../skills";
import { isSpecterAgentOnline, playSkillOnMac } from "../specterAgent";

export default function SkillDetail() {
  const { id } = useParams<{ id: string }>();
  const { journey, syncReady, markSeen, learnMove, equip, canCatchSkill, isTrainer, sync } =
    useJourney();
  const [skill, setSkill] = useState<Skill | undefined>();
  const [conversationUrl, setConversationUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ghostLoading, setGhostLoading] = useState(false);
  const [agentOnline, setAgentOnline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState("What will you do?");

  useEffect(() => {
    void fetchSkills().then(() => setSkill(id ? getSkill(id) : undefined));
  }, [id]);

  useEffect(() => {
    void isSpecterAgentOnline().then(setAgentOnline);
  }, []);

  const entry = skill ? journey.entries[skill.id] : undefined;
  const totalMoves = Math.max(1, skill?.steps.length || 1);
  const movesLearned = entry?.movesLearned ?? 0;
  const hpPct = Math.round((movesLearned / totalMoves) * 100);
  const trainer = skill ? isTrainer(skill.id, skill.author) : false;

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
  }, [
    skill?.id,
    syncReady,
    journey.entries[skill?.id ?? ""]?.origin,
    journey.entries[skill?.id ?? ""]?.state,
    journey.userId,
    markSeen,
    totalMoves,
  ]);

  const useMove = useCallback(
    (i: number) => {
      if (!skill) return;
      const st = skill.steps[i];
      setMsg(`Used ${st?.target || "move"}! (${i + 1}/${totalMoves})`);
      learnMove(skill.id, i, totalMoves);
      if (i + 1 >= totalMoves) {
        setMsg("You won! Skill learned. TRAIN with PAL or CATCH to publish.");
        if (skill.steps.length > 5) equip(skill.id);
      }
    },
    [skill, totalMoves, learnMove, equip],
  );

  const talk = useCallback(async () => {
    if (!skill) return;
    setLoading(true);
    setError(null);
    setConversationUrl(null);
    try {
      const url = await startTavusConversation(skill.id, movesLearned);
      setConversationUrl(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [skill, movesLearned]);

  const playGhost = useCallback(async () => {
    if (!skill) return;
    const replaySteps = skill.replaySteps;
    if (!replaySteps?.length) {
      setError(
        "This skill has no ghost replay data yet — record it on Mac with Cmd+Shift+R.",
      );
      return;
    }
    setGhostLoading(true);
    setError(null);
    try {
      await playSkillOnMac(skill.id, replaySteps);
      setMsg("Ghost walkthrough running on your Mac — follow the spectral cursor.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGhostLoading(false);
      void isSpecterAgentOnline().then(setAgentOnline);
    }
  }, [skill]);

  const catchSkill = useCallback(async () => {
    if (!skill || !canCatchSkill(skill.id)) return;
    setError(null);
    await sync();
    const ok = await publishSkill(skill as unknown as Record<string, unknown>);
    if (ok) {
      setMsg("Gotcha! Published to Skills Hub.");
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
      setSkill(getSkill(skill.id));
      await sync();
    } else setError("Publish failed — learn all moves first.");
  }, [skill, entry?.origin, totalMoves, canCatchSkill, markSeen, journey.userId, sync]);

  if (!skill) return <p className="error">Skill not found</p>;

  const steps =
    skill.steps.length > 0
      ? skill.steps
      : [{ action: "scout", target: skill.title }];

  return (
    <div className="battle-screen">
      <Link to="/" className="back">
        ← Route map
      </Link>
      <div className="battle-field">
        <div className="battle-hud">
          <span>
            {trainer ? "TRAINER" : "WILD"} {skill.title}
          </span>
          <span>Lv.{totalMoves}</span>
        </div>
        <div className="hp-track battle-hp">
          <div className="hp-fill" style={{ width: `${hpPct}%` }} />
        </div>
        <p className="battle-msg">{msg}</p>
      </div>

      <div className="move-grid">
        {steps.map((st, i) => (
          <button
            key={i}
            type="button"
            className={`move-btn ${i < movesLearned ? "learned" : ""}`}
            disabled={i > movesLearned}
            onClick={() => useMove(i)}
          >
            {st.action} — {st.target}
          </button>
        ))}
      </div>

      <div className="battle-actions">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void playGhost()}
          disabled={ghostLoading || !skill.replaySteps?.length}
          title={
            agentOnline
              ? "Replay this skill with Specter's ghost cursor"
              : "Launch Specter on this Mac first"
          }
        >
          {ghostLoading
            ? "Starting ghost…"
            : agentOnline
              ? "GHOST WALKTHROUGH"
              : "GHOST (Specter offline)"}
        </button>
        <button type="button" className="btn btn-primary" onClick={() => void talk()} disabled={loading}>
          {loading ? "Starting PAL…" : "TRAIN with PAL"}
        </button>
        {canCatchSkill(skill.id) && (
          <button type="button" className="btn" onClick={() => void catchSkill()}>
            CATCH (Publish)
          </button>
        )}
        {entry?.origin === "hub_trainer" && movesLearned >= totalMoves && (
          <button type="button" className="btn" onClick={() => equip(skill.id)}>
            Add to party
          </button>
        )}
      </div>
      {error && <p className="error">{error}</p>}
      {conversationUrl && (
        <div className="iframe-wrap">
          <iframe
            src={conversationUrl}
            allow="camera; microphone; fullscreen; display-capture; autoplay"
            title="Specter PAL"
          />
        </div>
      )}
    </div>
  );
}

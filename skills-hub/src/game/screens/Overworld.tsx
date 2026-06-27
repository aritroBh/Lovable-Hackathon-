import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useJourney } from "../../JourneyContext";
import { fetchSkills, type Skill } from "../../skills";
import { monName } from "../mons";
import { useGame } from "../GameContext";
import {
  COLS,
  ROWS,
  TILE,
  buildingAt,
  canWalk,
  tileAt,
  tileClass,
} from "../map";

function pickWildSkill(skills: Skill[], journey: ReturnType<typeof useJourney>["journey"]): Skill | undefined {
  const pool = skills.filter((s) => {
    const e = journey.entries[s.id];
    if (!e) return true;
    return !["learned", "caught", "equipped"].includes(e.state);
  });
  if (!pool.length) return skills[Math.floor(Math.random() * skills.length)];
  return pool[Math.floor(Math.random() * pool.length)];
}

function pickBossSkill(skills: Skill[]): Skill | undefined {
  return skills.find((s) => s.steps.length > 5) ?? skills[0];
}

function pickCatchSkill(
  skills: Skill[],
  canCatchSkill: (id: string) => boolean,
): Skill | undefined {
  return skills.find((s) => canCatchSkill(s.id));
}

export default function Overworld() {
  const navigate = useNavigate();
  const { journey, canCatchSkill } = useJourney();
  const {
    playerX,
    playerY,
    setPlayer,
    startBattle,
    startCatch,
    startCenter,
  } = useGame();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [dialog, setDialog] = useState(
    "Welcome to LUMA REGION! Walk into tall grass to learn skills.",
  );
  const [dialogQueue, setDialogQueue] = useState<string[]>([]);
  const [queueIdx, setQueueIdx] = useState(0);
  const pendingAction = useRef<(() => void) | null>(null);

  useEffect(() => {
    void fetchSkills().then(setSkills);
  }, [journey.lastSyncedAt]);

  const showDialog = useCallback((text: string, queue?: string[], then?: () => void) => {
    pendingAction.current = then ?? null;
    if (queue?.length) {
      setDialogQueue(queue);
      setQueueIdx(0);
      setDialog(queue[0]);
    } else {
      setDialogQueue([]);
      setDialog(text);
    }
  }, []);

  const advanceDialog = useCallback(() => {
    if (dialogQueue.length && queueIdx < dialogQueue.length - 1) {
      const next = queueIdx + 1;
      setQueueIdx(next);
      setDialog(dialogQueue[next]!);
      return;
    }
    const action = pendingAction.current;
    pendingAction.current = null;
    setDialogQueue([]);
    if (action) action();
  }, [dialogQueue, queueIdx]);

  const enterBattle = useCallback(
    (skill: Skill) => {
      navigate(`/skill/${skill.id}`);
      startBattle(skill.id);
    },
    [navigate, startBattle],
  );

  const onLand = useCallback(
    (x: number, y: number) => {
      const b = buildingAt(x, y);
      if (b) {
        if (b.type === "center") {
          showDialog("", b.msg, () => {
            const sid = journey.party[0] ?? skills[0]?.id ?? null;
            startCenter(sid);
          });
        } else if (b.type === "gym") {
          const boss = pickBossSkill(skills);
          if (boss) {
            showDialog("", b.msg, () => enterBattle(boss));
          }
        } else if (b.type === "lab") {
          const catchable = pickCatchSkill(skills, canCatchSkill);
          if (catchable) {
            showDialog("", b.msg, () => startCatch(catchable.id));
          } else {
            showDialog("Learn all moves on a skill before you can CATCH!");
          }
        }
        return;
      }
      if (tileAt(x, y) === "g" && skills.length) {
        const wild = pickWildSkill(skills, journey);
        if (wild) {
          showDialog("", ["The grass rustled…", `A wild ${monName(wild)} appeared!`], () =>
            enterBattle(wild),
          );
        }
      }
    },
    [skills, journey, canCatchSkill, showDialog, enterBattle, startCatch, startCenter],
  );

  const movePlayer = useCallback(
    (dx: number, dy: number) => {
      const nx = playerX + dx;
      const ny = playerY + dy;
      if (!canWalk(nx, ny)) return;
      setPlayer(nx, ny);
      onLand(nx, ny);
    },
    [playerX, playerY, setPlayer, onLand],
  );

  const walkTo = useCallback(
    (tx: number, ty: number) => {
      if (!canWalk(tx, ty)) return;
      const dx = Math.sign(tx - playerX);
      const dy = Math.sign(ty - playerY);
      if (Math.abs(tx - playerX) + Math.abs(ty - playerY) === 1) {
        movePlayer(dx, dy);
      }
    },
    [playerX, playerY, movePlayer],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const k = e.key;
      if (k === "ArrowUp" || k === "w" || k === "W") movePlayer(0, -1);
      else if (k === "ArrowDown" || k === "s" || k === "S") movePlayer(0, 1);
      else if (k === "ArrowLeft" || k === "a" || k === "A") movePlayer(-1, 0);
      else if (k === "ArrowRight" || k === "d" || k === "D") movePlayer(1, 0);
      else if (k === "Enter" || k === " ") {
        e.preventDefault();
        advanceDialog();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [movePlayer, advanceDialog]);

  const tiles = [];
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const cls = tileClass(x, y);
      const walkable = canWalk(x, y);
      tiles.push(
        <button
          key={`${x},${y}`}
          type="button"
          className={`tile ${cls}${walkable ? " walkable" : ""}`}
          aria-label={`tile ${x},${y}`}
          onClick={() => walkTo(x, y)}
        />,
      );
    }
  }

  return (
    <>
      <div className="map-grid">{tiles}</div>
      <div
        className="player"
        style={{ left: playerX * TILE + 3, top: playerY * TILE - 4 }}
      >
        <div className="player-head" />
        <div className="player-body" />
        <div className="player-legs">
          <span />
          <span />
        </div>
      </div>
      <div className="dialog-bar" role="button" tabIndex={0} onClick={advanceDialog}>
        {dialog}
        <span className="cursor">▼</span>
      </div>
    </>
  );
}

import { randomUUID } from "crypto";
import type { BehavioralFrame, Session, Step } from "./types";

const MAX_STEPS = 80;
const MIN_CLICKS = 1;
const PAUSE_WAIT_MS = 1800;
const TYPING_BURST_GAP_MS = 900;
const SCAN_SAMPLE_EVERY_MS = 2200;

export interface BuiltSkill {
  id: string;
  title: string;
  app: string;
  tags: string[];
  author: string;
  sourceSessionId: string;
  timestamp: string;
  confidence: number;
  steps: Array<{ action: string; target: string }>;
  replaySteps: Step[];
  body: string;
  contextBody: string;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function stepTargetLabel(step: Step): string {
  return (
    step.targetLabel ||
    step.instruction ||
    step.title ||
    step.typeText ||
    step.action
  );
}

function hubStepsFromReplay(steps: Step[]): Array<{ action: string; target: string }> {
  return steps.map((step) => ({
    action: step.action,
    target: stepTargetLabel(step),
  }));
}

function markdownBody(app: string, steps: Step[]): string {
  let md = `# ${app} workflow\n\n`;
  md += `Recorded skill for **${app}**.\n\n## Steps\n`;
  steps.forEach((step, index) => {
    md += `${index + 1}. **Action**: \`${step.action}\``;
    const label = stepTargetLabel(step);
    if (label) md += ` on **${label}**`;
    if (step.delayMs) md += ` (after ${step.delayMs}ms)`;
    md += "\n";
  });
  return md;
}

export function framesToSteps(
  frames: BehavioralFrame[],
  startedAt: number,
): Step[] {
  const real = frames.filter((frame) => frame.synthetic !== true);
  const steps: Step[] = [];
  let lastStepTime = startedAt;
  let lastCursor = { x: 50, y: 50 };
  let lastScanAt = startedAt;
  let typingOpen = false;

  for (const frame of real) {
    const delayMs = Math.max(0, frame.t - lastStepTime);

    if (
      typeof frame.cursorX === "number" &&
      typeof frame.cursorY === "number"
    ) {
      lastCursor = { x: frame.cursorX, y: frame.cursorY };
    }

    if (
      frame.actionType === "pause" &&
      frame.dwellMs >= PAUSE_WAIT_MS &&
      steps.length > 0
    ) {
      steps.push({
        action: "wait",
        x: lastCursor.x,
        y: lastCursor.y,
        viewportX: lastCursor.x,
        viewportY: lastCursor.y,
        coordinateFrame: "viewport",
        delayMs: Math.min(frame.dwellMs, 6000),
        instruction: "Pause — match the UI, then continue",
      });
      lastStepTime = frame.t;
      typingOpen = false;
      continue;
    }

    if (
      frame.actionType === "scan" &&
      frame.t - lastScanAt >= SCAN_SAMPLE_EVERY_MS &&
      typeof frame.cursorX === "number" &&
      typeof frame.cursorY === "number"
    ) {
      lastScanAt = frame.t;
      steps.push({
        action: "wait",
        x: frame.cursorX,
        y: frame.cursorY,
        viewportX: frame.cursorX,
        viewportY: frame.cursorY,
        coordinateFrame: "viewport",
        delayMs: Math.min(delayMs, 1200),
        instruction: "Move here",
      });
      lastStepTime = frame.t;
      continue;
    }

    if (
      frame.actionType === "click" ||
      frame.actionType === "repeat-click"
    ) {
      if (frame.cursorX == null || frame.cursorY == null) continue;
      const prev = steps[steps.length - 1];
      if (
        prev?.action === "click" &&
        Math.hypot(prev.x - frame.cursorX, prev.y - frame.cursorY) < 0.4 &&
        delayMs < 400
      ) {
        lastStepTime = frame.t;
        continue;
      }
      steps.push({
        action: "click",
        x: frame.cursorX,
        y: frame.cursorY,
        viewportX: frame.cursorX,
        viewportY: frame.cursorY,
        coordinateFrame: "viewport",
        sourceFrame: "viewport",
        delayMs,
        targetLabel: frame.targetLabel || "Click target",
        appName: frame.app,
      });
      lastStepTime = frame.t;
      typingOpen = false;
      continue;
    }

    if (frame.actionType === "type" || frame.actionType === "backtrack") {
      if (!typingOpen || delayMs > TYPING_BURST_GAP_MS) {
        steps.push({
          action: "type",
          x: lastCursor.x,
          y: lastCursor.y,
          viewportX: lastCursor.x,
          viewportY: lastCursor.y,
          coordinateFrame: "viewport",
          delayMs,
          instruction:
            frame.actionType === "backtrack"
              ? "Edit text here"
              : "Type here",
          appName: frame.app,
        });
        typingOpen = true;
      }
      lastStepTime = frame.t;
    }
  }

  return steps.slice(0, MAX_STEPS);
}

export function buildSkillFromRecording(input: {
  frames: BehavioralFrame[];
  startedAt: number;
  appName: string;
  author: string;
}): { skill: BuiltSkill; session: Session } | { error: string } {
  const replaySteps = framesToSteps(input.frames, input.startedAt);
  const clickCount = replaySteps.filter((step) => step.action === "click").length;

  if (clickCount < MIN_CLICKS) {
    return {
      error:
        "Not enough actions captured — click at least once while recording, then try again.",
    };
  }

  const sessionId = randomUUID();
  const timestamp = new Date().toISOString();
  const app = input.appName.trim() || "Desktop";
  const id = `skill-${slugify(app)}-${Date.now().toString(36)}`;
  const title = `${app} workflow`;
  const body = markdownBody(app, replaySteps);
  const contextBody =
    body.length > 2800 ? `${body.slice(0, 2800)}\n\n[truncated]` : body;

  const skill: BuiltSkill = {
    id,
    title,
    app,
    tags: ["recorded", app],
    author: input.author,
    sourceSessionId: sessionId,
    timestamp,
    confidence: 0.85,
    steps: hubStepsFromReplay(replaySteps),
    replaySteps,
    body,
    contextBody,
  };

  const session: Session = {
    id: sessionId,
    timestamp,
    nodesVisited: [id],
    steps: replaySteps,
  };

  return { skill, session };
}

export function normalizeReplaySteps(steps: unknown[]): Step[] {
  if (!Array.isArray(steps)) return [];
  return steps
    .map((raw) => {
      if (!raw || typeof raw !== "object") return null;
      const step = raw as Record<string, unknown>;
      const action = step.action;
      if (
        action !== "click" &&
        action !== "type" &&
        action !== "scroll" &&
        action !== "wait"
      ) {
        return null;
      }
      const x =
        typeof step.viewportX === "number"
          ? step.viewportX
          : typeof step.x === "number"
            ? step.x
            : 50;
      const y =
        typeof step.viewportY === "number"
          ? step.viewportY
          : typeof step.y === "number"
            ? step.y
            : 50;
      return {
        action,
        x: Math.min(100, Math.max(0, x)),
        y: Math.min(100, Math.max(0, y)),
        viewportX: Math.min(100, Math.max(0, x)),
        viewportY: Math.min(100, Math.max(0, y)),
        coordinateFrame: "viewport" as const,
        delayMs:
          typeof step.delayMs === "number"
            ? Math.max(0, Math.round(step.delayMs))
            : 0,
        targetLabel:
          typeof step.targetLabel === "string" ? step.targetLabel : undefined,
        instruction:
          typeof step.instruction === "string" ? step.instruction : undefined,
        typeText:
          typeof step.typeText === "string" ? step.typeText : undefined,
      };
    })
    .filter((step): step is Step => step !== null);
}

import type { BrowserWindow } from "electron";
import { Notification } from "electron";
import { setSkillRecordingCollector } from "../behavioral/tracker";
import { getForegroundAppLabel } from "../context/contextTracker";
import { publishBuiltSkillToHub } from "../hubSync";
import { safeError, safeLog } from "../logger";
import { compileSessionToWiki } from "../wiki/workflowCompiler";
import { writeWikiPage } from "../wiki/wikiWriter";
import { join } from "path";
import { saveToNode } from "./recorder";
import { loadGraph, saveGraph } from "./storage";
import type { BehavioralFrame } from "./types";
import { buildSkillFromRecording, type BuiltSkill } from "./skillBuilder";

export interface SkillRecordingState {
  active: boolean;
  startedAt: number | null;
  appName: string | null;
  frameCount: number;
}

export interface SkillRecordToggleResult {
  recording: boolean;
  skill?: BuiltSkill;
  error?: string;
  published?: boolean;
}

let recording = false;
let startedAt: number | null = null;
let frames: BehavioralFrame[] = [];
let overlayWasHidden = false;
let getOverlayWindow: () => BrowserWindow | null = () => null;
let sendOverlayEvent: (channel: string, payload?: unknown) => void = () => {};

function notify(title: string, body: string): void {
  if (!Notification.isSupported()) return;
  new Notification({ title, body }).show();
}

function emitState(): void {
  sendOverlayEvent("skill:recording", {
    active: recording,
    startedAt,
    appName: recording ? getForegroundAppLabel() || "Desktop" : null,
    frameCount: frames.length,
  });
}

function ensureRecordingHudVisible(): void {
  const overlay = getOverlayWindow();
  if (!overlay || overlay.isDestroyed()) return;
  if (!overlay.isVisible()) {
    overlayWasHidden = true;
    overlay.showInactive();
    overlay.moveTop();
    overlay.setIgnoreMouseEvents(true, { forward: true });
  }
}

function maybeHideOverlayAfterRecording(): void {
  if (!overlayWasHidden) return;
  const overlay = getOverlayWindow();
  overlayWasHidden = false;
  if (!overlay || overlay.isDestroyed()) return;
  overlay.hide();
}

function onSkillFrame(frame: BehavioralFrame): void {
  if (!recording) return;
  frames.push(frame);
  if (frames.length % 12 === 0) {
    emitState();
  }
}

export function configureSkillRecorder(deps: {
  overlayProvider: () => BrowserWindow | null;
  overlayEmitter: (channel: string, payload?: unknown) => void;
}): void {
  getOverlayWindow = deps.overlayProvider;
  sendOverlayEvent = deps.overlayEmitter;
  setSkillRecordingCollector(onSkillFrame);
}

export function getSkillRecordingState(): SkillRecordingState {
  return {
    active: recording,
    startedAt,
    appName: recording ? getForegroundAppLabel() || "Desktop" : null,
    frameCount: frames.length,
  };
}

export function isSkillRecording(): boolean {
  return recording;
}

export async function toggleSkillRecording(
  appName = "Specter",
): Promise<SkillRecordToggleResult> {
  if (!recording) {
    recording = true;
    startedAt = Date.now();
    frames = [];
    overlayWasHidden = false;
    ensureRecordingHudVisible();
    emitState();
    notify(
      "Specter — skill recording",
      "Recording your actions. Press Cmd+Shift+R again to stop and publish.",
    );
    safeLog("[SKILL_REC] started", {
      app: getForegroundAppLabel(),
    });
    return { recording: true };
  }

  recording = false;
  const capturedAt = startedAt ?? Date.now();
  const capturedFrames = [...frames];
  frames = [];
  startedAt = null;
  emitState();

  const built = buildSkillFromRecording({
    frames: capturedFrames,
    startedAt: capturedAt,
    appName: getForegroundAppLabel() || appName,
    author: process.env.SPECTER_USER_ID || "mac-local",
  });

  if ("error" in built) {
    maybeHideOverlayAfterRecording();
    notify("Skill recording failed", built.error);
    safeError("[SKILL_REC] build failed", { error: built.error });
    return { recording: false, error: built.error };
  }

  const graph = saveToNode(
    loadGraph(appName),
    built.skill.id,
    built.session.steps,
  );
  const lastIndex = graph.sessions.length - 1;
  if (lastIndex >= 0) {
    graph.sessions[lastIndex] = {
      ...graph.sessions[lastIndex],
      id: built.session.id,
      timestamp: built.session.timestamp,
      nodesVisited: built.session.nodesVisited,
    };
  }
  saveGraph(graph);

  const wikiRoot =
    process.env.GHOSTWIKI_WIKI_ROOT ||
    join(process.cwd(), "demo-workflows/event-recap/wiki");
  try {
    for (const page of compileSessionToWiki(built.session, built.skill.app)) {
      writeWikiPage(page, wikiRoot);
    }
  } catch (error) {
    safeError("[SKILL_REC] wiki compile failed", { error });
  }

  let published = false;
  try {
    published = await publishBuiltSkillToHub(built.skill);
  } catch (error) {
    safeError("[SKILL_REC] publish failed", { error });
  }

  sendOverlayEvent("skill:built", {
    skill: {
      id: built.skill.id,
      title: built.skill.title,
      app: built.skill.app,
      stepCount: built.skill.replaySteps.length,
      published,
    },
  });

  maybeHideOverlayAfterRecording();

  const summary = published
    ? `Published "${built.skill.title}" (${built.skill.replaySteps.length} steps) to Skills Hub.`
    : `Saved "${built.skill.title}" locally (${built.skill.replaySteps.length} steps). Set SKILLS_HUB_URL to publish.`;

  notify("Skill captured", summary);
  safeLog("[SKILL_REC] stopped", {
    skillId: built.skill.id,
    steps: built.skill.replaySteps.length,
    published,
  });

  return {
    recording: false,
    skill: built.skill,
    published,
  };
}

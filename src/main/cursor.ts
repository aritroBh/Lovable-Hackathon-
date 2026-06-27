import { mouse, straightTo, Button, keyboard } from "@nut-tree-fork/nut-js";
import { screen } from "electron";
import { Step } from "./session/types";
import {
  toScreenPoint,
  getActiveCoordinateDisplay,
  getActiveCoordinateDisplayId,
} from "./screenCoordinates";
import { safeLog, safeError, safeWarn } from "./logger";
import {
  clickAtScreenPixel,
  clickElementByIndex,
  isOpenaraInstalled,
} from "./openara";
import { viewportPercentFromAxDumpIndex } from "./automation/liveTargetResolver";

const DEFAULT_MOVE_DURATION_MS = 650;
/** Max px drift allowed before nut-js click after moveRealMouse. */
const CLICK_TOLERANCE_PX = 12;

class CursorGuardrailError extends Error {
  constructor(
    message: string,
    readonly diagnostics: Record<string, unknown>,
  ) {
    super(message);
    this.name = "CursorGuardrailError";
  }
}

function assertValidPercent(x: number, y: number): void {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    throw new CursorGuardrailError(
      "Cursor target rejected: non-finite percent values",
      { x, y },
    );
  }
  if (x < 0 || x > 100 || y < 0 || y > 100) {
    throw new CursorGuardrailError(
      "Cursor target rejected: percent values outside [0, 100]",
      { x, y },
    );
  }
}

function assertScreenPointInsideActiveDisplay(
  point: { x: number; y: number },
  expectedDisplayId?: number,
): void {
  const display = getActiveCoordinateDisplay();
  if (
    typeof expectedDisplayId === "number" &&
    display.id !== expectedDisplayId
  ) {
    throw new CursorGuardrailError(
      "Cursor target rejected: active display changed since ghost was drawn",
      {
        expectedDisplayId,
        activeDisplayId: display.id,
        point,
      },
    );
  }
  const b = display.bounds;
  const inside =
    point.x >= b.x &&
    point.x <= b.x + b.width &&
    point.y >= b.y &&
    point.y <= b.y + b.height;
  if (!inside) {
    throw new CursorGuardrailError(
      "Cursor target rejected: resolved screen point outside active display bounds",
      { point, displayBounds: b, displayId: display.id },
    );
  }
  // Sanity: confirm the point's nearest display matches the active one. If a
  // user drags the app onto another monitor mid-flow, this catches the drift.
  const nearest = screen.getDisplayNearestPoint(point);
  if (nearest.id !== display.id) {
    throw new CursorGuardrailError(
      "Cursor target rejected: nearest display does not match active display",
      {
        point,
        activeDisplayId: display.id,
        nearestDisplayId: nearest.id,
      },
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function easeInOutCubic(progress: number): number {
  return progress < 0.5
    ? 4 * progress ** 3
    : 1 - Math.pow(-2 * progress + 2, 3) / 2;
}

function cursorPermissionError(error: unknown): Error {
  const detail = error instanceof Error ? error.message : String(error);
  return new Error(
    `Specter could not control the macOS cursor. Grant Accessibility permission to this app in System Settings > Privacy & Security > Accessibility, then retry. Original error: ${detail}`,
  );
}

export async function moveRealMouse(
  x: number,
  y: number,
  durationMs = DEFAULT_MOVE_DURATION_MS,
  expectedDisplayId?: number,
): Promise<void> {
  safeLog("[AUTO_REAL_MOUSE] moveRealMouse invoked REAL OS cursor automation", {
    x,
    y,
    durationMs,
    expectedDisplayId,
  });
  assertValidPercent(x, y);
  try {
    const target = await toScreenPoint(x, y);
    assertScreenPointInsideActiveDisplay(target, expectedDisplayId);
    safeLog("[AUTO_REAL_MOUSE] target screen point", {
      x: target.x,
      y: target.y,
    });

    const current = await mouse.getPosition();
    const distance = Math.max(
      1,
      Math.hypot(target.x - current.x, target.y - current.y),
    );

    const previousSpeed = mouse.config.mouseSpeed;
    const durationSeconds = Math.max(0.05, durationMs / 1000);
    mouse.config.mouseSpeed = Math.max(200, distance / durationSeconds);

    try {
      await mouse.move(straightTo(target), easeInOutCubic);
      safeLog("[AUTO_REAL_MOUSE] nut-js REAL OS move complete");
    } finally {
      mouse.config.mouseSpeed = previousSpeed;
    }
  } catch (error) {
    if (error instanceof CursorGuardrailError) {
      safeError("[AUTO_REAL_MOUSE] guardrail blocked move", {
        message: error.message,
        ...error.diagnostics,
      });
      throw error;
    }
    safeError("[AUTO_REAL_MOUSE] nut-js REAL OS automation error:", error);
    throw cursorPermissionError(error);
  }
}

export interface AxClickTarget {
  app: string;
  elementIndex: string;
}

export interface AxDumpClickTarget {
  app: string;
  elementIndex: number;
}

async function resolveClickPercents(
  x: number,
  y: number,
  axDump?: AxDumpClickTarget,
): Promise<{ x: number; y: number }> {
  if (axDump) {
    const fresh = await viewportPercentFromAxDumpIndex(
      axDump.app,
      axDump.elementIndex,
    );
    if (fresh) return fresh;
    safeWarn("[AUTO_REAL_MOUSE] ax-dump refresh failed; using stored percent", axDump);
  }
  return { x, y };
}

async function assertCursorNearTarget(
  x: number,
  y: number,
  expectedDisplayId?: number,
): Promise<void> {
  const expected = await toScreenPoint(x, y);
  assertScreenPointInsideActiveDisplay(expected, expectedDisplayId);
  const pos = await mouse.getPosition();
  const drift = Math.hypot(pos.x - expected.x, pos.y - expected.y);
  if (drift > CLICK_TOLERANCE_PX) {
    throw new CursorGuardrailError(
      "Cursor drifted before click; refusing nut-js fallback",
      { expected, actual: { x: pos.x, y: pos.y }, driftPx: drift },
    );
  }
}

export async function clickRealMouse(
  x: number,
  y: number,
  durationMs = DEFAULT_MOVE_DURATION_MS,
  expectedDisplayId?: number,
  axTarget?: AxClickTarget,
  axDumpTarget?: AxDumpClickTarget,
): Promise<void> {
  const coords = await resolveClickPercents(x, y, axDumpTarget);
  x = coords.x;
  y = coords.y;

  safeLog(
    "[AUTO_REAL_MOUSE] clickRealMouse invoked REAL OS cursor automation",
    { x, y, durationMs, expectedDisplayId, axTarget, axDumpTarget },
  );

  await moveRealMouse(x, y, durationMs, expectedDisplayId);

  // ponytail: ax-dump index != openara element_index — never mix namespaces
  if (!axDumpTarget && axTarget && isOpenaraInstalled()) {
    try {
      const ok = await clickElementByIndex(axTarget.app, axTarget.elementIndex);
      if (ok) {
        safeLog("[AUTO_REAL_MOUSE] AX element_index click complete", {
          app: axTarget.app,
          elementIndex: axTarget.elementIndex,
        });
        return;
      }
      safeWarn(
        "[AUTO_REAL_MOUSE] AX element_index click rejected; falling back",
        axTarget,
      );
    } catch (err) {
      safeWarn("[AUTO_REAL_MOUSE] AX element_index click threw; falling back", {
        ...axTarget,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (isOpenaraInstalled()) {
    try {
      const target = await toScreenPoint(x, y);
      assertScreenPointInsideActiveDisplay(target, expectedDisplayId);
      const ok = await clickAtScreenPixel(target.x, target.y);
      if (ok) {
        safeLog("[AUTO_REAL_MOUSE] Ara CGEvent click complete", {
          x,
          y,
          screenX: target.x,
          screenY: target.y,
        });
        return;
      }
      safeWarn("[AUTO_REAL_MOUSE] Ara click rejected; falling back to nut-js", {
        x,
        y,
      });
    } catch (err) {
      // Guardrail failures must NOT fall back — that would let a bad click
      // through via nut-js after we already rejected the coordinates.
      if (err instanceof CursorGuardrailError) {
        safeError("[AUTO_REAL_MOUSE] guardrail blocked click", {
          message: err.message,
          ...err.diagnostics,
        });
        throw err;
      }
      safeWarn("[AUTO_REAL_MOUSE] Ara click threw; falling back to nut-js", {
        x,
        y,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  try {
    await assertCursorNearTarget(x, y, expectedDisplayId);
    await mouse.click(Button.LEFT);
    safeLog("[AUTO_REAL_MOUSE] nut-js REAL OS click complete", { x, y });
  } catch (error) {
    if (error instanceof CursorGuardrailError) throw error;
    throw cursorPermissionError(error);
  }
}

function axTargetForStep(step: Step): AxClickTarget | undefined {
  if (
    step.axElementIndex &&
    step.axElementIndex.trim() &&
    step.axApp &&
    step.axApp.trim()
  ) {
    return {
      app: step.axApp.trim(),
      elementIndex: step.axElementIndex.trim(),
    };
  }
  return undefined;
}

function axDumpTargetForStep(step: Step): AxDumpClickTarget | undefined {
  if (
    typeof step.axDumpIndex === "number" &&
    Number.isFinite(step.axDumpIndex) &&
    step.axDumpApp &&
    step.axDumpApp.trim()
  ) {
    return {
      app: step.axDumpApp.trim(),
      elementIndex: step.axDumpIndex,
    };
  }
  return undefined;
}

function expectedDisplayIdForStep(step: Step): number | undefined {
  const id = step.captureMeta?.displayId;
  return typeof id === "number" ? id : getActiveCoordinateDisplayId();
}

export async function executeRealMouseSteps(
  steps: Step[],
  moveDurationMs = DEFAULT_MOVE_DURATION_MS,
): Promise<void> {
  safeLog(
    "[AUTO_REAL_MOUSE] executeRealMouseSteps invoked REAL OS automation",
    { totalSteps: steps.length },
  );
  for (const [index, step] of steps.entries()) {
    safeLog("[AUTO_REAL_MOUSE] executing real cursor step", {
      index,
      action: step.action,
      x: step.x,
      y: step.y,
      axElementIndex: step.axElementIndex,
      axApp: step.axApp,
    });
    if (step.action !== "wait" && step.delayMs) {
      await sleep(step.delayMs);
    }

    const axTarget = axTargetForStep(step);
    const axDumpTarget = axDumpTargetForStep(step);
    const displayId = expectedDisplayIdForStep(step);

    switch (step.action) {
      case "click":
        await clickRealMouse(
          step.x,
          step.y,
          moveDurationMs,
          displayId,
          axTarget,
          axDumpTarget,
        );
        break;
      case "type":
        if (step.typeText) {
          await clickRealMouse(
            step.x,
            step.y,
            moveDurationMs,
            displayId,
            axTarget,
            axDumpTarget,
          );
          await keyboard.type(step.typeText);
        } else {
          await moveRealMouse(step.x, step.y, moveDurationMs);
        }
        break;
      case "scroll":
        await moveRealMouse(step.x, step.y, moveDurationMs);
        await mouse.scrollDown(3);
        break;
      case "wait":
        await sleep(step.waitForMs || step.delayMs || 500);
        break;
    }
  }
}

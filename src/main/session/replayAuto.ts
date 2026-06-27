import { safeLog, safeWarn } from "../logger";
import { clickRealMouse, executeRealMouseSteps, type AxDumpClickTarget } from "../cursor";
import {
  getActiveCoordinateDisplayId,
  mapPercentToScreen,
} from "../screenCoordinates";
import {
  isPeekabooAvailable,
  clickTarget as peekabooClick,
  typeText,
  scrollTarget,
  pressHotkey,
} from "../automation/peekabooAdapter";
import type { Step } from "./types";
import {
  resolveTarget,
  autoExecConfidenceFloor,
} from "../automation/targetResolver";
import {
  createReplayController,
  isActive,
  releaseReplayController,
  restoreOverlayAfterReplay,
  sendOverlay,
  setOverlayForReplay,
  sleep,
} from "./replayController";
import { isProhibitedAutonomousLabel } from "../clinical/prohibitedActions";

const DEFAULT_WAIT_STEP_MS = 800;

// Clinical keyword gate built for the UCSF EHR vertical. On a general-purpose
// tutor it can silently skip steps whose labels happen to match clinical verbs
// (e.g. "Sign Note"). Enabled by default for safety; set
// CLINICAL_SAFETY_FILTER=false in .env to disable for non-clinical demos.
function clinicalSafetyFilterEnabled(): boolean {
  return process.env.CLINICAL_SAFETY_FILTER !== "false";
}

function clinicalSafetyHaystack(step: Step): string {
  return [
    step.id ?? "",
    step.title ?? "",
    step.targetLabel ?? "",
    step.instruction ?? "",
    step.typeText ?? "",
  ]
    .filter((s) => typeof s === "string" && s.length > 0)
    .join(" ");
}

function stepWaitMs(step: Step): number {
  return step.waitForMs || step.delayMs || DEFAULT_WAIT_STEP_MS;
}

function stepTitle(step: Step): string {
  return step.instruction || step.targetLabel || step.id || "Untitled step";
}

function stepDisplayId(step: Step): number | undefined {
  const id = step.captureMeta?.displayId;
  return typeof id === "number" ? id : getActiveCoordinateDisplayId();
}

function axDumpTargetForStep(step: Step): AxDumpClickTarget | undefined {
  if (
    typeof step.axDumpIndex === "number" &&
    Number.isFinite(step.axDumpIndex) &&
    step.axDumpApp?.trim()
  ) {
    return { app: step.axDumpApp.trim(), elementIndex: step.axDumpIndex };
  }
  return undefined;
}

async function clickStepViewport(step: Step): Promise<void> {
  await clickRealMouse(
    step.x,
    step.y,
    undefined,
    stepDisplayId(step),
    undefined,
    axDumpTargetForStep(step),
  );
}

export async function replayAutoExecute(steps: Step[]): Promise<void> {
  const controller = createReplayController();
  setOverlayForReplay();
  safeLog("[AUTO_REAL_MOUSE] STARTING REAL OS AUTOMATION", {
    totalSteps: steps.length,
  });

  try {
    for (let index = 0; index < steps.length; index++) {
      if (!isActive(controller)) break;
      const step = steps[index];
      if (
        clinicalSafetyFilterEnabled() &&
        isProhibitedAutonomousLabel(clinicalSafetyHaystack(step))
      ) {
        safeWarn(
          "[AUTO_REAL_MOUSE] CLINICAL SAFETY: refusing to autonomously execute step matching prohibited action list. Use walkthrough mode for clinician confirmation.",
          {
            index,
            title: stepTitle(step),
            targetLabel: step.targetLabel,
          },
        );
        sendOverlay("replay:clinical-blocked", {
          index,
          step,
          reason: "prohibited autonomous action",
        });
        break;
      }
      safeLog("[AUTO_REAL_MOUSE] real mouse step", {
        index,
        displayIndex: index + 1,
        total: steps.length,
        title: stepTitle(step),
        action: step.action,
        x: step.x,
        y: step.y,
      });

      if (step.action === "click") {
        if (!(await sleep(step.delayMs || 0, controller))) break;

        const pkAvailable = await isPeekabooAvailable();
        const resolved = resolveTarget(step, {
          hasDOM: false,
          peekabooAvailable: pkAvailable,
          peekabooTarget: pkAvailable
            ? { bbox: { x: step.x, y: step.y } }
            : undefined,
          vlmTarget: {
            // No unsafe default: a missing confidence is passed through as
            // undefined so resolveTarget treats it as LOW (0) and blocks.
            confidence: step.targetConfidence,
            bbox: { x: step.x, y: step.y, width: 0, height: 0 },
          },
          axTarget: (step as any).axTarget,
          currentApp: step.appName,
        });

        safeLog("[AUTO_REAL_MOUSE] resolved target", { index, resolved });

        if (resolved.requiresConfirmation) {
          safeWarn(
            "[AUTO_REAL_MOUSE] BLOCKED: target confidence below auto-execute floor. Show-don't-click; awaiting confirmation.",
            {
              index,
              label: step.targetLabel ?? stepTitle(step),
              confidence: resolved.confidence,
              floor: autoExecConfidenceFloor(),
              source: resolved.source,
            },
          );
          sendOverlay("replay:confirm-needed", {
            index,
            step,
            reason: "low confidence or unsafe target",
          });
          break;
        }

        let success = false;

        if (resolved.source === "playwright") {
          safeWarn(
            "[AUTO_REAL_MOUSE] Playwright executor not wired; falling back to viewport click",
            { index, selector: resolved.selector },
          );
          await clickStepViewport(step);
          success = true;
        } else if (resolved.source === "peekaboo") {
          let pkTarget: any;
          if (
            step.targetLabel ||
            step.selector ||
            (step as any).accessibilityId
          ) {
            pkTarget = {
              kind: "element",
              target:
                step.targetLabel ||
                step.selector ||
                (step as any).accessibilityId,
              snapshotId: (step as any).snapshotId,
            };
          } else if (typeof step.x === "number" && typeof step.y === "number") {
            const mapped = await mapPercentToScreen(step.x, step.y);
            pkTarget = {
              kind: "coords",
              x: mapped.screenPoint.x,
              y: mapped.screenPoint.y,
            };
          } else if (
            resolved.bbox &&
            typeof resolved.bbox.x === "number" &&
            typeof resolved.bbox.y === "number" &&
            typeof resolved.bbox.width === "number" &&
            typeof resolved.bbox.height === "number"
          ) {
            pkTarget = {
              kind: "coords",
              x: resolved.bbox.x + resolved.bbox.width / 2,
              y: resolved.bbox.y + resolved.bbox.height / 2,
            };
          } else if (
            step.bbox &&
            typeof step.bbox.x === "number" &&
            typeof step.bbox.y === "number" &&
            typeof step.bbox.width === "number" &&
            typeof step.bbox.height === "number"
          ) {
            pkTarget = {
              kind: "coords",
              x: step.bbox.x + step.bbox.width / 2,
              y: step.bbox.y + step.bbox.height / 2,
            };
          }

          if (!pkTarget) {
            safeWarn(
              "[AUTO_REAL_MOUSE] Peekaboo click missing target context. Pausing.",
              { index },
            );
            sendOverlay("replay:confirm-needed", {
              index,
              step,
              reason: "Peekaboo missing valid target",
            });
            break;
          }

          safeLog("[AUTO_REAL_MOUSE] Executing Peekaboo click", {
            index,
            target: pkTarget,
          });
          const result = await peekabooClick(pkTarget);
          if (!result.ok) {
            safeWarn(
              "[AUTO_REAL_MOUSE] Peekaboo click failed, attempting fallback",
              { result },
            );
            // Fallback AX -> vision -> real mouse
            const fallbackResolved = resolveTarget(step, {
              hasDOM: false,
              peekabooAvailable: false,
              vlmTarget: {
                // No unsafe default: missing confidence passes through as
                // undefined and is treated as LOW (0) by resolveTarget.
                confidence: step.targetConfidence,
                bbox: { x: step.x, y: step.y, width: 0, height: 0 },
              },
              axTarget: (step as any).axTarget,
              currentApp: step.appName,
            });

            if (fallbackResolved.requiresConfirmation) {
              safeWarn(
                "[AUTO_REAL_MOUSE] BLOCKED: fallback target confidence below auto-execute floor. Show-don't-click; awaiting confirmation.",
                {
                  index,
                  label: step.targetLabel ?? stepTitle(step),
                  confidence: fallbackResolved.confidence,
                  floor: autoExecConfidenceFloor(),
                  source: fallbackResolved.source,
                },
              );
              sendOverlay("replay:confirm-needed", {
                index,
                step,
                reason: "Peekaboo failed and fallback is low confidence",
              });
              break;
            }

            if (
              fallbackResolved.source === "openara" ||
              fallbackResolved.source === "ax"
            ) {
              await clickStepViewport(step);
              success = true;
            } else {
              await clickStepViewport(step);
              success = true;
            }
          } else {
            success = true;
          }
        }

        if (
          !success &&
          (resolved.source === "openara" || resolved.source === "ax")
        ) {
          safeLog("[AUTO_REAL_MOUSE] Executing Accessibility click", {
            index,
            x: step.x,
            y: step.y,
          });
          await clickStepViewport(step);
        } else if (!success) {
          safeLog("[AUTO_REAL_MOUSE] REAL OS move/click (Vision/Fallback)", {
            index,
            x: step.x,
            y: step.y,
          });
          await clickStepViewport(step);
        }
      } else if (step.action === "wait") {
        const waitMs = stepWaitMs(step);
        safeLog("[AUTO_REAL_MOUSE] wait before next real OS action", {
          index,
          waitMs,
        });
        if (!(await sleep(waitMs, controller))) break;
      } else {
        if (!(await sleep(step.delayMs || 0, controller))) break;
        safeLog("[AUTO_REAL_MOUSE] REAL OS action replay", {
          index,
          action: step.action,
          x: step.x,
          y: step.y,
          hasTypeText: Boolean(step.typeText),
        });

        const pkAvailable = await isPeekabooAvailable();
        let success = false;

        if (pkAvailable) {
          if (step.action === "type" && step.typeText) {
            const res = await typeText(step.typeText);
            success = res.ok;
            if (!success)
              safeWarn("[AUTO_REAL_MOUSE] Peekaboo type failed", res);
          } else if (step.action === "scroll") {
            const res = await scrollTarget(step.targetLabel || "body", "down");
            success = res.ok;
            if (!success)
              safeWarn("[AUTO_REAL_MOUSE] Peekaboo scroll failed", res);
          } else if ((step as any).action === "hotkey" && step.typeText) {
            const res = await pressHotkey(step.typeText);
            success = res.ok;
            if (!success)
              safeWarn("[AUTO_REAL_MOUSE] Peekaboo hotkey failed", res);
          }
        }

        if (!success) {
          await executeRealMouseSteps([{ ...step, delayMs: 0 }]);
        }
      }
      safeLog("[AUTO_REAL_MOUSE] real mouse step complete", {
        index,
        action: step.action,
      });
      sendOverlay("replay:progress", { index, total: steps.length });
    }
  } finally {
    if (!controller.cancelled) {
      sendOverlay("replay:complete", {});
    }
    releaseReplayController(controller);
    restoreOverlayAfterReplay(controller);
    safeLog("[AUTO_REAL_MOUSE] REAL OS AUTOMATION FINISHED", {
      cancelled: controller.cancelled,
    });
  }
}

import Jimp from "jimp";
import type { AxElement } from "../axDump";
import { captureScreenBase64 } from "../capture";
import { logicalPointToPercent } from "../screenCoordinates";
import { analyzeVision } from "../vision";
import { parseSetOfMarkJson } from "../vision/json";
import { safeLog, safeWarn } from "../logger";

/**
 * Result of a Set-of-Mark (SoM) grounding pass. Coordinates are viewport
 * percentages (the same frame `resolveLiveTarget` returns), derived from the
 * AX bbox of the model-chosen candidate — never from a model-emitted pixel.
 */
export interface SoMGroundingResult {
  viewportX: number;
  viewportY: number;
  /** Index the model chose (into the candidate array passed in). */
  chosenIndex: number;
  /** Model confidence for the choice, clamped to [0,1]. */
  confidence: number;
  /** Resolved human-readable label of the chosen candidate. */
  label: string;
  reasoning?: string;
}

/** Cap candidates so the legend + reasoning can't truncate the JSON response. */
const MAX_CANDIDATES = 12;
/** Longest screenshot edge sent to the model (NIM limit + latency budget). */
const MAX_IMAGE_EDGE = 1280;
/** Matches the live-target cache window so a render loop doesn't re-call. */
const CACHE_TTL_MS = 600;

// Box / number styling for the rendered overlay.
const BOX_THICKNESS = 3;
const BOX_COLOR = 0xff3b30ff; // opaque red (RGBA int)
const LABEL_BG = 0xff3b30ff; // red chip behind the number
const NUMBER_PADDING = 2;

interface SoMCacheEntry {
  key: string;
  result: SoMGroundingResult | null;
  at: number;
}

let somCache: SoMCacheEntry | null = null;

export function invalidateVisionGroundingCache(): void {
  somCache = null;
}

/** Stable hash of the candidate set so the cache key changes when AX changes. */
function hashCandidates(candidates: AxElement[]): string {
  let hash = 0;
  const sig = candidates
    .map(
      (c) =>
        `${Math.round(c.x)},${Math.round(c.y)},${Math.round(c.w)},${Math.round(
          c.h,
        )},${c.title}|${c.desc}|${c.value}|${c.role}`,
    )
    .join(";");
  for (let i = 0; i < sig.length; i++) {
    hash = (hash * 31 + sig.charCodeAt(i)) | 0;
  }
  return String(hash);
}

function candidateLabel(c: AxElement): string {
  return (
    (c.title && c.title.trim()) ||
    (c.desc && c.desc.trim()) ||
    (c.value && c.value.trim()) ||
    c.role ||
    "(unlabeled)"
  );
}

/** Fill an axis-aligned rectangle border `thickness` px wide, clipped to bounds. */
function strokeRect(
  img: Jimp,
  left: number,
  top: number,
  width: number,
  height: number,
  thickness: number,
  color: number,
): void {
  const imgW = img.bitmap.width;
  const imgH = img.bitmap.height;
  const x0 = Math.max(0, Math.round(left));
  const y0 = Math.max(0, Math.round(top));
  const x1 = Math.min(imgW, Math.round(left + width));
  const y1 = Math.min(imgH, Math.round(top + height));
  if (x1 <= x0 || y1 <= y0) return;

  const paint = (px: number, py: number) => {
    if (px < 0 || py < 0 || px >= imgW || py >= imgH) return;
    img.setPixelColor(color, px, py);
  };

  for (let t = 0; t < thickness; t++) {
    for (let x = x0; x < x1; x++) {
      paint(x, y0 + t);
      paint(x, y1 - 1 - t);
    }
    for (let y = y0; y < y1; y++) {
      paint(x0 + t, y);
      paint(x1 - 1 - t, y);
    }
  }
}

function fillRect(
  img: Jimp,
  left: number,
  top: number,
  width: number,
  height: number,
  color: number,
): void {
  const imgW = img.bitmap.width;
  const imgH = img.bitmap.height;
  const x0 = Math.max(0, Math.round(left));
  const y0 = Math.max(0, Math.round(top));
  const x1 = Math.min(imgW, Math.round(left + width));
  const y1 = Math.min(imgH, Math.round(top + height));
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      img.setPixelColor(color, x, y);
    }
  }
}

/**
 * Set-of-Mark grounding.
 *
 * Renders numbered boxes onto an active-display screenshot at each candidate's
 * AX bounds, asks the model which number matches `targetLabel`, then maps that
 * index back to the candidate's AX bbox center -> viewport %. The model only
 * ever returns an index; we own the geometry.
 *
 * Returns null when grounding can't/​shouldn't decide (no candidates, capture
 * failure, parse failure, or chosenIndex === -1) so the caller falls back to
 * "ask the user" — this function never throws.
 */
export async function groundTargetWithSoM(
  candidates: AxElement[],
  targetLabel: string,
  pid?: number,
): Promise<SoMGroundingResult | null> {
  const trimmed = targetLabel.trim();
  if (!trimmed || !candidates.length) return null;

  const top = candidates.slice(0, MAX_CANDIDATES);

  // Cache by (pid, label, axHash) for the live-target TTL.
  const cacheKey = `${pid ?? "?"}::${trimmed.toLowerCase()}::${hashCandidates(
    top,
  )}`;
  const now = Date.now();
  if (somCache && somCache.key === cacheKey && now - somCache.at < CACHE_TTL_MS) {
    return somCache.result;
  }

  let groundingResult: SoMGroundingResult | null = null;
  try {
    const capture = await captureScreenBase64();
    const captured = await Jimp.read(
      Buffer.from(capture.base64, "base64"),
    );

    const capturedWidth = captured.bitmap.width;
    const capturedHeight = captured.bitmap.height;
    const displayBounds = capture.meta.displayBounds;

    // ── AX-bbox (GLOBAL logical points) -> screenshot-pixel mapper ──────────
    // ratio = captured px per logical point, derived from the ACTUAL captured
    // image size vs the display's logical bounds. This equals display.scaleFactor
    // when desktopCapturer returns a physical-resolution thumbnail (Retina 2x)
    // and 1.0 when it returns a logical-resolution one — correct either way,
    // which is why we derive it instead of hardcoding scaleFactor.
    //
    //   capX = (axGlobalX - displayBounds.x) * ratioX
    //   capY = (axGlobalY - displayBounds.y) * ratioY
    //
    // Then we downscale the image so its longest edge <= MAX_IMAGE_EDGE and
    // apply the SAME downscaleRatio to every drawn coordinate:
    //
    //   pxX = capX * downscaleRatio
    //   pxY = capY * downscaleRatio
    const ratioX =
      displayBounds.width > 0 ? capturedWidth / displayBounds.width : 1;
    const ratioY =
      displayBounds.height > 0 ? capturedHeight / displayBounds.height : 1;

    const longestEdge = Math.max(capturedWidth, capturedHeight);
    const downscaleRatio =
      longestEdge > MAX_IMAGE_EDGE ? MAX_IMAGE_EDGE / longestEdge : 1;

    if (downscaleRatio < 1) {
      captured.scaleToFit(
        Math.round(capturedWidth * downscaleRatio),
        Math.round(capturedHeight * downscaleRatio),
      );
    }

    const toPx = (
      axX: number,
      axY: number,
      axW: number,
      axH: number,
    ): { left: number; top: number; width: number; height: number } => ({
      left: (axX - displayBounds.x) * ratioX * downscaleRatio,
      top: (axY - displayBounds.y) * ratioY * downscaleRatio,
      width: axW * ratioX * downscaleRatio,
      height: axH * ratioY * downscaleRatio,
    });

    const font = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);
    const legendLines: string[] = [];

    top.forEach((c, index) => {
      const r = toPx(c.x, c.y, c.w, c.h);
      strokeRect(
        captured,
        r.left,
        r.top,
        r.width,
        r.height,
        BOX_THICKNESS,
        BOX_COLOR,
      );

      // Number chip anchored to the box's top-left, nudged inside the image.
      const text = String(index);
      const textW = Jimp.measureText(font, text);
      const textH = Jimp.measureTextHeight(font, text, textW + 4);
      const chipW = textW + NUMBER_PADDING * 2;
      const chipH = textH + NUMBER_PADDING * 2;
      const chipLeft = Math.max(
        0,
        Math.min(captured.bitmap.width - chipW, r.left),
      );
      const chipTop = Math.max(
        0,
        Math.min(captured.bitmap.height - chipH, r.top),
      );
      fillRect(captured, chipLeft, chipTop, chipW, chipH, LABEL_BG);
      captured.print(
        font,
        chipLeft + NUMBER_PADDING,
        chipTop + NUMBER_PADDING,
        text,
      );

      legendLines.push(`${index} -> ${candidateLabel(c)} (${c.role})`);
    });

    const imageBase64 = (
      await captured.getBufferAsync(Jimp.MIME_PNG)
    ).toString("base64");

    const userPrompt = `Target: "${trimmed}"\n${legendLines.join("\n")}`;

    const apiKey =
      process.env.GHOST_GROUNDING_API_KEY || process.env.NVIDIA_API_KEY;

    const result = await analyzeVision({
      imageBase64,
      mimeType: "image/png",
      task: "set_of_mark",
      userPrompt,
      screenshotWidth: captured.bitmap.width,
      screenshotHeight: captured.bitmap.height,
      model: process.env.GHOST_GROUNDING_MODEL,
      apiKey,
    });

    // The chosenIndex lives in the raw model text (validateVisionOutput drops it),
    // so we parse rawText with the dedicated SoM parser. Falls back to summary.
    const parsed =
      parseSetOfMarkJson(result.rawText ?? "") ??
      parseSetOfMarkJson(result.summary ?? "");

    if (!parsed) {
      safeWarn("[SOM] parse failed, treating as ask", {
        targetLabel: trimmed,
        rawText: result.rawText?.slice(0, 200),
      });
      groundingResult = null;
    } else if (
      parsed.chosenIndex < 0 ||
      parsed.chosenIndex >= top.length
    ) {
      safeLog("[SOM] no match", {
        targetLabel: trimmed,
        chosenIndex: parsed.chosenIndex,
        candidates: top.length,
      });
      groundingResult = null;
    } else {
      const chosen = top[parsed.chosenIndex];
      // Map the chosen index -> AX bbox CENTER -> viewport %. We trust the AX
      // geometry, not any coordinate the model might have emitted.
      const centerX = chosen.x + chosen.w / 2;
      const centerY = chosen.y + chosen.h / 2;
      const viewport = logicalPointToPercent(centerX, centerY);
      if (!viewport) {
        safeWarn("[SOM] chosen element outside active display", {
          targetLabel: trimmed,
          centerX,
          centerY,
        });
        groundingResult = null;
      } else {
        groundingResult = {
          viewportX: viewport.x,
          viewportY: viewport.y,
          chosenIndex: parsed.chosenIndex,
          confidence: parsed.confidence,
          label: candidateLabel(chosen),
          reasoning: parsed.reasoning,
        };

        safeLog("[SOM] resolved", {
          targetLabel: trimmed,
          chosenIndex: parsed.chosenIndex,
          label: groundingResult.label,
          confidence: Number(parsed.confidence.toFixed(3)),
          viewportX: Number(viewport.x.toFixed(2)),
          viewportY: Number(viewport.y.toFixed(2)),
        });
      }
    }
  } catch (error: any) {
    // Capture / encode / model errors must never block the cursor — degrade to ask.
    safeWarn("[SOM] grounding error, treating as ask", {
      targetLabel: trimmed,
      error: error?.message ?? String(error),
    });
    groundingResult = null;
  }

  somCache = { key: cacheKey, result: groundingResult, at: now };
  return groundingResult;
}

function capturePointToViewportPercent(
  capX: number,
  capY: number,
  capturedWidth: number,
  capturedHeight: number,
  displayBounds: { x: number; y: number; width: number; height: number },
): { x: number; y: number } | null {
  const ratioX =
    displayBounds.width > 0 ? capturedWidth / displayBounds.width : 1;
  const ratioY =
    displayBounds.height > 0 ? capturedHeight / displayBounds.height : 1;
  const logicalX = displayBounds.x + capX / ratioX;
  const logicalY = displayBounds.y + capY / ratioY;
  return logicalPointToPercent(logicalX, logicalY);
}

/**
 * Zero-AX fallback: ask vision for target_detection, map bbox center to viewport %.
 * Confidence capped — suggest-only, never auto-click.
 */
export async function groundTargetDirectCoord(
  targetLabel: string,
): Promise<SoMGroundingResult | null> {
  const trimmed = targetLabel.trim();
  if (!trimmed) return null;

  try {
    const capture = await captureScreenBase64();
    const apiKey =
      process.env.GHOST_GROUNDING_API_KEY || process.env.NVIDIA_API_KEY;
    const result = await analyzeVision({
      imageBase64: capture.base64,
      mimeType: "image/png",
      task: "target_detection",
      userPrompt: `Find the visible UI control that matches: "${trimmed}"`,
      screenshotWidth: capture.width,
      screenshotHeight: capture.height,
      model: process.env.GHOST_GROUNDING_MODEL,
      apiKey,
    });

    const targetNorm = trimmed.toLowerCase();
    let best: { label: string; score: number; x: number; y: number; conf: number } | null =
      null;

    for (const el of result.elements) {
      const label = (el.label || el.text || "").trim();
      if (!label) continue;
      const norm = label.toLowerCase();
      let score = 0;
      if (norm === targetNorm) score = 1;
      else if (norm.includes(targetNorm) || targetNorm.includes(norm)) score = 0.65;
      if (score < 0.5) continue;

      const point =
        el.center ??
        (el.bbox
          ? {
              x: el.bbox.x + el.bbox.width / 2,
              y: el.bbox.y + el.bbox.height / 2,
            }
          : null);
      if (!point) continue;

      if (!best || score > best.score) {
        best = {
          label,
          score,
          x: point.x,
          y: point.y,
          conf: el.confidence ?? score,
        };
      }
    }

    if (!best) {
      safeWarn("[DIRECT_COORD] no vision element matched", { targetLabel: trimmed });
      return null;
    }

    const viewport = capturePointToViewportPercent(
      best.x,
      best.y,
      capture.width,
      capture.height,
      capture.meta.displayBounds,
    );
    if (!viewport) {
      safeWarn("[DIRECT_COORD] point outside active display", { targetLabel: trimmed });
      return null;
    }

    safeLog("[DIRECT_COORD] resolved", {
      targetLabel: trimmed,
      label: best.label,
      viewportX: Number(viewport.x.toFixed(2)),
      viewportY: Number(viewport.y.toFixed(2)),
    });

    return {
      viewportX: viewport.x,
      viewportY: viewport.y,
      chosenIndex: -1,
      confidence: Math.min(1, Math.max(0, best.conf)),
      label: best.label,
    };
  } catch (error: any) {
    safeWarn("[DIRECT_COORD] grounding error", {
      targetLabel: trimmed,
      error: error?.message ?? String(error),
    });
    return null;
  }
}

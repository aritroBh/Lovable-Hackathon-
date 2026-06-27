import { desktopCapturer } from "electron";
import {
  captureMetaForActiveDisplay,
  getActiveCoordinateDisplay,
  type CaptureFrameMeta,
} from "./screenCoordinates";
import { safeLog } from "./logger";

export interface CaptureResult {
  base64: string;
  width: number;
  height: number;
  meta: CaptureFrameMeta;
}

/**
 * Cap the captured frame's long edge. Vision models read UI reliably at ~1400px,
 * and on large or external displays this shrinks the PNG — and therefore the
 * base64 upload and the model's server-side decode — several-fold versus
 * capturing at native logical resolution. Requesting the smaller thumbnailSize
 * lets Electron downscale during capture, so we never encode the full-res frame.
 * Coordinate math is unaffected: every downstream consumer normalizes against the
 * reported width/height/meta, which describe the (downscaled) frame we emit.
 */
const MAX_CAPTURE_EDGE = 1400;

export async function captureScreenBase64(): Promise<CaptureResult> {
  const activeDisplay = getActiveCoordinateDisplay();
  const { width, height } = activeDisplay.size;

  const longEdge = Math.max(width, height);
  const scale = longEdge > MAX_CAPTURE_EDGE ? MAX_CAPTURE_EDGE / longEdge : 1;
  const thumbWidth = Math.max(1, Math.round(width * scale));
  const thumbHeight = Math.max(1, Math.round(height * scale));

  let sources;
  try {
    sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width: thumbWidth, height: thumbHeight },
    });
  } catch (err) {
    const wrapped = new Error(
      "Screen Recording permission denied. Grant access in System Settings, then retry.",
    ) as any;
    wrapped.code = "SCREEN_PERMISSION_DENIED";
    wrapped.cause = err;
    throw wrapped;
  }

  const source =
    sources.find((s) => s.display_id === String(activeDisplay.id)) ??
    sources[0];

  if (!source || source.thumbnail.isEmpty()) {
    const err = new Error(
      "Screen Recording permission denied. Grant access in System Settings, then retry.",
    ) as any;
    err.code = "SCREEN_PERMISSION_DENIED";
    throw err;
  }

  safeLog("[WINDOW_ROUTING] screen capture display selected", {
    displayId: activeDisplay.id,
    bounds: activeDisplay.bounds,
  });

  const imageSize = source.thumbnail.getSize();
  const imageWidth = imageSize.width || width;
  const imageHeight = imageSize.height || height;
  const meta = captureMetaForActiveDisplay(imageWidth, imageHeight);
  safeLog("[COORD_FRAME] capture metadata", meta);

  const base64 = source.thumbnail.toPNG().toString("base64");
  return { base64, width: imageWidth, height: imageHeight, meta };
}

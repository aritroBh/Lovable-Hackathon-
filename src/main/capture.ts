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

export async function captureScreenBase64(): Promise<CaptureResult> {
  const activeDisplay = getActiveCoordinateDisplay();
  const { width, height } = activeDisplay.size;

  let sources;
  try {
    sources = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width, height },
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

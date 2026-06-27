export interface ResolvedTarget {
  source: "playwright" | "peekaboo" | "openara" | "ax" | "vision" | "manual";
  confidence: number;
  bbox?: { x: number; y: number; width: number; height: number };
  selector?: string;
  appName?: string;
  rationale: string;
  requiresConfirmation: boolean;
}

// Auto-execute confidence gate. A click only auto-executes when the effective
// confidence is at or above this floor (the clinical keyword gate in
// replayAuto.ts is stacked on top). Tunable via AUTO_EXEC_CONFIDENCE_FLOOR;
// falls back to 0.65 when the env var is missing or not a sane 0..1 number.
export const DEFAULT_AUTO_EXEC_CONFIDENCE_FLOOR = 0.65;

export function autoExecConfidenceFloor(): number {
  const raw = process.env.AUTO_EXEC_CONFIDENCE_FLOOR;
  if (raw === undefined) return DEFAULT_AUTO_EXEC_CONFIDENCE_FLOOR;
  const parsed = Number.parseFloat(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) {
    return DEFAULT_AUTO_EXEC_CONFIDENCE_FLOOR;
  }
  return parsed;
}

export function resolveTarget(
  _step: any,
  context: {
    hasDOM?: boolean;
    domSelector?: string;
    peekabooAvailable?: boolean;
    peekabooTarget?: any;
    usePeekaboo?: boolean;
    axTarget?: any;
    vlmTarget?: any;
    currentApp?: string;
  },
): ResolvedTarget {
  // 1. Playwright / DOM Locator
  if (context.hasDOM && context.domSelector) {
    return {
      source: "playwright",
      confidence: 1.0,
      selector: context.domSelector,
      appName: context.currentApp,
      rationale:
        "Playwright DOM locator preferred for browser contexts due to auto-waiting actionability.",
      requiresConfirmation: false,
    };
  }

  // 1.5 Peekaboo Adapter
  const isMac = process.platform === "darwin";
  const envUsePeekaboo = process.env.USE_PEEKABOO;
  const usePeekaboo =
    context.usePeekaboo ??
    (envUsePeekaboo === "true" || (envUsePeekaboo !== "false" && isMac));

  if (usePeekaboo && context.peekabooAvailable && context.peekabooTarget) {
    return {
      source: "peekaboo",
      confidence: 0.98,
      bbox: context.peekabooTarget.bbox,
      appName: context.currentApp,
      rationale: "Peekaboo macOS automation target available.",
      requiresConfirmation: false,
    };
  }

  // 2. OpenAra accessibility target
  if (context.axTarget && context.axTarget.isOpenAra) {
    return {
      source: "openara",
      confidence: 0.95,
      bbox: context.axTarget.bbox,
      appName: context.currentApp,
      rationale: "openara accessibility target available.",
      requiresConfirmation: false,
    };
  }

  // 3. AX bounds center
  if (context.axTarget && context.axTarget.bbox) {
    return {
      source: "ax",
      confidence: 0.9,
      bbox: context.axTarget.bbox,
      appName: context.currentApp,
      rationale: "Accessibility bounds center used.",
      requiresConfirmation: false,
    };
  }

  // 4. VLM / Vision fallback
  if (context.vlmTarget) {
    // Missing/unknown confidence is treated as LOW (0), not a safe default.
    // Missing evidence must NOT silently pass the auto-execute gate.
    const rawConf = context.vlmTarget.confidence;
    const conf = typeof rawConf === "number" && Number.isFinite(rawConf)
      ? rawConf
      : 0;
    const floor = autoExecConfidenceFloor();
    return {
      source: "vision",
      confidence: conf,
      bbox: context.vlmTarget.bbox,
      appName: context.currentApp,
      rationale: "Vision/VLM coordinate fallback used.",
      requiresConfirmation: conf < floor,
    };
  }

  // 5. Manual Confirmation
  return {
    source: "manual",
    confidence: 0.0,
    appName: context.currentApp,
    rationale: "No automated target found. Requires manual confirmation.",
    requiresConfirmation: true,
  };
}

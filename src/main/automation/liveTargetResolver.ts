import {
  dumpAxElements,
  getFrontmostApp,
  preferredAppIdentifier,
  type AxElement,
  type AxDumpResult,
} from "../axDump";
import { logicalPointToPercent } from "../screenCoordinates";
import { groundTargetDirectCoord, groundTargetWithSoM } from "./visionGrounding";
import { safeLog, safeWarn } from "../logger";

/** Re-dump AX and return fresh viewport % for an ax-dump element index. */
export async function viewportPercentFromAxDumpIndex(
  app: string,
  elementIndex: number,
  timeoutMs = 800,
): Promise<{ x: number; y: number } | null> {
  const dump = await dumpAxElements(app, timeoutMs);
  if (!dump) return null;
  const el = dump.elements.find((e) => e.i === elementIndex);
  if (!el || el.w <= 0.5 || el.h <= 0.5) return null;
  return logicalPointToPercent(el.x + el.w / 2, el.y + el.h / 2);
}

export interface LiveResolvedTarget {
  viewportX: number;
  viewportY: number;
  label: string;
  action: "click" | "type" | "scroll" | "wait";
  confidence: number;
  /** Provenance of the resolved coordinates. */
  source: "ax" | "ax-geom" | "som" | "coord";
  /** ax-dump element index (NOT openara index). */
  axDumpIndex?: number;
  axDumpApp?: string;
  /** True while a vision call is in flight (caller renders a "resolving" state). */
  resolving?: boolean;
}

type GroundingMode = "ax" | "som" | "hybrid";

function groundingMode(): GroundingMode {
  const raw = (process.env.GHOST_GROUNDING || "hybrid").toLowerCase();
  if (raw === "ax" || raw === "som" || raw === "hybrid") return raw;
  return "hybrid";
}

/** Top score required for the AX fast-path (no escalation). Env-tunable. */
function highThreshold(): number {
  const raw = Number(process.env.GHOST_GROUNDING_HIGH);
  if (Number.isFinite(raw) && raw > 0 && raw <= 1) return raw;
  return 0.6;
}

/** Two top scores within this delta count as a near-tie -> escalate. */
const NEAR_TIE_DELTA = 0.1;
/** Coordinate-fallback confidence is capped here (suggest-only, never auto-click). */
const COORD_CONFIDENCE_CAP = 0.4;

const CACHE_TTL_MS = 600;
const MATCH_THRESHOLD = 0.35;
// 800ms covers a warm deep dump (~400ms on a 1000-element Electron tree) plus
// headroom; first-ever dump on an Electron app may still time out once while
// AXManualAccessibility settles — the background context poll warms it.
const AX_DUMP_TIMEOUT_MS = 800;

interface LiveTargetCacheEntry {
  pid: number;
  dump: AxDumpResult;
  fetchedAt: number;
}

let liveTargetCache: LiveTargetCacheEntry | null = null;

export function invalidateLiveTargetCache(): void {
  liveTargetCache = null;
}

/** Unique AX title/desc/value strings from the frontmost app (for model grounding). */
export async function listVisibleAxLabels(maxLabels = 60): Promise<string[]> {
  const dump = await getCachedAxDump();
  if (!dump?.elements?.length) return [];

  const seen = new Set<string>();
  const labels: string[] = [];
  for (const element of dump.elements) {
    for (const field of [element.title, element.desc, element.value]) {
      const trimmed = typeof field === "string" ? field.trim() : "";
      if (!trimmed || trimmed.length < 2) continue;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      labels.push(trimmed);
      if (labels.length >= maxLabels) return labels;
    }
  }
  return labels;
}

/** True when fuzzy matcher would resolve targetLabel against visible label strings. */
export function isLabelResolvableInVisibleSet(
  targetLabel: string,
  visibleLabels: string[],
): boolean {
  const trimmed = targetLabel.trim();
  if (!trimmed) return false;
  if (!visibleLabels.length) return false;

  const fakeElements: AxElement[] = visibleLabels.map((label, index) => ({
    i: index,
    depth: 0,
    title: label,
    desc: "",
    value: "",
    role: "AXUnknown",
    x: 0,
    y: 0,
    w: 1,
    h: 1,
    actionable: true,
  }));

  return pickBestElement(fakeElements, trimmed) !== null;
}

function normalizeText(value: string): string {
  return value.toLowerCase().trim();
}

/** Reject embedded substring matches like "edit" inside "credit". */
function isWholeToken(haystack: string, needle: string): boolean {
  const idx = haystack.indexOf(needle);
  if (idx === -1) return false;
  const before = idx === 0 ? "" : haystack[idx - 1];
  const after =
    idx + needle.length >= haystack.length ? "" : haystack[idx + needle.length];
  const boundary = (c: string) => c === "" || !/[a-z0-9]/i.test(c);
  return boundary(before) && boundary(after);
}

function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

function scoreElement(element: AxElement, targetLabel: string): number {
  const label = normalizeText(targetLabel);
  if (!label) return 0;

  const fields = [element.title, element.desc, element.value]
    .map((field) => normalizeText(field))
    .filter(Boolean);

  let best = 0;
  for (const field of fields) {
    if (field === label) {
      best = 1;
      break;
    }

    if (field.includes(label) || label.includes(field)) {
      const fieldContains =
        field.includes(label) && (field === label || isWholeToken(field, label));
      const labelContains =
        label.includes(field) && (label === field || isWholeToken(label, field));
      if (fieldContains || labelContains) {
        const overlap =
          Math.min(label.length, field.length) /
          Math.max(label.length, field.length, 1);
        // Generous score only for substantial overlap; a short label buried in a
        // long string (e.g. "Save" inside "replaySavedWorkflow") scores its raw
        // ratio and falls below the match threshold.
        best = Math.max(best, overlap >= 0.5 ? 0.55 + overlap * 0.45 : overlap);
      }
    }

    const labelTokens = tokenize(label);
    const fieldTokens = tokenize(field);
    if (labelTokens.length > 0 && fieldTokens.length > 0) {
      const matchedWeight = labelTokens.reduce((acc, token) => {
        let tokenBest = 0;
        for (const fieldToken of fieldTokens) {
          if (fieldToken === token) {
            tokenBest = 1;
            break;
          }
          if (isWholeToken(fieldToken, token)) {
            tokenBest = Math.max(tokenBest, token.length / fieldToken.length);
          } else if (isWholeToken(token, fieldToken)) {
            tokenBest = Math.max(tokenBest, fieldToken.length / token.length);
          }
        }
        return acc + tokenBest;
      }, 0);
      const tokenScore =
        matchedWeight / Math.max(labelTokens.length, fieldTokens.length, 1);
      best = Math.max(best, tokenScore);
    }
  }

  if (element.actionable) {
    best = Math.min(1, best + 0.1);
  }

  return best;
}

function pickBestElement(
  elements: AxElement[],
  targetLabel: string,
): { element: AxElement; score: number } | null {
  let best: { element: AxElement; score: number } | null = null;

  for (const element of elements) {
    if (element.w <= 0.5 || element.h <= 0.5) continue;
    const score = scoreElement(element, targetLabel);
    if (score < MATCH_THRESHOLD) continue;
    if (!best || score > best.score) {
      best = { element, score };
    } else if (
      best &&
      score === best.score &&
      element.actionable &&
      !best.element.actionable
    ) {
      best = { element, score };
    }
  }

  return best;
}

interface ScoredElement {
  element: AxElement;
  score: number;
}

/** All elements scoring >= MATCH_THRESHOLD, sorted best-first. */
function pickTopElements(
  elements: AxElement[],
  targetLabel: string,
): ScoredElement[] {
  const scored: ScoredElement[] = [];
  for (const element of elements) {
    if (element.w <= 0.5 || element.h <= 0.5) continue;
    const score = scoreElement(element, targetLabel);
    if (score < MATCH_THRESHOLD) continue;
    scored.push({ element, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored;
}

/**
 * Zero-latency, zero-model disambiguation among a near-tie / low-confidence set.
 * Prefers actionable controls, then a small role preference for the action, and
 * uses the score as a final cheap tiebreak. Returns a single winner only when it
 * is unambiguous (strictly better than the runner-up under this ordering);
 * otherwise null so the caller escalates to SoM.
 */
function disambiguateByGeometry(
  candidates: ScoredElement[],
  action: "click" | "type" | "scroll" | "wait",
): AxElement | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0].element;

  const rolePreference = (role: string): number => {
    const r = (role || "").toLowerCase();
    if (action === "type") {
      if (r.includes("textfield") || r.includes("textarea") || r.includes("searchfield"))
        return 2;
      if (r.includes("combobox")) return 1;
      return 0;
    }
    // click / default: prefer obviously clickable controls.
    if (r.includes("button") || r.includes("link") || r.includes("menuitem"))
      return 2;
    if (r.includes("checkbox") || r.includes("radio") || r.includes("tab"))
      return 1;
    return 0;
  };

  const rank = (c: ScoredElement): number =>
    (c.element.actionable ? 100 : 0) +
    rolePreference(c.element.role) * 10 +
    c.score;

  const ranked = [...candidates].sort((a, b) => rank(b) - rank(a));
  const top = ranked[0];
  const runnerUp = ranked[1];

  // Single clear winner only; an exact rank tie stays ambiguous -> escalate.
  if (rank(top) > rank(runnerUp)) {
    return top.element;
  }
  return null;
}

/** True when any runner-up is within NEAR_TIE_DELTA of the top score. */
function hasNearTie(ranked: ScoredElement[], top: ScoredElement): boolean {
  return ranked.some(
    (other, idx) => idx > 0 && top.score - other.score <= NEAR_TIE_DELTA,
  );
}

type AxDumpStatus =
  | { status: "ok"; dump: AxDumpResult; pid: number }
  | { status: "cold" } // dump timed out / spawn failed — DO NOT coord-fallback
  | { status: "no-app" }; // no frontmost app to dump

async function getCachedAxDumpStatus(): Promise<AxDumpStatus> {
  const frontmost = await getFrontmostApp(1_500);
  const pid = frontmost?.pid;
  const appId = preferredAppIdentifier(frontmost);
  if (!pid || !appId) {
    return { status: "no-app" };
  }

  const now = Date.now();
  if (
    liveTargetCache &&
    liveTargetCache.pid === pid &&
    now - liveTargetCache.fetchedAt < CACHE_TTL_MS
  ) {
    return { status: "ok", dump: liveTargetCache.dump, pid };
  }

  const dump = await dumpAxElements(appId, AX_DUMP_TIMEOUT_MS);
  if (!dump) {
    // dumpAxElements returns null ONLY for timeout / spawn-error / non-zero-exit /
    // malformed output — i.e. a cold failure, NOT a genuinely empty AX tree (that
    // comes back as a valid dump with elements: []). Distinguishing the two is what
    // lets us avoid a blind coord-fallback on a slow first dump.
    safeWarn("[LIVE_TARGET] ax dump cold (timeout/failure), will not coord-fallback");
    return { status: "cold" };
  }

  liveTargetCache = {
    pid,
    dump,
    fetchedAt: now,
  };
  return { status: "ok", dump, pid };
}

async function getCachedAxDump(): Promise<AxDumpResult | null> {
  const frontmost = await getFrontmostApp(1_500);
  const pid = frontmost?.pid;
  const appId = preferredAppIdentifier(frontmost);
  if (!pid || !appId) {
    return null;
  }

  const now = Date.now();
  if (
    liveTargetCache &&
    liveTargetCache.pid === pid &&
    now - liveTargetCache.fetchedAt < CACHE_TTL_MS
  ) {
    return liveTargetCache.dump;
  }

  const dump = await dumpAxElements(appId, AX_DUMP_TIMEOUT_MS);
  if (!dump) {
    safeWarn("[LIVE_TARGET] ax dump timed out, skipping ghost pop");
    return null;
  }

  liveTargetCache = {
    pid,
    dump,
    fetchedAt: now,
  };
  return dump;
}

function resolvedFromElement(
  element: AxElement,
  action: "click" | "type" | "scroll" | "wait",
  confidence: number,
  source: LiveResolvedTarget["source"],
  fallbackLabel: string,
  axDumpApp?: string,
): LiveResolvedTarget | null {
  const centerX = element.x + element.w / 2;
  const centerY = element.y + element.h / 2;
  const viewport = logicalPointToPercent(centerX, centerY);
  if (!viewport) {
    safeWarn("[LIVE_TARGET] element center outside active display", {
      centerX,
      centerY,
      fallbackLabel,
    });
    return null;
  }
  const label =
    element.title || element.desc || element.value || fallbackLabel;
  return {
    viewportX: viewport.x,
    viewportY: viewport.y,
    label,
    action,
    confidence,
    source,
    axDumpIndex: element.i,
    axDumpApp,
  };
}

export async function resolveLiveTarget(
  targetLabel: string,
  action: "click" | "type" | "scroll" | "wait",
): Promise<LiveResolvedTarget | null> {
  const trimmedLabel = targetLabel.trim();
  if (!trimmedLabel) return null;

  const mode = groundingMode();
  const dumpStatus = await getCachedAxDumpStatus();

  // Cold AX dump (timeout / spawn failure) is NOT a zero-AX app. Do not blindly
  // coord-fallback on a slow first dump — return null with a retry hint so the
  // caller can re-summon once the background poll warms the tree.
  if (dumpStatus.status === "cold") {
    safeWarn("[LIVE_TARGET] ax dump cold — skipping ghost pop, retry shortly", {
      targetLabel: trimmedLabel,
    });
    return null;
  }

  const elements =
    dumpStatus.status === "ok" ? dumpStatus.dump.elements : [];
  const pid = dumpStatus.status === "ok" ? dumpStatus.pid : undefined;
  const axDumpApp =
    dumpStatus.status === "ok" ? dumpStatus.dump.app : undefined;

  // ── Step 1: AX fuzzy match fast-path ──────────────────────────────────────
  const ranked = pickTopElements(elements, trimmedLabel);
  const top = ranked[0] ?? null;
  const HIGH = highThreshold();
  const nearTie = top !== null && hasNearTie(ranked, top);

  if (top && top.score >= HIGH && !nearTie) {
    safeLog("[LIVE_TARGET] resolved (ax)", {
      targetLabel: trimmedLabel,
      score: Number(top.score.toFixed(3)),
    });
    const axResolved = resolvedFromElement(
      top.element,
      action,
      top.score,
      "ax",
      trimmedLabel,
      axDumpApp,
    );
    if (axResolved) return axResolved;
  }

  // GHOST_GROUNDING=ax keeps today's behavior: AX-only, no escalation.
  if (mode === "ax") {
    if (top) {
      safeLog("[LIVE_TARGET] resolved (ax, no-escalate)", {
        targetLabel: trimmedLabel,
        score: Number(top.score.toFixed(3)),
      });
      const axResolved = resolvedFromElement(
        top.element,
        action,
        top.score,
        "ax",
        trimmedLabel,
        axDumpApp,
      );
      if (axResolved) return axResolved;
    }
    safeLog("[LIVE_TARGET] no match (ax mode)", { targetLabel: trimmedLabel });
    return null;
  }

  // ── Step 2: AX-geometry disambiguation (zero latency, zero model) ─────────
  // Only disambiguate near-ties — don't let geom override a clear text winner.
  const topScore = ranked[0]?.score ?? 0;
  const geomSet = ranked.filter(
    (c) => topScore - c.score <= NEAR_TIE_DELTA,
  );
  if (geomSet.length > 0) {
    const winner = disambiguateByGeometry(geomSet, action);
    if (winner) {
      const winnerScore =
        geomSet.find((c) => c.element === winner)?.score ?? top?.score ?? 0.5;
      safeLog("[LIVE_TARGET] resolved (ax-geom)", {
        targetLabel: trimmedLabel,
        candidates: geomSet.length,
        score: Number(winnerScore.toFixed(3)),
      });
      const geomResolved = resolvedFromElement(
        winner,
        action,
        winnerScore,
        "ax-geom",
        trimmedLabel,
        axDumpApp,
      );
      if (geomResolved) return geomResolved;
    }
  }

  // ── Step 3: Set-of-Mark vision escalation ────────────────────────────────
  // Only when AX produced candidates. (mode === "ax" already returned above, so
  // here mode is "som" | "hybrid" and vision is permitted.)
  if (geomSet.length > 0) {
    const candidates = geomSet.map((c) => c.element);
    const som = await groundTargetWithSoM(candidates, trimmedLabel, pid);
    if (som) {
      safeLog("[LIVE_TARGET] resolved (som)", {
        targetLabel: trimmedLabel,
        chosenIndex: som.chosenIndex,
        confidence: Number(som.confidence.toFixed(3)),
      });
      return {
        viewportX: som.viewportX,
        viewportY: som.viewportY,
        label: som.label || trimmedLabel,
        action,
        confidence: som.confidence,
        source: "som",
      };
    }
    // SoM declined (no match / parse fail) — fall through to "ask".
    safeLog("[LIVE_TARGET] som declined", { targetLabel: trimmedLabel });
    return null;
  }

  // ── Step 4: zero-AX — vision coordinate fallback (no misleading center) ───
  if (dumpStatus.status === "no-app" || elements.length === 0) {
    if (mode === "ax") {
      safeWarn("[LIVE_TARGET] zero-AX in ax mode", { targetLabel: trimmedLabel });
      return null;
    }
    safeLog("[LIVE_TARGET] zero-AX — trying direct vision coord", {
      targetLabel: trimmedLabel,
    });
    const direct = await groundTargetDirectCoord(trimmedLabel);
    if (direct) {
      return {
        viewportX: direct.viewportX,
        viewportY: direct.viewportY,
        label: direct.label || trimmedLabel,
        action,
        confidence: Math.min(COORD_CONFIDENCE_CAP, direct.confidence),
        source: "coord",
      };
    }
    safeWarn("[LIVE_TARGET] zero-AX vision coord failed", {
      targetLabel: trimmedLabel,
    });
    return null;
  }

  safeLog("[LIVE_TARGET] no match", { targetLabel: trimmedLabel });
  return null;
}

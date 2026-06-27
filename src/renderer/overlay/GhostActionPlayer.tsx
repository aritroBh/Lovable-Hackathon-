import React, { useEffect, useRef, useState } from "react";
import { useGhostSpring } from "./useGhostSpring";

const CURSOR_HOTSPOT = { x: 5.5, y: 3.21 };

// Pill placement: how far the pill sits from the arrow tip, and the screen-%
// thresholds at which it flips to the opposite side so it never clips off-screen
// — and, by offsetting past the cursor body, never sits on top of the target.
const PILL_GAP_PX = 18;
const FLIP_X_AT = 62; // past this viewport-X %, place pill to the LEFT of the tip
const FLIP_Y_AT = 82; // past this viewport-Y %, place pill ABOVE the tip

export interface GhostActionPlayerProps {
  step: any;
  isActive: boolean;
  /** Viewport-percent origin for first travel (e.g. idle roam position). */
  start?: { x: number; y: number };
}

const GhostCursorSvg: React.FC<{ className?: string }> = ({ className }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" className={className}>
    <path
      d="M5.5 3.21V20.8c0 .45.54.67.85.35l4.86-4.86a.5.5 0 0 1 .35-.15h6.87a.5.5 0 0 0 .35-.85L5.5 3.21z"
      fill="white"
      stroke="black"
      strokeWidth="1"
      strokeLinejoin="round"
      strokeLinecap="round"
    />
  </svg>
);

/** Single label channel — the verb/target text shown in the traveling pill. */
function pillText(step: any): string | null {
  const action = step?.action || "click";
  const label = (step?.label ? String(step.label) : "").trim();
  if (action === "type") {
    const typed = step?.typeText ? String(step.typeText).trim() : "";
    return typed ? `Type: ${typed.slice(0, 32)}` : "Type";
  }
  if (action === "scroll") return "Scroll";
  if (action === "wait") return "Wait";
  // click
  return label ? `Click "${label.slice(0, 28)}"` : "Click";
}

export const GhostActionPlayer: React.FC<GhostActionPlayerProps> = ({
  step,
  isActive,
  start,
}) => {
  const target =
    step && (step.viewportX != null || step.x != null)
      ? {
          x: step.viewportX ?? step.x,
          y: step.viewportY ?? step.y,
        }
      : null;

  const {
    x: percentX,
    y: percentY,
    isMoving,
    isSettled,
  } = useGhostSpring(isActive ? target : null, {
    stiffness: 170,
    damping: 26,
    restDelta: 0.05,
    start,
  });

  const isTraveling = isMoving;
  const isArrived = isSettled;

  const prevPosRef = useRef({ x: percentX, y: percentY });
  const [typingDots, setTypingDots] = useState(".");

  useEffect(() => {
    if (!isTraveling) {
      prevPosRef.current = { x: percentX, y: percentY };
    }
  }, [isTraveling, percentX, percentY]);

  useEffect(() => {
    if (!isArrived || step?.action !== "type") return;
    const id = window.setInterval(() => {
      setTypingDots((current) =>
        current === "." ? ".." : current === ".." ? "..." : ".",
      );
    }, 400);
    return () => window.clearInterval(id);
  }, [isArrived, step?.action]);

  if (!isActive || !step || !target) return null;

  const action = step.action || "click";
  const resolving = Boolean(step.resolving);

  const travelDx = target.x - prevPosRef.current.x;
  const travelDy = target.y - prevPosRef.current.y;
  const travelLen = Math.hypot(travelDx, travelDy) || 1;
  const trailOffsetX = (-travelDx / travelLen) * 6;
  const trailOffsetY = (-travelDy / travelLen) * 6;

  const baseStyle: React.CSSProperties = {
    position: "fixed",
    left: 0,
    top: 0,
    // GPU-composited positioning: x/y go through `transform` (vw/vh) rather than
    // `left/top %`, so each spring frame is a compositor transform instead of a
    // layout + paint of the whole overlay. The hotspot offset is folded into the
    // same translate. For a position:fixed element, `Nvw`/`Nvh` equal the old
    // `left/top: N%`, so this is visually identical but far cheaper per frame.
    transform: `translate(calc(${percentX}vw - ${CURSOR_HOTSPOT.x}px), calc(${percentY}vh - ${CURSOR_HOTSPOT.y}px))`,
    pointerEvents: "none",
    zIndex: 9999,
    willChange: "transform",
    // Spring drives the motion frame-by-frame, so no CSS position transition
    // (it would double-animate / lag the RAF integration).
    transition: "none",
    filter: "drop-shadow(0 3px 5px rgba(0, 0, 0, 0.38))",
  };

  // ---- Intent pill geometry ----------------------------------------------
  // Flip horizontally near the right edge and vertically near the bottom edge,
  // so the pill never clips off-screen. The offset is measured from the arrow
  // tip and pushes the pill clear of the cursor body, so it never covers the
  // point being indicated even mid-screen.
  const flipX = percentX >= FLIP_X_AT;
  const flipY = percentY >= FLIP_Y_AT;
  const text = pillText(step);

  // The arrow tip is the hotspot; the cursor body extends down-right of it.
  // Default placement is to the right and slightly below the tip. The shared
  // look (purple gradient, radius, fade-in) lives in `.ghost-intent-pill`;
  // only placement/flip is dynamic here. PILL_GAP_PX pushes the pill clear of
  // the cursor body so it never sits on the indicated point.
  const pillStyle: React.CSSProperties = {
    position: "absolute",
    top: flipY ? "auto" : 24 + PILL_GAP_PX - 16,
    bottom: flipY ? 24 + PILL_GAP_PX - 16 : "auto",
    left: flipX ? "auto" : 22 + PILL_GAP_PX - 16,
    right: flipX ? 22 + PILL_GAP_PX - 16 : "auto",
  };

  // Non-color state cue (colorblind-safe): a pulsing "…" while resolving vs a
  // steady check "✓" once locked. Pairs with the amber/purple color shift.
  const statusGlyph = resolving ? (
    <span
      className="ghost-resolve-dots"
      style={{
        animation: "ghost-resolve-dots 900ms ease-in-out infinite",
        fontWeight: 800,
        opacity: 0.9,
      }}
    >
      …
    </span>
  ) : (
    <span style={{ opacity: 0.9, fontWeight: 800 }}>✓</span>
  );

  const pill = text ? (
    <div
      className={`ghost-intent-pill${resolving ? " is-resolving" : ""}`}
      style={pillStyle}
    >
      {statusGlyph}
      <span
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          maxWidth: 200,
        }}
      >
        {action === "type" && isArrived ? (
          <>
            {text}
            <span style={{ opacity: 0.7 }}>{typingDots}</span>
          </>
        ) : (
          text
        )}
      </span>
    </div>
  ) : null;

  // Resolving cursor wrapper: a gentle pulsing halo behind the arrow, reusing
  // the existing ghost-speak-pulse glow vocabulary (purple drop-shadow), tinted
  // amber for the unsure state. Locked = solid, no pulse.
  const cursorWithState = (cursorSvg: React.ReactNode) => {
    if (resolving) {
      return (
        <div style={{ position: "relative", display: "inline-block" }}>
          <div className="ghost-resolve-halo" />
          {cursorSvg}
        </div>
      );
    }
    return cursorSvg;
  };

  if (isTraveling) {
    return (
      <>
        <div
          className="ghost-travel-trail"
          style={{
            ...baseStyle,
            transform: `translate(calc(${percentX}vw - ${CURSOR_HOTSPOT.x}px + ${trailOffsetX}px), calc(${percentY}vh - ${CURSOR_HOTSPOT.y}px + ${trailOffsetY}px))`,
          }}
        >
          <GhostCursorSvg />
        </div>
        <div style={baseStyle}>{cursorWithState(<GhostCursorSvg />)}</div>
      </>
    );
  }

  if (!isArrived) {
    return <div style={baseStyle}>{cursorWithState(<GhostCursorSvg />)}</div>;
  }

  if (action === "click") {
    return (
      <div style={baseStyle}>
        {cursorWithState(
          <div className="ghost-action-click">
            <GhostCursorSvg />
          </div>,
        )}
        {pill}
      </div>
    );
  }

  if (action === "type") {
    return (
      <div style={baseStyle}>
        <div style={{ display: "flex", alignItems: "flex-start" }}>
          {cursorWithState(<GhostCursorSvg />)}
          <div className="ghost-action-type" />
        </div>
        {pill}
      </div>
    );
  }

  if (action === "scroll") {
    return (
      <div style={baseStyle}>
        {cursorWithState(
          <div className="ghost-action-scroll">
            <GhostCursorSvg />
          </div>,
        )}
        {pill}
      </div>
    );
  }

  return (
    <div style={baseStyle}>
      {cursorWithState(
        <div className="ghost-action-wait">
          <GhostCursorSvg />
        </div>,
      )}
      {pill}
    </div>
  );
};

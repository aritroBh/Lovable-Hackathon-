import React from "react";

const CURSOR_HOTSPOT = { x: 5.5, y: 3.21 };

let stylesInjected = false;

interface GhostCursorProps {
  isVisible: boolean;
  mood?: string;
  step?: any;
  isSpeaking?: boolean;
}

export const GhostCursor: React.FC<GhostCursorProps> = ({
  isVisible,
  step,
  isSpeaking = false,
}) => {
  if (!isVisible || !step) return null;

  if (!stylesInjected) {
    stylesInjected = true;
    const style = document.createElement("style");
    style.textContent = `
      @keyframes ghost-speak-pulse {
        0%, 100% { transform: scale(1.0); filter: drop-shadow(0 3px 5px rgba(0,0,0,0.38)); }
        50% { transform: scale(1.11); filter: drop-shadow(0 0 10px rgba(180,140,255,0.88)) drop-shadow(0 3px 5px rgba(0,0,0,0.38)); }
      }
      @keyframes ghost-speak-wave {
        0%   { opacity: 0;    transform: translate(-50%, -50%) scale(0.7); }
        40%  { opacity: 0.45; }
        100% { opacity: 0;    transform: translate(-50%, -50%) scale(1.6); }
      }
      @keyframes ghost-resolve-halo {
        0%, 100% { opacity: 0.35; transform: translate(-50%, -50%) scale(0.92); }
        50%      { opacity: 0.85; transform: translate(-50%, -50%) scale(1.18); }
      }
    `;
    document.head.appendChild(style);
  }

  // Clamp: step coordinates arrive over IPC; never paint off-screen.
  const percentX = Math.min(100, Math.max(0, step.viewportX ?? step.x));
  const percentY = Math.min(100, Math.max(0, step.viewportY ?? step.y));

  // Confidence state: amber pulsing halo + "…" while resolving; solid + "✓"
  // (steady dot) once locked. The glyph is a non-color cue so the two states
  // are distinguishable without relying on the amber/purple difference.
  const resolving = Boolean(step.resolving);

  const svg = (
    <svg width="24" height="24" viewBox="0 0 24 24">
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

  return (
    <div
      style={{
        position: "fixed",
        left: 0,
        top: 0,
        // GPU-composited positioning (see GhostActionPlayer): drive x/y through
        // `transform` (vw/vh) + hotspot offset, not `left/top %`, so re-targeting
        // the ghost is a compositor transform rather than an overlay relayout.
        transform: `translate(calc(${percentX}vw - ${CURSOR_HOTSPOT.x}px), calc(${percentY}vh - ${CURSOR_HOTSPOT.y}px))`,
        pointerEvents: "none",
        zIndex: 9999,
        willChange: "transform",
      }}
    >
      {isSpeaking ? (
        <div style={{ position: "relative", display: "inline-block" }}>
          <div
            style={{
              animation:
                "ghost-speak-pulse 240ms ease-in-out infinite alternate",
            }}
          >
            {svg}
          </div>
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              width: "32px",
              height: "32px",
              borderRadius: "50%",
              border: "1.5px solid rgba(180,140,255,0.55)",
              pointerEvents: "none",
              animation: "ghost-speak-wave 520ms ease-out infinite",
              animationDelay: "0ms",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              width: "32px",
              height: "32px",
              borderRadius: "50%",
              border: "1.5px solid rgba(180,140,255,0.55)",
              pointerEvents: "none",
              animation: "ghost-speak-wave 520ms ease-out infinite",
              animationDelay: "260ms",
            }}
          />
        </div>
      ) : resolving ? (
        <div style={{ position: "relative", display: "inline-block" }}>
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              width: "36px",
              height: "36px",
              borderRadius: "50%",
              background:
                "radial-gradient(circle, rgba(255,196,90,0.5), rgba(255,196,90,0) 70%)",
              pointerEvents: "none",
              animation: "ghost-resolve-halo 1000ms ease-in-out infinite",
            }}
          />
          {svg}
          <span
            style={{
              position: "absolute",
              left: "18px",
              top: "-2px",
              fontSize: "12px",
              fontWeight: 800,
              color: "rgba(255,214,130,0.96)",
              textShadow: "0 1px 2px rgba(0,0,0,0.5)",
              animation: "ghost-resolve-halo 900ms ease-in-out infinite",
            }}
          >
            …
          </span>
        </div>
      ) : (
        svg
      )}
    </div>
  );
};

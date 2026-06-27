import React, { useEffect, useState } from "react";

interface WalkthroughGuideProps {
  step: any;
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

interface ViewportDims {
  width: number;
  height: number;
}

function readViewportDims(): ViewportDims {
  if (typeof window === "undefined") return { width: 0, height: 0 };
  return { width: window.innerWidth, height: window.innerHeight };
}

export const WalkthroughGuide: React.FC<WalkthroughGuideProps> = ({ step }) => {
  const [dims, setDims] = useState<ViewportDims>(readViewportDims);

  useEffect(() => {
    const update = () => setDims(readViewportDims());
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  if (!step || step.type === "idle") return null;

  const x = clampPercent(step.viewportX ?? step.x ?? 50);
  const y = clampPercent(step.viewportY ?? step.y ?? 50);
  const bubbleOnLeft = x > 70;
  const bubbleAbove = y > 72;
  const hasHint = Boolean(step.instruction || step.targetLabel);
  const isLocked = step.ghostLocked === true;
  const isWait = step.action === "wait";
  const pixelX = Math.round((x / 100) * dims.width);
  const pixelY = Math.round((y / 100) * dims.height);

  return (
    <div
      className={`walkthrough-guide-container ${isLocked ? "is-locked" : ""} ${isWait ? "is-wait" : ""}`}
      style={{
        transform: `translate3d(${pixelX}px, ${pixelY}px, 0)`,
      }}
    >
      <div className="walkthrough-guide-ring" />
      <div className="walkthrough-guide-dot" />

      <svg
        className="walkthrough-guide-pointer"
        width="34"
        height="42"
        viewBox="0 0 28 34"
        aria-hidden="true"
      >
        <path d="M2.4 2.3v27.1l7.2-7.4 4.3 10 5.1-2.2-4.3-9.8h10.6L2.4 2.3Z" />
      </svg>

      {hasHint && (
        <div
          className={[
            "walkthrough-guide-bubble",
            bubbleOnLeft ? "is-left" : "is-right",
            bubbleAbove ? "is-above" : "is-below",
          ].join(" ")}
        >
          {step.instruction || step.targetLabel}
        </div>
      )}
    </div>
  );
};

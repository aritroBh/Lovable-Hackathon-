import React, { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { WalkthroughGuide } from "./overlay/WalkthroughGuide";
import "./src/assets/overlay.css";

const TARGETS = [
  { left: "25%", top: "20%" },
  { left: "75%", top: "25%" },
  { left: "50%", top: "60%" },
  { left: "80%", top: "85%" },
];

function App() {
  const [step, setStep] = React.useState<any>(null);

  useEffect(() => {
    const container = document.getElementById("targets");
    if (!container) return;
    container.innerHTML = "";
    TARGETS.forEach((t, i) => {
      const el = document.createElement("div");
      el.className = "target";
      el.dataset.idx = String(i);
      el.style.left = t.left;
      el.style.top = t.top;
      container.appendChild(el);
    });
  }, []);

  useEffect(() => {
    (window as any).__WALKTHROUGH_TEST__ = {
      showAt(index: number) {
        const el = document.querySelector(
          `.target[data-idx="${index}"]`,
        ) as HTMLElement | null;
        if (!el) return { error: "no target" };
        const r = el.getBoundingClientRect();
        const viewportX = ((r.left + r.width / 2) / window.innerWidth) * 100;
        const viewportY = ((r.top + r.height / 2) / window.innerHeight) * 100;
        setStep({
          viewportX,
          viewportY,
          x: 999,
          y: 999,
          action: "click",
          instruction: "Test hint",
          targetLabel: "Btn",
        });
        (window as any).__WALKTHROUGH_LAST__ = {
          usedViewport: true,
          viewportX,
          viewportY,
        };
        return new Promise((resolve) => {
          requestAnimationFrame(() =>
            requestAnimationFrame(() => resolve({ viewportX, viewportY })),
          );
        });
      },
      measureRing(index: number) {
        const tEl = document.querySelector(
          `.target[data-idx="${index}"]`,
        ) as HTMLElement | null;
        const ring = document.querySelector(
          ".walkthrough-guide-dot",
        ) as HTMLElement | null;
        if (!tEl || !ring) return { error: "missing elements" };
        const tr = tEl.getBoundingClientRect();
        const rr = ring.getBoundingClientRect();
        const tcx = tr.left + tr.width / 2;
        const tcy = tr.top + tr.height / 2;
        const rcx = rr.left + rr.width / 2;
        const rcy = rr.top + rr.height / 2;
        const last = (window as any).__WALKTHROUGH_LAST__;
        return {
          distancePx: Math.hypot(rcx - tcx, rcy - tcy),
          usedViewportNotRaw: last?.usedViewport === true,
        };
      },
      targetCount: TARGETS.length,
    };
  }, [step]);

  return <WalkthroughGuide step={step} />;
}

createRoot(document.getElementById("root")!).render(<App />);

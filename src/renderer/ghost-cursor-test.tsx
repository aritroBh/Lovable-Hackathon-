import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { GhostActionPlayer } from "./overlay/GhostActionPlayer";
import "./src/assets/overlay.css";

const CURSOR_HOTSPOT = { x: 5.5, y: 3.21 };

const TARGETS = [
  { name: "A", left: "15%", top: "20%" },
  { name: "B", left: "85%", top: "25%" },
  { name: "C", left: "50%", top: "55%" },
  { name: "D", left: "70%", top: "85%" },
  { name: "E", left: "25%", top: "88%" },
];

function App() {
  const [idx, setIdx] = useState(0);
  const [step, setStep] = useState<any>(null);
  const [active, setActive] = useState(false);

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
    (window as any).__GHOST_INTEGRATION__ = {
      async gotoTarget(index: number) {
        const el = document.querySelector(
          `.target[data-idx="${index}"]`,
        ) as HTMLElement | null;
        if (!el) return { error: "no target" };
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const viewportX = (cx / window.innerWidth) * 100;
        const viewportY = (cy / window.innerHeight) * 100;
        setActive(false);
        setStep(null);
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        setStep({
          viewportX,
          viewportY,
          x: viewportX,
          y: viewportY,
          action: "click",
          label: TARGETS[index]?.name || "Target",
        });
        setActive(true);
        setIdx(index);
        return { viewportX, viewportY, index };
      },
      measureTip(index: number) {
        const target = document.querySelector(
          `.target[data-idx="${index}"]`,
        ) as HTMLElement | null;
        if (!target) return { error: "missing target" };
        const tr = target.getBoundingClientRect();
        const tcx = tr.left + tr.width / 2;
        const tcy = tr.top + tr.height / 2;
        const ghost =
          (document.querySelector(
            "#ghost-integration-root svg",
          ) as HTMLElement | null)?.closest("div[style]") ||
          (document.querySelector(
            "#ghost-integration-root > div",
          ) as HTMLElement | null);
        if (!ghost) return { error: "missing ghost" };
        const gr = ghost.getBoundingClientRect();
        const tipX = gr.left + CURSOR_HOTSPOT.x;
        const tipY = gr.top + CURSOR_HOTSPOT.y;
        const pill = document.querySelector(".ghost-intent-pill");
        let pillCoversTarget = false;
        if (pill) {
          const pr = pill.getBoundingClientRect();
          pillCoversTarget =
            tcx >= pr.left &&
            tcx <= pr.right &&
            tcy >= pr.top &&
            tcy <= pr.bottom;
        }
        return {
          distancePx: Math.hypot(tipX - tcx, tipY - tcy),
          pillCoversTarget,
        };
      },
      targetCount: TARGETS.length,
    };
  }, []);

  return (
    <div id="ghost-integration-root">
      <GhostActionPlayer
        step={step}
        isActive={active}
        start={{ x: 10, y: 10 }}
      />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);

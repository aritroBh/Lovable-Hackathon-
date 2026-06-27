import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { TargetPreviewGhost } from "./overlay/TargetPreviewGhost";

const CURSOR_HOTSPOT = { x: 5.5, y: 3.21 };
const TRAVEL_MS = 650;

const TARGETS = [
  { name: "P1", left: "20%", top: "30%" },
  { name: "P2", left: "80%", top: "35%" },
  { name: "P3", left: "55%", top: "75%" },
];

function App() {
  const [target, setTarget] = useState<{
    x: number;
    y: number;
    label: string;
  } | null>(null);
  const [active, setActive] = useState(false);
  const [start, setStart] = useState({ x: 12, y: 12 });

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
    (window as any).__GHOST_PREVIEW__ = {
      async gotoTarget(index: number) {
        const el = document.querySelector(
          `.target[data-idx="${index}"]`,
        ) as HTMLElement | null;
        if (!el) return { error: "no target" };
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const x = (cx / window.innerWidth) * 100;
        const y = (cy / window.innerHeight) * 100;
        setActive(false);
        setTarget(null);
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        setStart({ x: 10, y: 10 });
        setTarget({ x, y, label: TARGETS[index]?.name || "T" });
        setActive(true);
        return { x, y, index };
      },
      async measureTip(index: number) {
        await new Promise((r) => setTimeout(r, TRAVEL_MS + 50));
        const tEl = document.querySelector(
          `.target[data-idx="${index}"]`,
        ) as HTMLElement | null;
        const svg = document.querySelector(
          ".target-preview-ghost-pulse svg, svg",
        ) as SVGSVGElement | null;
        const ghost = svg?.closest("div[style]") as HTMLElement | null;
        if (!tEl || !ghost) return { error: "missing elements" };
        const tr = tEl.getBoundingClientRect();
        const gr = ghost.getBoundingClientRect();
        const tcx = tr.left + tr.width / 2;
        const tcy = tr.top + tr.height / 2;
        const tipX = gr.left + CURSOR_HOTSPOT.x;
        const tipY = gr.top + CURSOR_HOTSPOT.y;
        return { distancePx: Math.hypot(tipX - tcx, tipY - tcy) };
      },
      targetCount: TARGETS.length,
    };
  }, []);

  return (
    <TargetPreviewGhost target={target} start={start} active={active} />
  );
}

createRoot(document.getElementById("root")!).render(<App />);

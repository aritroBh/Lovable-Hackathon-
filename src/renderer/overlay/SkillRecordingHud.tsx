import { useEffect, useState } from "react";

interface SkillRecordingPayload {
  active?: boolean;
  startedAt?: number | null;
  appName?: string | null;
  frameCount?: number;
}

function formatElapsed(startedAt: number | null | undefined): string {
  if (!startedAt) return "0:00";
  const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function SkillRecordingHud() {
  const [active, setActive] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [appName, setAppName] = useState("Desktop");
  const [frameCount, setFrameCount] = useState(0);
  const [elapsed, setElapsed] = useState("0:00");
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    const api = (window as any).api;
    if (!api?.onSkillRecording) return;

    const offRecording = api.onSkillRecording((payload: SkillRecordingPayload) => {
      setActive(Boolean(payload?.active));
      setStartedAt(payload?.startedAt ?? null);
      setAppName(payload?.appName || "Desktop");
      setFrameCount(payload?.frameCount ?? 0);
    });

    const offBuilt = api.onSkillBuilt?.((payload: { skill?: { title?: string; stepCount?: number; published?: boolean } }) => {
      const title = payload?.skill?.title || "Skill";
      const steps = payload?.skill?.stepCount ?? 0;
      const published = payload?.skill?.published ? "Published to Skills Hub." : "Saved locally.";
      setToast(`${title} — ${steps} steps. ${published}`);
      window.setTimeout(() => setToast(null), 5000);
    });

    return () => {
      offRecording?.();
      offBuilt?.();
    };
  }, []);

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => {
      setElapsed(formatElapsed(startedAt));
    }, 250);
    return () => window.clearInterval(timer);
  }, [active, startedAt]);

  if (!active && !toast) return null;

  return (
    <div className="skill-recording-layer" aria-live="polite">
      {active && (
        <div className="skill-recording-pill">
          <span className="skill-recording-dot" />
          <span className="skill-recording-text">
            REC SKILL · {appName} · {elapsed} · {frameCount} events
          </span>
          <span className="skill-recording-hint">Cmd+Shift+R to stop</span>
        </div>
      )}
      {toast && <div className="skill-recording-toast">{toast}</div>}
    </div>
  );
}

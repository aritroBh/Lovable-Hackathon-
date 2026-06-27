import { useEffect, useRef, useState } from "react";

/**
 * requestAnimationFrame critically-ish-damped spring for the action cursor.
 *
 * Used ONLY by GhostActionPlayer — the shared `useGhostTravel` hook (also
 * driving TargetPreviewGhost) is intentionally left untouched. This gives the
 * action glide a physical, momentum-aware feel instead of a fixed-duration
 * tween, while still clamping to the viewport so IPC coordinates can never
 * paint the ghost off-screen.
 */

/** Viewport-percent clamp — coordinates arrive over IPC. */
function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

export interface UseGhostSpringOptions {
  stiffness?: number;
  damping?: number;
  /** Settle when both |distance| and |velocity| drop below this (in %). */
  restDelta?: number;
  /** Seed position (viewport %) so the first frame paints at the origin. */
  start?: { x: number; y: number };
}

export interface GhostSpringState {
  x: number;
  y: number;
  /** True while the spring is still in motion toward the target. */
  isMoving: boolean;
  /** True once the spring has settled on the target. */
  isSettled: boolean;
}

export function useGhostSpring(
  target: { x: number; y: number } | null,
  options?: UseGhostSpringOptions,
): GhostSpringState {
  const stiffness = options?.stiffness ?? 170;
  const damping = options?.damping ?? 26;
  const restDelta = options?.restDelta ?? 0.05;

  const seed = options?.start ?? { x: 50, y: 50 };
  const posRef = useRef({ x: seed.x, y: seed.y });
  const velRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);

  const [state, setState] = useState<GhostSpringState>({
    x: seed.x,
    y: seed.y,
    isMoving: false,
    isSettled: target == null,
  });

  useEffect(() => {
    if (!target) {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTimeRef.current = null;
      return;
    }

    if (options?.start) {
      posRef.current = {
        x: clampPercent(options.start.x),
        y: clampPercent(options.start.y),
      };
      velRef.current = { x: 0, y: 0 };
    }

    const tx = clampPercent(target.x);
    const ty = clampPercent(target.y);
    setState((s) => ({ ...s, isMoving: true, isSettled: false }));

    const tick = (now: number) => {
      const last = lastTimeRef.current ?? now;
      // Clamp dt so a backgrounded tab doesn't explode the integration.
      const dt = Math.min((now - last) / 1000, 1 / 30);
      lastTimeRef.current = now;

      let settled = true;
      for (const axis of ["x", "y"] as const) {
        const goal = axis === "x" ? tx : ty;
        const displacement = posRef.current[axis] - goal;
        const accel =
          -stiffness * displacement - damping * velRef.current[axis];
        velRef.current[axis] += accel * dt;
        posRef.current[axis] += velRef.current[axis] * dt;
        if (
          Math.abs(velRef.current[axis]) > restDelta ||
          Math.abs(displacement) > restDelta
        ) {
          settled = false;
        }
      }

      if (settled) {
        posRef.current = { x: tx, y: ty };
        velRef.current = { x: 0, y: 0 };
        lastTimeRef.current = null;
        rafRef.current = null;
        setState({ x: tx, y: ty, isMoving: false, isSettled: true });
        return;
      }

      setState({
        x: clampPercent(posRef.current.x),
        y: clampPercent(posRef.current.y),
        isMoving: true,
        isSettled: false,
      });
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTimeRef.current = null;
    };
    // Re-arm only on a genuine target change.
  }, [
    target?.x,
    target?.y,
    options?.start?.x,
    options?.start?.y,
    stiffness,
    damping,
    restDelta,
  ]);

  return state;
}

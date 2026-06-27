# Ghost action-cursor redesign

Design doc. Not implementation. Decided in an office-hours session, 2026-06-23.

## Scope

**In:** the *action pointer* cursor — the one that pops up to point at a target
when you ask Specter to click/type/scroll something.
- `src/renderer/overlay/GhostActionPlayer.tsx` — wiring, label, trail, action states
- `src/renderer/overlay/GhostCursor.tsx` — the SVG glyph + speak glow
- `src/renderer/overlay/useGhostTravel.ts` — travel/glide motion
- `src/main/automation/liveTargetResolver.ts` — where it points (accuracy)
- `src/main/vision/index.ts` — `analyzeVision()`, already built, reused for grounding

**Out:** the ambient ghost roaming the screen (`usePerimeterRoam.ts`). It's fine.
Do not touch it.

**Constraint:** `useGhostTravel` is shared — `GhostActionPlayer` uses `loop:false`,
`TargetPreviewGhost` uses `loop:true`. Any motion rewrite must keep both callers
working. Don't break the preview ghost.

## The three problems (all on the action cursor)

| Problem | Lives in | Today |
| --- | --- | --- |
| Points at wrong spot | `liveTargetResolver.ts` | Fuzzy string-match of label → AX element, threshold 0.35, clicks element center. Blind to icon-only/duplicate-labeled controls. |
| Movement is janky | `useGhostTravel.ts` | `setTimeout` phase machine (enter→travel→arrived→reset) + a single linear `transform 550ms ease-out` tween + a static 6px trail. Race-prone (the commit log keeps re-fixing it). |
| Cursor looks generic | `GhostCursor.tsx` | Plain 24px white OS-arrow, black stroke, drop shadow. No character. |

## Decisions

- **Visual:** Intent pill — arrow glyph + a small label pill that travels with it.
- **Motion:** RAF spring. No `framer-motion` dependency.
- **Accuracy:** Confidence-gated hybrid. AX fast-path, escalate to vision when unsure.
- **Build window:** several days → full build incl. confidence states + safety gate.

---

## Front 1 — Visual: intent pill

Replace the bare arrow with **arrow + pill**. The pill is the cursor's voice.

- **Unify the label channel.** The pill *replaces* the separate type-caption block
  (`GhostActionPlayer.tsx:126-150`). One label system, not two:
  - `click` → pill reads `Click "<target>"`
  - `type`  → pill reads the text being typed (the old caption behavior moves here)
  - `scroll`/`wait` → pill reads the verb
- **Style:** pill rounded (`rx≈14`), fill purple `#534AB7`, text purple-100 `#CECBF6`,
  fades in on arrival. Arrow keeps the existing purple glow vocabulary already in
  `GhostCursor.tsx` (the `ghost-speak-pulse` drop-shadow). Reuse it; don't invent a
  second glow.
- **Edge handling:** pill auto-flips to the other side of the arrow near the right/
  bottom screen edge so it never clips. The arrow is already clamped
  (`GhostCursor.tsx:39-40`); the pill needs its *own* flip since it extends past the tip.
- **Confidence tint (ties to Front 3):** arrow/pill solid purple when confident,
  amber while resolving, so the look *is* the accuracy story.

Files: `GhostCursor.tsx`, `GhostActionPlayer.tsx`, `src/renderer/src/assets/overlay.css`.

## Front 2 — Motion: RAF spring

Delete the `setTimeout` machine in `useGhostTravel.ts:60-136` and the
`transition: transform 550ms ease-out` in `GhostActionPlayer.tsx:82`. Replace with a
small `requestAnimationFrame` spring integrator.

- Position springs toward target (stiffness ~170, damping ~26 — critically damped,
  framer-ish defaults). Arrival = velocity and distance both under a `restDelta`.
- Phases collapse to `spawning → traveling → arrived → action`. No reset timers, no races.
- Trail: make it velocity-based (length ∝ speed) or drop it — spring overshoot already
  reads as alive. The current static 6px offset (`GhostActionPlayer.tsx:68-72`) goes.
- **Keep the `loop:true` path** for `TargetPreviewGhost`. Either keep the same hook
  signature with a spring inside, or split into `useGhostSpring` (one-shot) + a thin
  loop wrapper. The preview ghost must still cycle.

Files: `useGhostTravel.ts` (rewrite), `GhostActionPlayer.tsx` (consume spring values).

## Front 3 — Accuracy: confidence-gated hybrid

Three-stage resolve in `liveTargetResolver.ts`, escalating only when needed.

1. **AX fast-path (existing).** Run `pickBestElement`. If top score ≥ HIGH (~0.6) **and**
   no near-tie (top two not within ~0.1) → use it. Cheap, instant, no vision call.
2. **Set-of-Mark escalation** when score < HIGH, near-tie, or no match, *and AX has
   candidates*: pass the candidate `{id, label, bounds}` list + a screenshot to
   `analyzeVision()` with a "which numbered element is `<target>`?" prompt → map the
   returned id → bounds → center. This is the 70%→94% grounding pattern.
3. **Direct-coordinate fallback** when AX is empty (canvas/game/zero-AX apps): ask
   vision for `x,y` in viewport-% straight from the screenshot.

- **Reuse:** `analyzeVision` (`vision/index.ts`), `getCachedAxDump`,
  `logicalPointToPercent` (`screenCoordinates.ts`), `vision/json.ts` for parsing,
  `mockVisionProvider` for tests. New: a Set-of-Mark prompt in `vision/prompts.ts` +
  a tiny parser.
- **Cache** the vision result per `(pid, target, ax-hash)` for the existing
  `CACHE_TTL_MS` window so the loop doesn't re-call every cycle.
- **Surface confidence to the cursor:** resolving = amber pulsing halo behind the pill,
  locked = solid purple. The user sees it think, then commit.

### Safety — do not simplify this away

Specter **auto-executes** clicks (`session/replayAuto.ts`, `replaySafety.ts`,
`CLINICAL_SAFETY_FILTER`) against real apps including a clinical EHR. A wrong coordinate
is a wrong click on someone's chart. So the confidence gate is a trust boundary, not
cosmetics:

- Below a confidence floor, **show, don't click** — the cursor points and waits for
  confirmation instead of auto-executing.
- Keep the existing clinical keyword gate; the confidence gate stacks on top of it.

Files: `liveTargetResolver.ts`, new `src/main/automation/visionGrounding.ts`,
`vision/prompts.ts`, and the auto-exec confidence check in `session/replayAuto.ts`.

---

## Phased build (several days)

| Day | Ship | Risk |
| --- | --- | --- |
| 1 | Intent pill + unified label + RAF spring. Pure renderer, demo-able immediately. | Low |
| 2 | Always-on vision Set-of-Mark via `analyzeVision` + prompt + parser. | Med |
| 3 | Gate it (AX fast-path + escalation), confidence states, auto-exec safety gate, coordinate fallback. | Med |
| 4 | Edges: screen-edge pill flip, multi-monitor coords, duplicate labels. Tests via `mockVisionProvider`. | Low |

Day 1 stands alone as a demo even if 2-4 slip.

## Risks / edge cases

- **Shared hook** — preserve `TargetPreviewGhost`'s `loop:true` path.
- **Multi-monitor** — vision returns viewport-%, must round-trip through
  `logicalPointToPercent`; verify on a second display.
- **Vision latency** (~0.5-1.5s) — the resolving state hides it; cache prevents repeats.
- **Set-of-Mark rendering** — candidate bounds must be in screenshot-pixel space; reuse
  `screenCoordinates`.
- **Duplicate labels** — the exact case AX-only fails and SoM fixes; keep a test for it.

## The assignment (do this first)

Before building, **measure your real baseline.** Add a throwaway dev log to
`resolveLiveTarget` that records, for ~10 real summons across 3 different apps: the AX
top score, the matched label, and whether it was actually right. 30 minutes. It tells you
(a) your true accuracy today, and (b) where the HIGH threshold and confidence floor
should sit — so the gate is data-driven, not a guessed 0.6. You can't tune a gate you
haven't measured.

## Sources

- OmniParser / Set-of-Mark grounding (70.5%→93.8%): https://github.com/microsoft/OmniParser , https://arxiv.org/html/2408.00203v1
- Screen2AX (vision-based macOS accessibility): https://arxiv.org/html/2507.16704v1
- Motion: ease-out 200-500ms, spring physics — https://www.nngroup.com/articles/animation-duration/ , https://magicui.design/docs/components/smooth-cursor

# Ghost action-cursor — start-to-end integration plan

Companion to [ghost-cursor-redesign.md](./ghost-cursor-redesign.md). This is the
executable plan: contracts, sequencing, file-by-file work, tests, rollout, risks.

Status: REVISED after adversarial review (2 independent red-teams). **§10 is the plan of
record** — it supersedes conflicting earlier sections, especially the safety gate in §2 /
§4-Phase-3 / §8, the "reuse vision/json.ts" claim in §5, and the spring rewrite in §4-Phase-1.

---

## 0. Load-bearing correction (from research)

**Never ask a general VLM for raw pixel coordinates.** General multimodal models
(GPT-4o, Qwen2-VL, and by class Llama-4 Maverick) score **<2% on ScreenSpot-Pro**
when asked to regress xy from a screenshot. The existing `target_detection` prompt in
`vision/prompts.ts` does exactly this ("target center coordinates in screenshot pixels")
— it is the weak path, not the model to copy.

**Set-of-Mark (SoM) is the fix.** Give the model a screenshot with numbered candidate
boxes and ask "which number is `<target>`". That is multiple-choice, which general VLMs
handle well — the same move took GPT-4o from 0.8% → 39.6% via OmniParser. So:

> The grounding pipeline reduces every hard case to "pick a numbered box."
> Maverick emits an **ID**, never a pixel. We resolve the ID → that candidate's known
> bbox → viewport %.

Consequence for the zero-AX case (no accessibility tree = no boxes to number): see §6.
It is the one case SoM can't cover for free, and it drives a real decision.

---

## 1. Target architecture

Single resolve pipeline, escalating only when cheaper stages are unsure.

```
summon(targetLabel, action)
  │
  ├─ 1. AX dump (getCachedAxDump)            ── existing, ~0–400ms
  │
  ├─ 2. AX fuzzy match (pickBestElement)     ── existing, instant
  │      topScore ≥ HIGH and no near-tie? ──► RESOLVE (source: "ax")
  │
  ├─ 3. SoM escalation (AX has candidates)   ── vision, ~0.5–1.5s
  │      render numbered screenshot over top-N AX boxes
  │      analyzeVision(task:"target_detection", som prompt) → returns chosen id
  │      map id → AX bbox → logicalPointToPercent ──► RESOLVE (source: "som")
  │
  ├─ 4. Coordinate fallback (no AX at all)   ── vision, unreliable
  │      existing pixel path, capped confidence ──► SUGGEST only (never auto-exec)
  │
  └─ 5. no resolve ──► cursor shows "can't find it", asks user
```

Confidence rides through every stage and gates two things downstream: the **cursor
visual state** (resolving/locked/unsure) and **auto-execute** (`replayAuto`).

---

## 2. Contracts (the seams to nail first)

Lock these before writing bodies — they're where parallel tracks meet.

**Extend `LiveResolvedTarget`** (`liveTargetResolver.ts`):
```ts
export interface LiveResolvedTarget {
  viewportX: number;
  viewportY: number;
  label: string;
  action: "click" | "type" | "scroll" | "wait";
  confidence: number;
  source: "ax" | "som" | "coord";   // new — provenance
  resolving?: boolean;              // new — true while a vision call is in flight
}
```

**SoM request** — reuse `analyzeVision(VisionAnalyzeInput)` as-is. New SoM prompt
builder lives beside `buildVisionPrompt`. Input carries the numbered screenshot
(`imageBase64`) and the candidate legend in `userPrompt`. Output: parse the chosen
index out of `VisionAnalyzeResult` (reuse `vision/json.ts`). We do **not** trust the
model's bbox/center — we use the AX bbox of the chosen index.

**Auto-exec gate** (`session/replayAuto.ts`): a click only auto-executes when
`confidence ≥ AUTO_EXEC_FLOOR` **and** the existing clinical keyword gate passes.
Below floor → render the cursor on target, wait for explicit confirm.

**Renderer contract** (`GhostActionPlayer.tsx`): consumes `{viewportX, viewportY,
confidence, resolving, action, label}`. Knows nothing about how the target resolved.

---

## 3. Workstreams

Three tracks. R has no backend dependency and ships first. G and P share the contracts
in §2, so write those interfaces day 1 and both sides code against them.

- **Track R — renderer** (`GhostCursor.tsx`, `GhostActionPlayer.tsx`, `useGhostTravel.ts`, `overlay.css`)
- **Track G — grounding** (`liveTargetResolver.ts`, new `automation/visionGrounding.ts`, `session/replayAuto.ts`)
- **Track P — prompt/parse** (`vision/prompts.ts` SoM builder, `vision/json.ts` index parse, SoM screenshot renderer)

---

## 4. Phased plan

### Phase 0 — contracts + baseline (½ day)
- Write the §2 type/interface changes; both tracks compile against them.
- Ship the design-doc **assignment**: instrument `resolveLiveTarget` to log AX top-score
  + correctness across ~10 real summons / 3 apps. Sets `HIGH` and `AUTO_EXEC_FLOOR` from
  data, not a guess.

### Phase 1 — visual + motion, Track R (1 day) — *demo-able alone*
- **Intent pill** in `GhostCursor.tsx`: arrow + traveling pill. Pill is the single label
  channel; delete the separate type-caption block (`GhostActionPlayer.tsx:126-150`) and
  route `type` text through the pill. Pill auto-flips at right/bottom screen edges.
- **Spring** in `useGhostTravel.ts`: replace the `setTimeout` machine (`:60-136`) and the
  `transform 550ms ease-out` (`GhostActionPlayer.tsx:82`) with a RAF spring
  (stiffness ~170, damping ~26; arrival on velocity+distance < restDelta). Drop the
  static 6px trail or make it velocity-scaled.
- **Keep `loop:true`** for `TargetPreviewGhost` — preserve hook signature or split into
  `useGhostSpring` + a loop wrapper.
- Confidence tint wired but defaulted to "high" until Track G lands.
- Acceptance: cursor glides with no pops; pill never clips; preview ghost still cycles;
  `npm run build` clean.

### Phase 2 — SoM grounding, Tracks G+P (1 day)
- `automation/visionGrounding.ts`: take top-N AX candidates, render a numbered overlay
  onto the active-display screenshot (reuse `captureMetaForActiveDisplay`), build the SoM
  prompt, call `analyzeVision`, parse the chosen index, map index → AX bbox →
  `logicalPointToPercent`. Return `{viewportX, viewportY, confidence, source:"som"}`.
- Wire as **always-on** first (simplest): if AX match isn't a clear winner, call SoM.
- Cache by `(pid, targetLabel, axHash)` for `CACHE_TTL_MS` so the render loop doesn't
  re-call.
- Acceptance: duplicate-label case that AX-only gets wrong now resolves right; mock
  provider drives a deterministic test.

### Phase 3 — gate + safety + states, Track G (1 day)
- Confidence-gated hybrid: AX fast-path when `topScore ≥ HIGH` and no near-tie (top two
  within ~0.1); else SoM; else coord-suggest; else ask.
- `resolving` flag flips cursor to amber pulsing state during the vision call; locks to
  solid purple on resolve.
- **Auto-exec floor** in `replayAuto.ts`. Below floor = show-don't-click. This is the
  trust boundary — a wrong coord auto-clicks a real EHR chart.
- Acceptance: low-confidence summon does **not** auto-click; confidence states visible.

### Phase 4 — edges + tests + rollout (1 day)
- Multi-monitor: verify viewport-% round-trips on a second display (`screenCoordinates`
  active-display logic).
- Zero-AX decision from §6 implemented (coord-suggest gated, or OmniParser if chosen).
- Tests: `mockVisionProvider` SoM path, duplicate-label golden, confidence-gate unit,
  spring-settles assertion. Extend `AGENTS.md` verification block.
- Flag + kill switch (§7).

---

## 5. SoM prompt design

New builder (sketch — not final copy):
- Reuse the JSON-only discipline from `buildVisionPrompt`.
- Body: "The screenshot has numbered boxes. Each number is a candidate UI element.
  Return JSON `{ "chosenIndex": <int>, "confidence": 0–1, "reasoning": "..." }`. Choose
  the box that best matches the target `<label>`. If none match, return
  `chosenIndex: -1`."
- Pass the legend (index → AX label/role) in `userPrompt` so the model has text + pixels.
- Parse via `vision/json.ts`; ignore any coordinates the model emits.

---

## 6. The zero-AX decision (needs a call)

No AX tree → nothing to number → SoM can't run for free. Options:

| Option | What | Cost | Auto-click safe? |
| --- | --- | --- | --- |
| A. Degrade to suggest | existing pixel path, cap confidence, never auto-exec | none | yes (manual confirm) |
| B. Local detector | run OmniParser v2 to synthesize boxes, then SoM | +local model, setup, latency | yes |
| C. Dedicated grounder | call a UGround/GUI-Actor endpoint for coords | +infra/API | partial |

Recommendation: **A now, B if zero-AX apps turn out to matter in the demo.** "Works for
anything" is satisfied honestly — known apps get SoM precision, exotic zero-AX apps get a
safe suggestion the user confirms, never a <2% blind auto-click. B is the real fix and
slots in behind the same SoM interface, so picking A now doesn't burn the bridge.

---

## 7. Rollout

- Env flag `GHOST_GROUNDING = ax | som | hybrid` (default `hybrid`). `ax` = today's
  behavior = instant rollback.
- `AUTO_EXEC_FLOOR` and `HIGH` as env-tunable constants (seeded from Phase 0 data).
- Kill switch: `som`/`coord` stages no-op when `VISION_PROVIDER` unset or vision errors —
  fall through to AX result or "ask", never block the cursor.

---

## 8. Risks

- **Maverick can't do raw coords** — mitigated by SoM-only design; coord path is suggest-
  only. The single most important property of this plan.
- **Vision latency on summon (~0.5–1.5s)** — resolving state hides it; cache prevents
  repeats; AX fast-path skips it entirely for easy targets.
- **Shared `useGhostTravel`** — preserve `TargetPreviewGhost` loop path.
- **Coordinate frames** — SoM-over-AX uses logical coords + `logicalPointToPercent`
  (avoids capture-frame math). Only the coord-suggest path touches
  `normalizeCapturedTargetToViewportPercent`; that path doesn't auto-click anyway.
- **SoM overlay rendering** — numbers must land on the right AX boxes in screenshot-pixel
  space; reuse `captureMetaForActiveDisplay.scaleFactor`. Test on a Retina display.
- **Auto-exec regression** — the floor must default safe; a bug that lets low-confidence
  through is the worst outcome. Unit-test the gate explicitly.

## 9. Open questions for adversarial review

1. Is the confidence-gated hybrid worth it, or is always-on SoM simpler for equal demo
   quality? (latency vs branching complexity)
2. Zero-AX: ship A (suggest-only) or invest in B (OmniParser) now?
3. Is extending `LiveResolvedTarget` the right seam, or should SoM be a separate resolver
   the caller composes?
4. SoM-over-AX-only: are AX bounds reliable enough that we never need the model's bbox?
5. Is Maverick even the right model for the ID-pick, or does the Anthropic fallback
   provider ground better for this task?

---

## 10. Adversarial review outcome — plan of record

Two independent red-teams reviewed against the live code. Verdict: **not best as written.**
Core mechanic (intent pill + SoM ID-pick) holds; several load-bearing claims failed against
the code. These corrections supersede the conflicting earlier sections.

### Must-fix (correctness / safety)

1. **Safety gate was bolted to the wrong resolver.** `resolveLiveTarget` /
   `LiveResolvedTarget` only positions the *visual* ghost (callers: `OverlayApp.tsx`,
   `ultra:converse`, `live:resolveTarget`). Auto-clicks run through `replayAutoExecute` →
   `resolveTarget` (`targetResolver.ts`), using pre-recorded `step.x/y` and
   `targetConfidence ?? 0.8`, gating at `<0.65`. The two pipelines never meet, so an
   `AUTO_EXEC_FLOOR` on `LiveResolvedTarget.confidence` gates nothing — and a gate already
   exists in `targetResolver.ts`. FIX: enforce at the click path — kill the `?? 0.8`
   default (`replayAuto.ts:106`), parameterize the `<0.65` gate (`targetResolver.ts:88`),
   and when SoM grounds a click, feed that confidence into `resolveTarget`. Drop the
   replayAuto floor keyed on the ghost path.
2. **"Reuse `vision/json.ts`" is false.** `validateVisionOutput` builds a fixed shape and
   drops unknown fields → `chosenIndex` is lost. Write a small dedicated index parser. Cap
   candidates at ~12 and/or raise `max_tokens` so verbose `reasoning` can't truncate the
   JSON into `PROVIDER_PARSE_ERROR`. Parse failure → graceful "ask", never throw.
3. **AX bbox → screenshot-pixel mapping does not exist** and is the highest-bug-density
   piece (`normalizeCapturedTargetToViewportPercent` goes the opposite direction). First-
   class Phase-2 work: subtract `displayBounds.{x,y}`, multiply by `scaleFactor` (Retina
   2×), handle multi-display origin. A mislabeled box → confident wrong pick.

### Missing (will bite in implementation)

4. **Screenshot capture is new cost.** `liveTargetResolver` captures nothing today; SoM
   adds a full-res `desktopCapturer` grab + encode + overlay render per escalating summon.
   The ~0.5–1.5s budget ignored it. Capture only on escalation; cache image with result.
5. **Cold AX dump (800ms) → null ≠ zero-AX app.** Don't route a timeout into the coord
   fallback; retry / warm the dump.
6. **`MockVisionProvider` returns a hardcoded element** — can't emit `chosenIndex`.
   Extending it is a prerequisite task for the duplicate-label test, not a free outcome.

### Cut (over-built for the goal)

7. **Don't rewrite the shared `useGhostTravel` spring.** Shared with `TargetPreviewGhost`
   (`loop:true`) and race-scarred. Swap the existing tween's easing to a cubic-bezier
   (90% of the feel) or add a *new* `useGhostSpring` used only by `GhostActionPlayer`.
   Leave the shared hook alone.
8. **Cut the confidence-gated hybrid branching for the demo.** Ship always-on SoM (cached,
   behind `GHOST_GROUNDING`). Add gating later only if latency hurts.
9. **Cut the §6 OmniParser ceremony** to one line: zero-AX → coord-suggest, never auto-click.

### Add (cheaper than vision)

10. **Try AX-geometry disambiguation before SoM.** Role filter + `actionable` + spatial
    nearest-to-context (the `pickBestElement` actionable tiebreak is half of this) likely
    resolves most duplicate-label cases with zero latency / model / parse risk. SoM then
    only earns its keep for icon-only / empty-AX-label controls. Phase 0 must measure
    "would geometry alone have disambiguated," not just AX score.

### Renderer nits

11. Pill must offset so it never covers the target mid-screen (not only the edge-flip).
    Confidence can't be color-only (amber/purple) — add a shape / opacity / text cue for
    colorblind users.

### Revised build order (leanest that hits the demo)

- **P1:** intent pill + unified label (delete type-caption, route through pill) + CSS
  cubic-bezier easing on the existing tween. No shared-hook rewrite. Demo-able alone.
- **P2:** AX-geometry disambiguation first; always-on SoM (new `visionGrounding.ts`, new
  index parser, new AX→pixel mapper, extended mock) only when AX labels are empty/tied.
  Screenshot on escalation, cached. Behind `GHOST_GROUNDING`.
- **P3:** real safety — fix the gate in `targetResolver.ts` / `replayAuto.ts`, feed
  grounding confidence into the click path. Distinguish cold-AX-timeout from zero-AX.
- Skip: spring rewrite, gating branch, OmniParser.

**Bottom line:** directionally right, but as written it would ship an inert safety gate and
two false "reuse" assumptions, with effort spent on a spring + gating the demo won't show.
The order above is smaller, correct, and demo-first.

### Models (resolves §9 Q5, available NVIDIA NIM free endpoints)

Only VLMs matter; the rest of the catalog (video, autonomous-driving, safety, TTS) is noise.

- **Primary SoM ID-pick: `qwen3.5-122b-a10b`.** The Qwen-VL family is the backbone of the
  SOTA GUI grounders (UGround-V1, GUI-Actor) — better at UI grounding than the current
  `llama-4-maverick-17b-128e-instruct`. 10B active = fast/cheap. Use `qwen3.5-397b-a17b`
  only if A/B shows it's worth the latency.
- **Fallback: `llama-4-maverick…` (current) and/or the existing `anthropic` provider.**
  Both are fine at the multiple-choice ID-pick; keep one wired via `getVisionProvider`.
- **Zero-AX box detection: `paligemma`** — native `detect`/bounding-box output, so the
  §6 zero-AX case can synthesize candidate boxes without a local OmniParser. Free
  endpoint. Caveat: small/old, validate on a dense UI before trusting; if weak, fall back
  to §6 option A (coord-suggest, never auto-click).
- **Rule unchanged:** never request raw pixel coords from any of them. qwen3.5 picks an ID,
  paligemma emits boxes — both dodge the <2% coordinate-regression failure.
- **Swap cost:** model-id string in `nvidiaVisionProvider` + prompt; the provider
  abstraction already supports it. Phase-0 turns into an A/B: Maverick vs qwen3.5-122b on
  the logged real summons.

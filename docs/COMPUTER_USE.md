# Computer use — target resolution & clicks

How Specter turns a natural-language label (“Click Save”) into a real mouse click at the right pixel.

## Pipeline (happy path)

```text
User step label
  → resolveLiveTarget()          [liveTargetResolver.ts]
  → viewport % (x, y)            [screenCoordinates.ts]
  → Ghost cursor overlay         [GhostCursor.tsx, GhostActionPlayer.tsx]
  → clickRealMouse()             [cursor.ts]
  → nut-js move + click + drift guard
```

Auto-replay uses the same viewport % path via `clickStepViewport()` in `replayAuto.ts`.

## Resolution stack (in order)

| Stage | Source tag | File | When used |
| --- | --- | --- | --- |
| AX label match | `ax` | `liveTargetResolver.ts` | High-confidence token match on accessibility tree |
| AX geometry tie-break | `ax-geom` | same | Near-tie among top AX candidates (within 0.1 score) |
| Set-of-Mark vision | `som` | `visionGrounding.ts` | Hybrid/SOM mode when AX is ambiguous |
| Direct coord vision | `coord` | `visionGrounding.ts` | Zero AX elements; capped confidence (suggest-only) |

**Mode:** `GHOST_GROUNDING=ax|som|hybrid` (default `hybrid`).

**Thresholds:** `GHOST_GROUNDING_HIGH` (default 0.6) for AX fast-path; near-tie delta 0.1.

### Semantic matching rules

- Whole-token match only — `"Edit"` does not match `"Credit"` (`isWholeToken`).
- Fast-path blocked when **any** candidate is within 0.1 of the top score (`hasNearTie`).
- Empty visible AX set → label not resolvable (no fake 50,50 fallback).

### AX index namespaces

- **`axDumpIndex`** — index from macOS AX dump (`axDump.ts`). Used for live refresh before click.
- **`element_index`** (openara) — different namespace; skipped when `axDumpIndex` is set.

Before click, `cursor.ts` re-dumps AX and refreshes coords via `viewportPercentFromAxDumpIndex()`.

## Coordinate frames

| Frame | Range | Used by |
| --- | --- | --- |
| Logical screen px | device pixels | AX dump bboxes, capture meta |
| Viewport % | 0–100 | Ghost overlay CSS `left`/`top`, stored step `x`/`y` |
| Capture-normalized | 0–1 or 0–100 | Remapped via `normalizePracticeWindowTargetToViewportPercent` |

Rules in `screenCoordinates.ts`:

- `logicalPointToPercent` → `null` if point outside active display.
- `displayId` on capture meta pins multi-monitor mapping.
- Remap from capture → viewport skipped for `manual` or already-normalized viewport coords.

Ghost UI uses **percentage positioning** (`left`/`top` %), not `vw`/`vh`, so coords match the overlay’s coordinate space.

## Click execution

`cursor.ts`:

- Maps viewport % → screen pixels via active display bounds.
- nut-js: refuse click if cursor drifted **>12px** after move.
- `expectedDisplayId` from `step.captureMeta.displayId` when present.

`replayAuto.ts`:

- Peekaboo adapter gets **screen pixels** via `mapPercentToScreen()` (not raw %).
- Playwright stub falls back to real `clickRealMouse` when DOM executor unavailable.
- AX replay path uses stored viewport `step.x`/`step.y`, not raw bbox corners.

## Key types & wiring

`session/types.ts` — steps carry `axDumpIndex`, `axDumpApp`, `displayId`.

`screener.ts` — vision targets include AX dump indices; `pixelToPercent*` returns `null` when dimensions missing.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `GHOST_GROUNDING` | `hybrid` | `ax` / `som` / `hybrid` |
| `GHOST_GROUNDING_HIGH` | `0.6` | AX fast-path confidence floor |
| `GHOSTWIKI_WIKI_ROOT` | `./demo-workflows/.../wiki` | Wiki root for memories |

See [VISION_PROVIDERS.md](./VISION_PROVIDERS.md) for vision API keys.

## Tests

```bash
npm run test:adversarial-cursor   # substring collisions, near-ties, empty AX
npm run test:targetResolver
npm run test:live-ghost
npm run test:specter              # broad regression incl. file presence
```

Details: [TESTING.md](./TESTING.md).

## Intentionally deferred

- Post-click screenshot verify loop
- Full Playwright DOM executor (viewport click fallback today)
- OmniParser integration

## Source map

| Concern | Primary file |
| --- | --- |
| Live target resolution | `src/main/automation/liveTargetResolver.ts` |
| Vision / SoM | `src/main/automation/visionGrounding.ts` |
| Coordinates | `src/main/screenCoordinates.ts` |
| Real mouse | `src/main/cursor.ts` |
| Auto replay | `src/main/session/replayAuto.ts` |
| Ghost overlay | `src/renderer/overlay/GhostActionPlayer.tsx` |
| Adversarial tests | `scripts/test-adversarial-cursor.ts` |

# Specter Journey — Progression + Sync

Design: [`12f-specter-mon-playable.html`](concepts/12f-specter-mon-playable.html). Rules: [`GAME_LOGIC.md`](GAME_LOGIC.md).

## Loop

```
Mac session → seen/learning → learned → (optional) publish/caught → Hub dex
Hub trainer battle → learned (not caught) → PAL reinforces
```

## JourneyState

| Where | Storage | Notes |
|-------|---------|-------|
| Hub browser | `localStorage` key `specter-journey-state` | Optimistic dex; merged on sync |
| Hub server | `.data/journey/{userId}.json` (dev) · `/tmp/specter-hub-data/journey/` (Vercel) | Authoritative merge target |
| Mac | No local journey file | `hubSync.pushJourneySnapshot()` derives entries from `LearningGraph` + wiki slugs, POSTs summaries only |
| HTML mockup | Same keys as Hub browser | Playable prototype only |

Shared types: [`src/journey.ts`](../src/journey.ts) (mirrored in `Main/src/shared/journey.ts`).

| Field | Purpose |
|-------|---------|
| `entries[skillId]` | Per-skill state, moves learned, origin |
| `party` | Max 6 equipped skills |
| `badges` | Apps where boss workflow completed |
| `version` | Merge counter |

## API (implemented)

| Route | Role |
|-------|------|
| `GET /api/skills` | Seed ∪ published skills |
| `GET/POST /api/journey?userId=` | Progress sync (file-backed store, not KV) |
| `POST /api/publish` | Catch = publish skill body — server `publishGate()` (learned + origin; seed skills need `mac`) |
| `POST /api/tavus-conversation` | PAL iframe URL (`skillId`, `movesLearned`, `userId`) |

## Sync flow

1. **Mac → Hub:** `POST /api/journey` on session save when `SKILLS_HUB_URL` set
2. **Hub ↔ server:** On load, focus, 30s poll, and every local dex edit — fetch, merge, push
3. **Publish:** `POST /api/publish` writes skill JSON to `.data/published/` and marks entry `caught`

## Mac files

- `~/Library/Application Support/Specter/{app}.json` — learning graph (sync source)
- `skill-profiles.json` — trainer rank
- GhostWiki — skill content; publish source for `journey:publish` IPC

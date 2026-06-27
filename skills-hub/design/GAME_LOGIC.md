# Specter Mon — Game Logic

## State machine

```
unseen → seen → learning → learned → caught (self only)
                              └→ equipped (party slot)
```

Trainer skills (`author !== your userId`): max `learned`, never `caught`.

## Encounters

| Type | Trigger | Catch allowed? |
|------|---------|----------------|
| Wild | Mac session / tall grass | Yes, after `learned` |
| Trainer | Hub skill by another author | No — learn only |
| Gym boss | Workflow with 11 steps | Learn + badge; catch if yours |
| Preset | Seeded Luma route | Same as wild |

## Abilities

- **Move** = one workflow step; unlocked when `movesLearned > index`
- **Ability** = full skill when `learned | caught | equipped`
- **Party** = up to 6 equipped skill IDs for quick PAL

## Sync invariants

1. Catch requires `movesLearned >= totalMoves` OR `state === learned`
2. Publish rejects unlearned / trainer / hijacked seed skills server-side (`publishGate` in `journey.ts` + `api/publish.ts`)
3. Journey merge: per-entry newer `updatedAt`; max `state` / `movesLearned`; Mac `origin` wins over `hub_trainer`
4. Sync payload = `JourneyEntry` summaries only (no screenshots or raw session steps)
5. Hub waits for initial sync (`syncReady`) before marking skills seen — avoids overwriting Mac origin
6. Mac pushes on session save; Hub fetch+merge+push on mount, tab focus, 30s, and every local edit

## Adversarial mitigations

Enforced in `journey.ts`, API routes, UI, and `scripts/verify-hub.cjs` + `scripts/adversarial-stress.cjs`:

| # | Attack | Mitigation |
|---|--------|------------|
| 1 | Catch without learning | `canCatch()` + publish API require learned / all moves |
| 2 | Catch someone else's skill | `publishGate()` blocks trainer origin + seed skills without `mac` origin |
| 3 | Sync conflict | Per-`skillId` merge on `updatedAt`; monotonic `version` |
| 4 | Stale catalog | `/api/skills` merges seed ∪ published; PAL reads latest on conversation create |
| 5 | Privacy leak | Mac push sends journey summaries only; full body on publish only |
| 9 | ID mismatch | Slugs shared with `seed-skills-json.cjs` / wiki filenames |

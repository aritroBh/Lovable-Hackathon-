# Specter Skills Hub — Design

Chosen direction: **playable Pokémon-style GBC journey** (`12f-specter-mon-playable.html`).

**Shipped React slice:** [`../src/pages/Browse.tsx`](../src/pages/Browse.tsx) (route map HUD) + [`SkillDetail.tsx`](../src/pages/SkillDetail.tsx) (battle / PAL / catch). [`JourneyContext.tsx`](../src/JourneyContext.tsx) handles sync (`syncReady`, poll on focus).

Verify: `npm run verify:e2e` from `skills-hub/`.

## Open

```bash
open design/index.html
# or directly:
open design/concepts/12f-specter-mon-playable.html
```

**Controls:** WASD / arrows to walk · Enter to confirm · Tall grass = wild encounter · Red/Purple/Blue tiles = Center / Gym / Lab

## Metaphor

| Game | Product |
|------|---------|
| Battle (FIGHT) | Learn workflow steps on Mac |
| Catch (Poké Ball) | Publish skill to Hub |
| Train (Pokémon Center) | PAL / Tavus reinforces |
| Pokédex | Browse `skills.json` |

Full mapping: [`PROGRESSION_SPEC.md`](PROGRESSION_SPEC.md)

## Screenshot

```bash
cd design && bun run export:pngs
```

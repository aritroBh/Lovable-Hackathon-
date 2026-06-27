# Specter Skills Hub

Public **Skills Hub** for the Tavus × Lovable hackathon — a Pokémon-style **Specter Mon** journey where battle = learn, catch = publish, PAL = train.

Mac learning stays in [Specter Electron](../README.md). This app is the publish + teach surface with **bidirectional journey sync**.

## Quick start

```bash
npm install
npm run seed:skills    # from ../demo-workflows/event-recap/wiki/
npm run start          # API :3001 + UI :5173 (one terminal)
npm run verify:e2e     # typecheck, build, hub + adversarial stress tests
```

## Game loop

| UI | Route | Product |
|----|-------|---------|
| Route map | `/` (`Browse.tsx`) | Encounter cards per skill |
| Battle | `/skill/:id` (`SkillDetail.tsx`) | Learn moves → PAL → CATCH |
| Playable mockup | `design/concepts/12f-specter-mon-playable.html` | Full GBC overworld prototype |

Rules: [`design/GAME_LOGIC.md`](./design/GAME_LOGIC.md) · Sync: [`design/PROGRESSION_SPEC.md`](./design/PROGRESSION_SPEC.md)

## API (file-backed — `.data/` dev, `/tmp/specter-hub-data` prod)

| Route | Method | Role |
|-------|--------|------|
| `/api/skills` | GET | Seed ∪ published catalog |
| `/api/journey` | GET/POST | `JourneyState` sync (merge on `updatedAt`) |
| `/api/publish` | POST | Catch — `publishGate()` server-side |
| `/api/tavus-conversation` | POST | PAL iframe URL |

Mac bridge: [`../src/main/hubSync.ts`](../src/main/hubSync.ts) (`pushJourneySnapshot`, `publishSkillToHub`, `journey:publish` IPC).

## Mac ↔ Hub sync

Set in Specter `Main/.env`:

```bash
SKILLS_HUB_URL=http://127.0.0.1:3001   # or production Vercel URL
SPECTER_USER_ID=<same UUID as Hub localStorage specter-user-id>
```

Hub polls + pushes on mount, tab focus, 30s, and every local dex edit. Mac pushes after `autoCompileToWiki`.

## Verify

```bash
npm run verify:e2e      # full pipeline (recommended)
npm run verify:stress   # adversarial publish/merge probes only
npm run verify:hub      # smoke (API must be on :3001)
```

## Deploy

- **Vercel:** `vercel --prod` from this folder; set `TAVUS_*` env vars
- **Lovable:** see [LOVABLE_PROMPT.md](./LOVABLE_PROMPT.md)

## Docs

- [Tavus PAL setup](./docs/TAVUS_PAL_SETUP.md)
- [Hackathon integration](../docs/HACKATHON_INTEGRATION.md)
- [Demo runbook](../docs/HACKATHON_DEMO_RUNBOOK.md)
- [Submit checklist](./SUBMIT.md)

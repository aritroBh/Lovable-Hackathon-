# Specter Skills Hub

Public **Skills Hub** for the Tavus × Lovable hackathon — a Pokémon-style **Specter Mon** journey where battle = learn, catch = publish, PAL = train.

Mac learning stays in [Specter Electron](../README.md). This app is the publish + teach surface with **bidirectional journey sync**.

## Quick start

```bash
npm install
npm run seed:skills    # from ../demo-workflows/event-recap/wiki/
npm run start          # API :3001 + UI :5173 (one terminal)
npm run verify:e2e     # full gate — see Verify below
```

## Game loop

| UI | Route | Product |
|----|-------|---------|
| Route map | `/` (`Browse.tsx`) | Encounter cards · HUD: PARTY / LEARNED / CAUGHT / **BADGES** |
| Battle | `/skill/:id` (`SkillDetail.tsx`) | Learn moves → PAL → CATCH · gym win awards badge |
| Playable mockup | `design/concepts/12f-specter-mon-playable.html` | Full GBC overworld prototype (not in React yet) |

Rules: [`design/GAME_LOGIC.md`](./design/GAME_LOGIC.md) · Sync: [`design/PROGRESSION_SPEC.md`](./design/PROGRESSION_SPEC.md)

## API (file-backed — `.data/` dev, `/tmp/specter-hub-data` prod)

| Route | Method | Role |
|-------|--------|------|
| `/api/skills` | GET | Seed ∪ published catalog |
| `/api/journey` | GET/POST | `JourneyState` sync (merge on `updatedAt`) |
| `/api/publish` | POST | Catch — `publishGate()` server-side |
| `/api/tavus-conversation` | POST | PAL iframe URL |
| `/api/tavus-health` | GET | Env probe (`palReady`) — no conversation created |

Mac bridge: [`../src/main/hubSync.ts`](../src/main/hubSync.ts) · skill recording: **Cmd+Shift+R** → `publishBuiltSkillToHub`.

## Mac ↔ Hub sync

```bash
# Specter Main/.env
SKILLS_HUB_URL=http://127.0.0.1:3001   # or production Vercel URL
SPECTER_USER_ID=<same UUID as Hub localStorage specter-user-id>
```

```bash
node scripts/sync-user-id.cjs   # print Mac vs Hub userId; fix mismatches before demo
```

Hub polls + pushes on mount, tab focus, 30s, and every local dex edit. Browse refetches catalog every 5s + on tab focus. Mac pushes after session compile and on **Cmd+Shift+R** stop.

## Verify

```bash
npm run verify:e2e         # recommended — full pipeline
npm run verify:stress      # adversarial publish/merge probes only
npm run verify:hub         # API smoke (needs :3001)
npm run verify:prod-smoke  # post-deploy — SKILLS_HUB_PROD_URL=https://... npm run verify:prod-smoke
```

`verify:e2e` runs: typecheck → build → publish-gate → verify-hub → **e2e-mac-publish** → **e2e-matrix** → adversarial-stress.

From repo root: `bash scripts/hackathon-prep.sh` runs Specter tests + `verify:e2e`.

## Deploy

- **Vercel:** `npm run deploy` from this folder; set `TAVUS_*` env vars
- **Prod smoke:** run immediately after deploy (Vercel `/tmp` store is ephemeral on cold start)
- **Lovable:** see [LOVABLE_PROMPT.md](./LOVABLE_PROMPT.md)

## Docs

- [Tavus PAL setup](./docs/TAVUS_PAL_SETUP.md)
- [Hackathon integration](../docs/HACKATHON_INTEGRATION.md)
- [Demo runbook](../docs/HACKATHON_DEMO_RUNBOOK.md)
- [Setup pipeline](../docs/SETUP_PIPELINE.md)
- [Submit checklist](./SUBMIT.md)

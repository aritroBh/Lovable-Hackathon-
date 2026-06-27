# Hackathon submission

## Before 4pm PT

1. Run smoke: `cd skills-hub && npm run verify:e2e`
2. Specter smoke: `cd .. && npm run test:specter`
3. Deploy: `npm run deploy` (or Lovable → publish → copy URL)
4. Set **Vercel/Lovable secrets**: `TAVUS_API_KEY`, `TAVUS_PERSONA_ID`, `TAVUS_REPLICA_ID`
5. Production smoke on **live URL** (not localhost):
   - Browse → 4 skills, HUD shows party/learned/caught
   - `/skill/workflow-event-recap-session-1` → learn moves → **TRAIN with PAL** → Tavus iframe
   - Mac sync (optional): set `SPECTER_USER_ID` = Hub `specter-user-id` → session on Mac → dex updates on Hub refresh
6. Submit at https://hack.tavuslabs.org/
   - **URL:** production URL below (async judges)
   - **Title:** Specter Skills Hub
   - **One-liner:** Specter learns skills on your laptop; catch to publish; any PAL teaches them

## Pre-submit checklist

- [ ] `npm run verify:e2e` passes (includes adversarial stress + mac publish + e2e matrix)
- [ ] Prod browse + PAL iframe (run smoke immediately after deploy — Vercel `/tmp` store is ephemeral on cold start)
- [ ] `SKILLS_HUB_URL` filled below (for Mac demo sync)
- [ ] `node scripts/sync-user-id.cjs` — Mac `SPECTER_USER_ID` matches Hub `specter-user-id`

## URLs

| Audience | URL |
|----------|-----|
| In-room laptop demo | `http://127.0.0.1:5173` (`npm run start` in skills-hub) |
| Hackathon submission | production URL only |

```bash
cd skills-hub
cp .env.example .env   # local PAL test
npm run deploy           # → paste URL below
```

```
SKILLS_HUB_URL=
```

## Laptop demo (separate from submission URL)

[`../docs/HACKATHON_DEMO_RUNBOOK.md`](../docs/HACKATHON_DEMO_RUNBOOK.md)

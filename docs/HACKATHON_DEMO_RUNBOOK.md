# Hackathon Demo Runbook — Laptop-first (3 min)

Specter × Tavus × Lovable. **Lead with Mac.** Cap with Skills Hub URL.

Full launch/troubleshooting: [`DEMO_RUNBOOK.md`](../DEMO_RUNBOOK.md)

## Morning checklist

- [ ] Launch from **Terminal.app** (not IDE)
- [ ] `cd "/Users/aritro/Downloads/Loveable Hackathon/Main"`
- [ ] Kill orphans: `pkill -f "electron-vite dev"; pkill -f "MacOS/Electron ."; kill $(lsof -ti :8765) 2>/dev/null`
- [ ] `npm run dev` → wait for `All required permissions granted`
- [ ] Smoke: `npm run test:specter` and `curl -s http://127.0.0.1:8765/health`
- [ ] Skills Hub: `cd skills-hub && npm run start` (or prod URL bookmarked)
- [ ] `.env` has `ANTHROPIC_API_KEY`, `SKILLS_HUB_URL`, `SPECTER_USER_ID` (match Hub localStorage `specter-user-id`)
- [ ] Lovable/Vercel secrets set for Tavus (`TAVUS_API_KEY`, `TAVUS_PERSONA_ID`)
- [ ] `cd skills-hub && npm run verify:e2e` once before doors

## Hotkeys (quick ref)

| Keys | Action |
|------|--------|
| Double-tap **Shift** | Summon / dismiss overlay |
| **Cmd+Shift+M** | Memory dashboard |
| Double-tap **Shift** again | Dismiss overlay before clicking dashboard |

## 3-minute script

| Sec | Where | Action |
|-----|-------|--------|
| 0–20 | Mac | Double-shift → Specter appears, input focused |
| 20–50 | Mac | Type: `what do you remember about the Luma event workflow?` → grounded reply |
| 50–80 | Mac | Type: `walk me through creating an event` → ghost cursor, one guided click |
| 80–100 | Mac | Double-shift dismiss → **Cmd+Shift+M** → show memories + skill progress |
| 100–130 | Browser | Skills Hub route map → **RECAPORDON** gym → learn moves → **TRAIN with PAL** |
| 130–150 | Mac optional | Complete session on Mac → Hub dex updates on refresh (matching `SPECTER_USER_ID`) |
| 150–180 | Both | *"Specter learns on your Mac. Catch publishes. PAL teaches anyone."* |

## Laptop → hub bridge line

> "This workflow lived on my Mac first — the full skill publishes when I catch it. Dex progress syncs so the PAL picks up where I left off."

Show matching skill in dashboard (**Cmd+Shift+M**), then **Workflow: event-recap-session-1** on Skills Hub.

## Fallbacks

| Failure | Do instead |
|---------|------------|
| Tavus iframe fails | Skills Hub browse + laptop demo only |
| Lovable URL down | Extend laptop: Memory panel → **Run Winning Demo** loop |
| Overlay won't summon | Relaunch from Terminal; check Screen Recording |
| Memory offline | `kill $(lsof -ti :8765)` → relaunch Specter |

## Do not demo on stage

- Mic / Whisper (no `OPENAI_API_KEY`)
- Peekaboo full auto-click
- Dashboard clicks while overlay is up
- Clinical window (Cmd+Shift+K) unless asked

## Submit (before 4pm PT)

1. Copy published Skills Hub URL
2. https://hack.tavuslabs.org/ → submit project + short demo note
3. See [`skills-hub/SUBMIT.md`](../skills-hub/SUBMIT.md)

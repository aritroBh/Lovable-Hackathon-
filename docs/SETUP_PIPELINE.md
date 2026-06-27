# Specter setup & pipeline

One-page guide: install → configure → verify → demo.

## Architecture

```mermaid
flowchart TB
  subgraph mac [Mac — Specter Electron]
    Overlay[Overlay: Ghost + Chat/Voice]
    Sidecar[Python memory :8765]
    HubProxy[tavusHub.ts → SKILLS_HUB_URL]
  end

  subgraph hub [Skills Hub — Vercel or local :3001/:5173]
    API[api/tavus-conversation]
    Journey[/api/journey]
  end

  subgraph external [External APIs]
    Claude[Anthropic Claude]
    OpenAI[OpenAI Whisper/TTS]
    EL[ElevenLabs TTS]
    NV[NVIDIA Vision]
    Tavus[Tavus CVI]
  end

  Overlay --> Claude
  Overlay --> OpenAI
  Overlay --> EL
  Overlay --> NV
  Overlay --> Sidecar
  HubProxy --> API
  API --> Tavus
  Overlay --> Journey
```

**Rule:** Tavus keys live **only** in Skills Hub secrets (`skills-hub/.env` or Vercel). Mac never sees `TAVUS_API_KEY`.

---

## 1. Install (once)

```bash
cd Main

# Node (Electron app + tests)
npm install

# Python memory sidecar (GhostWiki)
python3 -m venv .venv
.venv/bin/pip install -r memory_service/requirements.txt

# Skills Hub
cd skills-hub && npm install && cd ..
```

The Electron app auto-uses `Main/.venv/bin/python` when present.

---

## 2. Configure

### `Main/.env` (copy from `.env.example`)

| Variable | Required | Notes |
|----------|----------|-------|
| `ANTHROPIC_API_KEY` | **Yes** | Claude chat + tutoring |
| `OPENAI_API_KEY` | For mic | Whisper; typed chat works without |
| `ELEVENLABS_API_KEY` | Optional | Natural TTS; falls back to macOS `say` |
| `NVIDIA_API_KEY` | For vision | Model: `meta/llama-4-maverick-17b-128e-instruct` (default in `.env.example`) |
| `SKILLS_HUB_URL` | **Yes** for Tavus/sync | Local: `http://127.0.0.1:3001` · Prod: your Vercel URL |
| `SPECTER_USER_ID` | **Yes for dex sync** | Must match Hub browser `localStorage.specter-user-id` — run `node skills-hub/scripts/sync-user-id.cjs` |

### `skills-hub/.env` (copy from `skills-hub/.env.example`)

| Variable | Required | Notes |
|----------|----------|-------|
| `TAVUS_API_KEY` | **Yes** | [platform.tavus.io](https://platform.tavus.io) |
| `TAVUS_PERSONA_ID` | **Yes** | PAL from PALmaker |
| `TAVUS_REPLICA_ID` | **Yes** | Prebuilt face (e.g. stock replica) — **no photo upload needed** |

Photo upload / custom replica training is **optional** and takes ~3h. Skip it for hackathon demos.

---

## 3. Run

**Terminal 1 — Skills Hub:**
```bash
cd skills-hub && npm run start
# API http://127.0.0.1:3001 · UI http://127.0.0.1:5173
```

**Terminal 2 — Specter (from Terminal.app, not IDE):**
```bash
cd Main && npm run dev
# Grant Screen Recording + Accessibility when prompted
```

---

## 4. Verify (stress gate)

```bash
cd Main

# Full automated gate (~2 min)
bash scripts/hackathon-prep.sh

# Or individually:
npm run test:specter          # 396+ invariant checks
cd skills-hub && npm run verify:e2e   # Hub build + mac publish + matrix + adversarial
cd skills-hub && node scripts/sync-user-id.cjs
curl -s http://127.0.0.1:8765/health   # after npm run dev — memory sidecar

# Code index (after structural changes)
graphify build .
```

```bash
cd skills-hub && node scripts/sync-user-id.cjs
# Copy Hub specter-user-id → Main/.env SPECTER_USER_ID → restart Specter
```

**Pass criteria:** all commands exit 0; memory health returns `"status":"ok"`.

---

## 5. Demo paths

| Path | How |
|------|-----|
| **Mac tutor** | Summon overlay → Chat/Voice → Ghost mascot teaches on screen |
| **Skill record** | **Cmd+Shift+R** → actions → **Cmd+Shift+R** → auto-publish to Hub |
| **Tavus PAL (browser)** | http://127.0.0.1:5173 → skill → **TRAIN PAL** |
| **Tavus PAL (overlay)** | Auto **Face** when PAL ready → click **James circle** → Talk (Vite overlay :5174) |
| **Tavus E2E** | `npm run test:tavus` from repo root |
| **Memory / Luma recap** | Memory panel or Cmd+Shift+M dashboard |

---

## 6. Deploy Skills Hub

```bash
cd skills-hub
# Set TAVUS_* in Vercel/Lovable secrets (same three vars)
npm run deploy   # or Lovable GitHub sync
```

Then set `SKILLS_HUB_URL=https://your-app.vercel.app` in `Main/.env` and run prod smoke:

```bash
cd skills-hub
SKILLS_HUB_PROD_URL=https://your-app.vercel.app npm run verify:prod-smoke
```

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Chat: "API key not configured" | `ANTHROPIC_API_KEY` in `Main/.env` |
| Memory panel offline | Run `python3 -m venv .venv && .venv/bin/pip install -r memory_service/requirements.txt`; restart app |
| PAL 503 Missing Tavus env | Fill `skills-hub/.env`; restart `npm run start` |
| PAL 503 concurrent conversations | End PAL (overlay circle or leave Center); `POST /api/tavus-conversation/end`; or `npm run test:tavus` |
| Mac dex not syncing to Hub | Run `node skills-hub/scripts/sync-user-id.cjs`; set matching `SPECTER_USER_ID` |
| Overlay won't summon | Launch from Terminal.app; grant Screen Recording |

See also: [HACKATHON_DEMO_RUNBOOK.md](HACKATHON_DEMO_RUNBOOK.md), [HACKATHON_INTEGRATION.md](HACKATHON_INTEGRATION.md), [skills-hub/docs/TAVUS_PAL_SETUP.md](../skills-hub/docs/TAVUS_PAL_SETUP.md).

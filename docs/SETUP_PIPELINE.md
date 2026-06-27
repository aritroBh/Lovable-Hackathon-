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
| `SPECTER_USER_ID` | Optional | Match Hub browser `localStorage.specter-user-id` for dex sync |

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
npm run test:specter          # 395+ invariant checks
npm run verify:e2e            # Skills Hub build + adversarial + Tavus probe
curl -s http://127.0.0.1:8765/health   # after npm run dev — memory sidecar

# Code index (optional, before big refactors)
graphify build .
```

**Pass criteria:** all commands exit 0; memory health returns `"status":"ok"`.

---

## 5. Demo paths

| Path | How |
|------|-----|
| **Mac tutor** | Summon overlay → Chat/Voice → Ghost mascot teaches on screen |
| **Tavus PAL (browser)** | http://127.0.0.1:5173 → skill → **TRAIN with PAL** |
| **Tavus PAL (overlay)** | Mode bar → **Face** → **Talk** (uses stock `TAVUS_REPLICA_ID`) |
| **Memory / Luma recap** | Memory panel or Cmd+Shift+M dashboard |

---

## 6. Deploy Skills Hub

```bash
cd skills-hub
# Set TAVUS_* in Vercel/Lovable secrets (same three vars)
npm run deploy   # or Lovable GitHub sync
```

Then set `SKILLS_HUB_URL=https://your-app.vercel.app` in `Main/.env`.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Chat: "API key not configured" | `ANTHROPIC_API_KEY` in `Main/.env` |
| Memory panel offline | Run `python3 -m venv .venv && .venv/bin/pip install -r memory_service/requirements.txt`; restart app |
| PAL 503 Missing Tavus env | Fill `skills-hub/.env`; restart `npm run start` |
| PAL 503 concurrent conversations | End stale Tavus rooms in dashboard; wait ~1 min |
| Mac dex not syncing to Hub | Set matching `SPECTER_USER_ID` |
| Overlay won't summon | Launch from Terminal.app; grant Screen Recording |

See also: [HACKATHON_DEMO_RUNBOOK.md](HACKATHON_DEMO_RUNBOOK.md), [HACKATHON_INTEGRATION.md](HACKATHON_INTEGRATION.md), [skills-hub/docs/TAVUS_PAL_SETUP.md](../skills-hub/docs/TAVUS_PAL_SETUP.md).

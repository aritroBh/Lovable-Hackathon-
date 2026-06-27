# Specter × Tavus × Lovable — Hackathon Integration

**Setup pipeline:** [SETUP_PIPELINE.md](SETUP_PIPELINE.md) — install, env, verify, demo.

Tavus × Lovable hackathon, June 27 2026. Dual-primary ship: **Specter on your Mac** (live demo) + **Skills Hub URL** (submission).

## One line

Specter learns skills on your laptop. Lovable hosts the public Skills Hub. Tavus is Specter's human face when teaching a skill.

## Architecture

```
Mac (Specter Electron)          Skills Hub (Lovable / Vercel)     Tavus CVI
────────────────────────        ─────────────────────────────     ─────────
screen + GhostWiki       ──►    browse / skill detail      ──►   PAL video
autoCompileToWiki              POST /api/tavus-conversation       memory_stores
pushJourneySnapshot            GET/POST /api/journey              movesLearned context
journey:publish IPC            POST /api/publish (catch)
Cmd+Shift+M dashboard          iframe embed
```

**Memory split**

| Layer | Role |
|-------|------|
| GhostWiki (local markdown) | Skill *content* — what to teach |
| Tavus `memory_stores` | Remembers *you* across PAL calls |
| `JourneyState` (Hub browser + server) | Progress dex — seen / learned / caught / party |
| Mac `LearningGraph` | Session source; `hubSync` builds journey snapshots (no local `journey-state.json`) |
| File store (`.data/` dev, `/tmp/specter-hub-data` prod) | Journey + published skills on Vercel (`api/lib/store.ts`) |

**Sync (ponytail — no WebSockets)**

1. Mac pushes `POST /api/journey` after `autoCompileToWiki` / session save (`pushJourneySnapshot`)
2. Hub merges on mount, tab focus, and every 30s: `GET /api/journey` → merge → `POST /api/journey` (`JourneyProvider` / `syncJourney`)
3. Hub also POSTs after every local dex change (`persist` in `JourneyContext`)
4. Per-entry merge: newer `updatedAt` wins; higher `state` / `movesLearned` kept; Mac `origin` preserved on conflict
5. Catch = `POST /api/publish` — server `publishGate()` in `src/journey.ts` (learned + `mac`/`hub_self` origin; seed skills need `mac`)

**Security:** Client cannot forge catch — API reads stored journey only. Tests: `scripts/adversarial-stress.cjs`.

**userId:** Hub assigns `specter-user-id` in localStorage. Mac defaults to `mac-local` unless `SPECTER_USER_ID` matches — set both for Mac→Hub dex sync in demo.

**IPC:** `journey:publish` → `publishSkillToHub()` (pushes mac learned entry, then publish).

## Hackathon resources

- Hack HQ: https://hack.tavuslabs.org/
- Cookbook: https://www.tavus.io/post/hackathon-cookbook
- Tavus doc index: https://docs.tavus.io/llms.txt
- Lovable: https://lovable.dev/

## Tavus API (minimum surface)

| Task | Doc |
|------|-----|
| Auth (`x-api-key`) | https://docs.tavus.io/api-reference/authentication.md |
| Create PAL | https://docs.tavus.io/api-reference/pals/create-pal.md |
| Create conversation | https://docs.tavus.io/api-reference/conversations/create-conversation.md |
| Embed iframe | https://docs.tavus.io/sections/integrations/embedding-cvi |
| CVI quickstart | https://docs.tavus.io/sections/conversational-video-interface/quickstart/build-first-app |
| Memories | https://docs.tavus.io/sections/conversational-video-interface/memories |
| Knowledge Base (stretch) | https://docs.tavus.io/sections/conversational-video-interface/knowledge-base |
| PAL Skills registry | https://docs.tavus.io/api-reference/skills/list-skills.md |
| Examples | https://github.com/Tavus-Engineering/tavus-examples |

### Create conversation

```bash
curl -X POST https://tavusapi.com/v2/conversations \
  -H "Content-Type: application/json" \
  -H "x-api-key: $TAVUS_API_KEY" \
  -d '{
    "persona_id": "<PAL_ID>",
    "replica_id": "<REPLICA_ID>",
    "conversation_name": "Specter skill teach",
    "conversational_context": "<skill body, max ~3KB>",
    "custom_greeting": "Hey — ready to walk through this skill?",
    "memory_stores": ["specter-demo"],
    "properties": { "max_call_duration": 300, "language": "english" }
  }'
```

Response includes `conversation_url` — embed in iframe:

```html
<iframe
  src="{conversation_url}"
  allow="camera; microphone; fullscreen; display-capture; autoplay"
  style="width:100%; height:70vh; border:none"
/>
```

**Never** put `TAVUS_API_KEY` in Specter repo or client-side JS. Server route only (see [`skills-hub/api/tavus-conversation.ts`](../skills-hub/api/tavus-conversation.ts)).

## Lovable / Skills Hub

Repo slice: [`skills-hub/`](../skills-hub/)

1. Import into Lovable via GitHub sync **or** deploy to Vercel from `skills-hub/`
2. Set secrets: `TAVUS_API_KEY`, `TAVUS_PERSONA_ID`, `TAVUS_REPLICA_ID`
3. Publish → submit URL at https://hack.tavuslabs.org/

Prompt template: [`skills-hub/LOVABLE_PROMPT.md`](../skills-hub/LOVABLE_PROMPT.md)

PAL setup steps: [`skills-hub/docs/TAVUS_PAL_SETUP.md`](../skills-hub/docs/TAVUS_PAL_SETUP.md)

## Specter (laptop — do not rewrite)

| File | Role |
|------|------|
| [`DEMO_RUNBOOK.md`](../DEMO_RUNBOOK.md) | Launch + hotkeys |
| [`docs/HACKATHON_DEMO_RUNBOOK.md`](HACKATHON_DEMO_RUNBOOK.md) | Laptop-first 3-min script |
| [`demo-workflows/event-recap/wiki/`](../demo-workflows/event-recap/wiki/) | Skill seed source |
| [`src/main/index.ts`](../src/main/index.ts) | `autoCompileToWiki` + `pushJourneySnapshot` on session save |
| [`src/main/hubSync.ts`](../src/main/hubSync.ts) | Mac → Hub journey push + `publishSkillToHub` |
| [`src/shared/journey.ts`](../src/shared/journey.ts) | Shared `JourneyState` types + merge helpers |
| [`src/main/context/proactivePrediction.ts`](../src/main/context/proactivePrediction.ts) | GhostWiki query on summon |
| [`src/main/dashboard.ts`](../src/main/dashboard.ts) | Memory dashboard IPC |

## Environment variables

**Specter** (`Main/.env`):

```bash
ANTHROPIC_API_KEY=...
SPECTER_MODE=ghostwiki
MEMORY_SERVICE_PORT=8765
GHOSTWIKI_WIKI_ROOT=./demo-workflows/event-recap/wiki
SKILLS_HUB_URL=https://your-hub.vercel.app   # local API: http://127.0.0.1:3001 (UI :5173 proxies /api)
SPECTER_USER_ID=<same UUID as Hub localStorage specter-user-id>  # required for sync; omit → mac-local
```

**Skills Hub** (Lovable secrets or Vercel env — not in Specter repo):

```bash
TAVUS_API_KEY=...
TAVUS_PERSONA_ID=...    # PAL / persona id from PALmaker
TAVUS_REPLICA_ID=...    # optional if PAL has default replica
```

## Skills data

- Generated JSON: [`skills-hub/public/skills.json`](../skills-hub/public/skills.json)
- Regenerate: `npm run seed:skills` from `skills-hub/`

Verify (from `skills-hub/`):

```bash
npm run verify:e2e
```

Pipeline: typecheck → build → `publish-gate.mjs` → `verify-hub.cjs` → `e2e-mac-publish.cjs` (Mac auto-publish sim) → `e2e-matrix.cjs` (game loop + tavus-health) → `adversarial-stress.cjs`.

Individual probes:

| Script | Role |
|--------|------|
| `scripts/e2e-mac-publish.cjs` | Journey learned + publish → caught + catalog |
| `scripts/e2e-matrix.cjs` | 4-skill progression, RECAPORDON gym, publish gate |
| `scripts/sync-user-id.cjs` | Mac `SPECTER_USER_ID` ↔ Hub `specter-user-id` |
| `scripts/prod-smoke.cjs` | Post-deploy API + SPA smoke |

## Voice-first agent

- **Primary:** Tavus PAL — Hub **TRAIN with PAL** or Mac overlay **Face → Talk**
- Mac defaults to Tavus face when `GET /api/tavus-health` returns `palReady: true` (`tavusPalAvailable` IPC)
- **Fallback:** local ultra loop — Whisper STT + ElevenLabs/OpenAI/macOS TTS; `speakIfUltra()` skips while PAL iframe is live

## Skill recording (Cmd+Shift+R)

1. **Cmd+Shift+R** — start REC (uiohook captures clicks/types)
2. Perform actions (≥1 click required)
3. **Cmd+Shift+R** — stop → `publishBuiltSkillToHub`: journey `learned` + `/api/publish` → `caught` + catalog entry
4. Hub Browse shows new card within ~5s (poll + cache bust)

Requires `SKILLS_HUB_URL` and matching `SPECTER_USER_ID` for dex sync in your browser.

## Game logic

- Rules: [`skills-hub/design/GAME_LOGIC.md`](../skills-hub/design/GAME_LOGIC.md)
- Playable mockup: [`skills-hub/design/concepts/12f-specter-mon-playable.html`](../skills-hub/design/concepts/12f-specter-mon-playable.html)
- React game: Browse (route map) + SkillDetail (battle / PAL / catch)

## Post-hackathon (explicitly cut today)

- Tavus Knowledge Base document upload pipeline
- GhostWiki → Tavus Skills API attach
- HMAC-signed userId (hackathon uses UUID secrecy)

## Photo → Tavus face (overlay) — optional

**Hackathon demo:** use prebuilt `TAVUS_REPLICA_ID` in Hub secrets — **skip photo upload** (~3h training).

Mac overlay can swap SpecBuddy for a **Tavus CVI iframe** (`Face` toggle in mode bar).

1. User uploads JPG/PNG headshot → `POST /api/tavus-upload` (base64 JSON)
2. Hub starts replica training → `POST /api/tavus-replica` → Tavus `POST /v2/replicas` with `train_image_url` + `voice_name`
3. Training ~3–4h ([docs](https://docs.tavus.io/sections/replica/train-with-an-image)); until ready, conversations use stock `TAVUS_REPLICA_ID`
4. `Talk` → `POST /api/tavus-conversation` with `source: "overlay"` + GhostWiki `memoryContext`
5. Electron IPC proxies Hub routes (`tavusHub.ts`) — `tavusPalAvailable()` probes `GET /api/tavus-health`; `TAVUS_API_KEY` never in renderer

**Dev:** `skills-hub/.data/uploads/` served at `http://127.0.0.1:3001/api/uploads/{file}`. Set `TAVUS_PUBLIC_BASE_URL` if Tavus must reach a tunnel (ngrok) during local replica training.

**Prod:** add Vercel Blob or S3 for publicly reachable `train_image_url` (ponytail: `/tmp` + GET route works on Vercel for same-deploy fetches only).

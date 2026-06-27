# Tavus PAL setup (PALmaker)

Do this once before deploying Skills Hub. Full install/verify pipeline: [`../../docs/SETUP_PIPELINE.md`](../../docs/SETUP_PIPELINE.md).

## 1. Credits and keys

1. Open https://hack.tavuslabs.org/ and claim hackathon credits
2. Sign in to https://platform.tavus.io/ (Developer account)
3. Developer Portal → API Keys → create key → save as `TAVUS_API_KEY`

## 2. Create Specter PAL in PALmaker

1. Open PALmaker from hack HQ or platform
2. Name: **Specter**
3. System prompt (paste):

```
You are Specter — a sidekick PAL that teaches published skills step by step.

You remember the user across sessions. You are warm, direct, and human.
You teach from the skill context provided at conversation start.
Ask before taking action. One step at a time.
When the user returns, pick up where you left off.
```

4. Pick a **prebuilt replica** from the library (do not train a custom face — takes hours)
5. Enable **perception** / webcam if offered (hackathon "PAL sees you")
6. Save → copy **pal_id** (PAL id) → `TAVUS_PERSONA_ID`
7. Copy **face_id** if separate → `TAVUS_REPLICA_ID`

## 3. Test with curl

```bash
export TAVUS_API_KEY=...
export TAVUS_PERSONA_ID=...
export TAVUS_REPLICA_ID=...   # optional

curl -X POST https://tavusapi.com/v2/conversations \
  -H "Content-Type: application/json" \
  -H "x-api-key: $TAVUS_API_KEY" \
  -d "{
    \"pal_id\": \"$TAVUS_PERSONA_ID\",
    \"face_id\": \"$TAVUS_REPLICA_ID\",
    \"conversation_name\": \"Specter test\",
    \"custom_greeting\": \"Hey — I'm Specter. Ready to learn a skill?\",
    \"memory_stores\": [\"specter-demo\"],
    \"properties\": { \"max_call_duration\": 300, \"language\": \"english\" }
  }"
```

Open `conversation_url` from the JSON response in a browser.

## 4. Local dev (Skills Hub)

```bash
cd skills-hub
cp .env.example .env    # fill TAVUS_* — auto-loaded by dev-api-server
npm run start           # API :3001 + UI :5173
```

Open http://127.0.0.1:5173/skill/workflow-event-recap-session-1 → **TRAIN PAL** (battle extras) or Pokémon Center.

Pre-demo gate from repo root: `bash scripts/hackathon-prep.sh`.

**503 "Missing Tavus env"** = keys missing in `.env` or Vercel/Lovable secrets panel.

**503 "maximum concurrent conversations"** = stale Tavus room still open. End PAL (click circle again in overlay, or leave Center screen), or:

```bash
# from repo root — automated Tavus E2E also cleans recent rooms
npm run test:tavus
```

## 5. Add secrets (production)

**Vercel** (Project → Settings → Environment Variables) or **Lovable** secrets panel:

| Variable | Value |
|----------|--------|
| `TAVUS_API_KEY` | from step 1 |
| `TAVUS_PERSONA_ID` | from step 2 |
| `TAVUS_REPLICA_ID` | from step 2 (required unless PAL has a default face) |
| `TAVUS_CALLBACK_URL` | optional webhook |

Never commit these to the Specter repo.

## References

- https://docs.tavus.io/api-reference/conversations/create-conversation.md
- https://docs.tavus.io/sections/conversational-video-interface/memories
- https://www.tavus.io/post/hackathon-cookbook

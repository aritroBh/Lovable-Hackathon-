# Lovable import prompt

Paste into Lovable when creating or extending the Skills Hub. Repo already has a working app in `skills-hub/` — prefer **GitHub sync** or deploy from Vercel.

**Design:** [`design/concepts/12f-specter-mon-playable.html`](./design/concepts/12f-specter-mon-playable.html) — playable Pokémon-style GBC journey. Metaphor: [`design/PROGRESSION_SPEC.md`](./design/PROGRESSION_SPEC.md).

## If starting fresh in Lovable

```
Build "Specter Skills Hub" as a Pokémon Game Boy Color-style skill journey.

Reference mockup: design/concepts/12f-specter-mon-playable.html (playable HTML — match visuals & loop).

Core loop:
- Overworld / route map per app region (start: Luma Region)
- Tall grass = wild skill encounter (UI elements from skills.json)
- Battle screen: FIGHT = learn workflow steps; moves = SkillStep targets
- CATCH (Poké Ball) = publish skill to Hub
- Pokémon Center = TRAIN with PAL (Tavus iframe)
- Pokédex = browse all published skills

Visuals: Press Start 2P + VT323, GBC palette (#9bbc0f, #5880a8 menus), pixel CSS sprites (CREATO, CALENDAW, LUMARA, boss RECAPORDON).

Pages:
1. Home: playable overworld OR skill route map → encounters
2. Battle / skill detail: GBC battle UI, step list as moves, HP = progress through steps
3. Catch flow: ball animation → "Gotcha! Published to Hub"
4. PAL: Tavus embed after battle or from Center

On "Train with PAL" / "Talk to Specter":
- POST /api/tavus-conversation { skillId, movesLearned }
- Embed conversation_url in iframe

Progress sync (already in repo — file store, not KV):
- GET/POST /api/journey?userId= — JourneyState dex (party, learned, caught)
- GET /api/skills — seed ∪ published catalog
- POST /api/publish — catch (requires learned)
- POST /api/tavus-conversation — PAL iframe
- Mac: `SKILLS_HUB_URL` + matching `SPECTER_USER_ID` → `pushJourneySnapshot` on session save

React app today: Browse route map + SkillDetail battle/PAL/catch (not full overworld yet).

Footer: "Skill bodies publish when you catch. Journey progress syncs when Specter and Hub share a userId."

Secrets (server only): TAVUS_API_KEY, TAVUS_PERSONA_ID, TAVUS_REPLICA_ID

Keep existing routes and skills.json shape from the repo.
```

## If syncing this repo

1. Connect Lovable to GitHub repo containing `skills-hub/`
2. Implement from `design/concepts/12f-specter-mon-playable.html` + `PROGRESSION_SPEC.md`
3. Add Tavus secrets per docs/TAVUS_PAL_SETUP.md
4. Publish

## Deploy without Lovable (Vercel)

```bash
cd skills-hub
npm install
npm run build
vercel --prod
```

# Ghost's Memory — the local memory app

Design doc. Not implementation. Builder office-hours session, 2026-06-23.

## One line

An in-app window you open to see what specter remembers about you — your past
conversations, the workflows you ran, the things you worked on, your day — all
stored and served **100% on your machine. Nothing leaves the box.**

## Why now

specter already collects a huge amount of signal and then throws almost all of
it away or hides it in a debug panel. The memory isn't weak — it's buried. This
doc lights it up.

Confirmed in the code (recon, 2026-06-23):

- The memory service (`memory_service`, FastAPI on `:8765`) already stores
  markdown "GhostWiki" pages and full-text-searches them.
- `/wiki/pages` + `/wiki/pages/{slug}` endpoints are **live but nothing calls
  them** (`memory_service/app.py:152`).
- Real tutor sessions **never auto-save** — the wiki only compiles when you
  click a debug button (`src/main/index.ts:1873`).
- When the ghost *does* recall you, it folds the memory into prose and hides the
  source (`src/main/context/proactivePrediction.ts:107`).
- Screens, AX trees, voice, clipboard, app-switches, and mood/flow frames are
  captured and discarded — none of it becomes memory.

### The lane (the eureka)

Rewind.ai — the record-everything category king — abandoned local-first for
cloud + a $99 pendant (now Limitless). The on-device personal-memory throne is
empty. specter is **fully local AND has a ghost character on screen.** Nobody
else has both. "An AI that lives in your machine and remembers you, and nothing
leaves the box" is real, differentiated, and undefended.

## Scope

**In:** an Electron-native "Memory" view inside specter + the backend work to
make it have something real to show.

**Decided approach (office-hours):** Electron-native. Reuse the existing
`src/renderer/dashboard/DashboardApp.tsx` + `listMemories()`; wire it to the
already-running memory service. Memory stays on-device; the in-app window is
the lazier build and the stronger privacy story.

**Hackathon add-on (2026-06-27):** [`skills-hub/`](../skills-hub/) on Lovable is
a **Skills Hub** — public browse/teach for *published* workflows only, not a
memory host. Local GhostWiki remains source of truth on the Mac until the user
chooses to publish. See [`docs/HACKATHON_INTEGRATION.md`](HACKATHON_INTEGRATION.md).

**Out:** cloud sync of private memory, accounts, live laptop→hub publish pipeline
(hackathon uses static seed + narrative bridge).

## Architecture

Three layers. The first two are **foundation** — without them the app is an
empty shell, so they ship regardless of how fancy the UI gets.

### Foundation 1 — Auto-save sessions

Hook session-end → `compileSessionToWiki()` (`src/main/wiki/workflowCompiler.ts:17`)
so every real tutor session persists, the way the demo button does manually today
(`src/main/index.ts:1873`). Steps are already recorded in-memory by
`src/main/session/recorder.ts`; this just flushes them to the wiki on stop.

Gives the app: **past workflows.**

### Foundation 2 — Persist the live signal

Today the context + behavioral trackers hold rich signal in memory and drop it on
session end. Persist it:

- **Conversations** — write each tutor exchange to the store (new
  `conversation-{sessionId}.md` page or rolled into the workflow page).
- **App / day signal** — app-switches and mood/flow frames from
  `src/main/behavioral/tracker.ts` and `src/main/context/contextTracker.ts`.

**Engineering note (do not skip):** behavioral frames fire ~every 70ms. Do NOT
write one markdown file per frame — that explodes the wiki. Append high-frequency
frames to a per-day JSONL (or small sqlite), and at session end summarize to a
single `day-YYYY-MM-DD.md` page for the UI. Markdown is for things a human reads;
raw frames are not that.

Gives the app: **past conversations + things you worked on + a day timeline.**

### The view — reuse DashboardApp

`src/renderer/dashboard/DashboardApp.tsx` already exists with a `listMemories()`
(currently pointed at a different source — reconcile it to the memory service).
Wire it to `/wiki/pages` (list) and `/wiki/pages/{slug}` (read), and give it tabs:

- **Conversations** — past exchanges, newest first, click to expand.
- **Workflows** — the procedures specter learned (the workflow pages).
- **Timeline** — your day: apps, sessions, mood, scrubbable.
- (later) **Corrections** — what you taught it and when.

Data shape is the existing wiki frontmatter — reuse it, don't invent a new one:

```yaml
---
title: string
sourceSessionId: string
timestamp: string        # ISO 8601
confidence: float
tags: string[]
---
# body (markdown)
```

New page types follow the same schema with `tags: ["conversation", app]` /
`["day", date]`.

## Phased build (hackathon-friendly)

| Phase | Ship | Why it's the right order |
| --- | --- | --- |
| **P0** | Wire DashboardApp → `/wiki/pages`. The 4 existing demo pages render in an in-app Memory window. | Instant visible win. Proves the whole spine in ~1 hr. Fixes "I can't see it" immediately. |
| **P1** | Auto-save real sessions (Foundation 1). | Now the app fills with *your* workflows, not demo data. |
| **P2** | Persist conversations (Foundation 2a) → Conversations tab. | The thing you asked for first: "see past conversation pieces." |
| **P3** | Day timeline from behavioral frames (Foundation 2b, JSONL → day page). | "Things you worked on" / your day. |
| **P4** (stretch) | Ghost speaks its memory on summon — surface the recalled page instead of hiding it in prose (`proactivePrediction.ts:107`). Optional: reflection/Cognee consolidation so it gets smarter weekly. | The "it knows me" moment + the "make it learn" direction. |

P0 alone is a demo. Each phase stands on its own.

## Privacy — the whole point

Everything stays in the local `memory_service` + on-disk wiki. No network egress,
no account, no cloud. Say this out loud in the UI ("All on this Mac. Nothing
leaves your computer.") — it's both the humanizing story and the differentiator
vs. the Rewind→cloud pivot. Treat any future sync as an explicit, opt-in,
separate decision.

## Risks / edges

- **Sidecar must be up.** The view depends on `memory_service` running
  (`src/main/memorySidecar.ts:7`). Handle the down/empty state gracefully — an
  empty Memory window should say "nothing yet," not error.
- **`listMemories()` source mismatch.** It currently reads from somewhere other
  than the memory service. Reconcile to one source of truth, or the app shows two
  different "memories."
- **High-frequency frames.** See the engineering note — JSONL/sqlite, not one md
  per frame.
- **Path traversal.** `/wiki/pages/{slug}` is already traversal-protected; keep
  it that way when adding new readers.
- **Perf at scale.** Token-search fallback over many markdown files will slow
  down. Fine for the hackathon; Cognee/vector is the upgrade path if it bites.

## What I noticed

You went straight for the humanizing core ("an AI that lives in your computer"),
not a feature checkbox — that's taste. You also reached for the local/private
framing on instinct, which happens to be the exact open lane in the market. Good
signals: the differentiator and the emotional hook are the same thing here.

## The assignment (do this first)

Ship **P0** and nothing else, today: wire `DashboardApp` to the live
`/wiki/pages` endpoint and open it as a Memory window so the 4 existing demo wiki
pages render. ~1 hour. It turns the invisible memory into something you can
literally see and click — which is the entire problem you started with — and it
de-risks every later phase because the read path is proven. You can't tune a
memory app you can't see yet.

## Sources

- AI agent memory landscape 2026: https://mem0.ai/blog/state-of-ai-agent-memory-2026
- Mem0 / Letta(MemGPT) / local-first OpenMemory + MemPalace: https://vectorize.io/articles/mem0-vs-letta , https://github.com/letta-ai/letta
- Rewind → Limitless (local-first abandoned) + open-source screenpipe: https://rewind.sh/
- Episodic/semantic split + reflection (Reflector→Curator) best practices: https://atlan.com/know/episodic-memory-ai-agents/

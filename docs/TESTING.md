# Testing

Run from repo root (`Main/`).

## Cursor & grounding (run after computer-use changes)

```bash
npm run test:adversarial-cursor
npm run test:targetResolver
npm run test:live-ghost
npm run test:ultra-grounding
```

## Broad regression

```bash
npm run test:specter
```

Checks file presence, IPC wiring, overlay CSS, and many subsystem invariants (~1800 lines).

## Vision & clinical

```bash
npm run test:vision
npm run test:vision:live      # needs API keys
npm run test:clinical
```

## Session & automation adapters

```bash
npm run test:peekabooAdapter
npm run test:planNextStep
npm run test:tutorSession
npm run test:verificationLoop
npm run test:skillProfile
npm run test:foreground-app
```

## Manual QA

- [manual-stress-test-checklist.md](./manual-stress-test-checklist.md)
- [real-product-smoke-test.md](./real-product-smoke-test.md)

## Memory sidecar

```bash
curl -s http://127.0.0.1:8765/health   # after npm run dev
```

See [../memory_service/README.md](../memory_service/README.md).

## Skills Hub (hackathon E2E)

From `skills-hub/`:

```bash
npm run verify:e2e       # full gate
npm run verify:stress    # adversarial only
node scripts/e2e-mac-publish.cjs
node scripts/e2e-matrix.cjs
node scripts/sync-user-id.cjs
```

From repo root:

```bash
bash scripts/hackathon-prep.sh   # test:specter + verify:e2e
npm run test:tavus               # Tavus PAL — API, CSP, overlay persona, Hub TRAIN PAL
npm run verify:ghost-cursor      # ghost cursor stress (optional)
```

Manual paths: [HACKATHON_DEMO_RUNBOOK.md](./HACKATHON_DEMO_RUNBOOK.md) · [manual-stress-test-checklist.md](./manual-stress-test-checklist.md) § I

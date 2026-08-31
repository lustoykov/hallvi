# Application Launch UI storyboard

Interactive planning prototypes for the consolidated [Journey 1: Application Launch](../../docs/user-journeys/01-application-launch.md).

## Canonical Journey 1 UI

Open `http://127.0.0.1:4173/journey-1.html`.

This is the canonical nine-phase UI experiment. Chat with Pi is primary, each phase has exactly one chat, completed phase chats are archived, and the compact Record shows the current variable-size Exit Gate plus decisions recognized from that phase chat. Activity, Changes, and Evidence are one level deeper. Every Gate Check exposes its definition, evidence requirement, human verification destination, Ask Pi, source inspection, and re-verification.

The original 36-state storyboard and its alternative layouts remain available for comparison.

## Run locally

```bash
npm install
npm run dev -- --host 127.0.0.1 --port 4173 --strictPort
```

## Verify

```bash
npm run check:journey
npm run build
npm run test:sites
```

The storyboard controls are prototype-only. They let the workshop inspect every state without pretending those controls belong in the product.

# Application Launch UI storyboard

Interactive planning prototypes for the consolidated [Journey 1: Application Launch](../../docs/user-journeys/01-application-launch.md).

## Canonical Journey 1 UI

Open `http://127.0.0.1:4173/journey-1.html`.

This is the canonical nine-phase UI experiment. Chat with Pi is primary, each phase has exactly one chat, completed phase chats are archived, and the compact Record shows the current variable-size Exit Gate plus decisions recognized from that phase chat. Activity, Changes, and Evidence are one level deeper. Every Gate Check exposes its definition, evidence requirement, human verification destination, Ask Pi, source inspection, and re-verification.

The original 36-state storyboard and its alternative layouts remain available for comparison.

## Alternative Journey 1 layouts

The throwaway alternative UI prototype reuses the same 36 states and exposes three structurally different layouts. Open:

```text
http://127.0.0.1:4173/?prototype=journey-1-alternative&variant=A&state=L6.5
```

- `variant=A`: operation-centered desk with Pi in a dedicated conversation rail;
- `variant=B`: evidence-first operational ledger;
- `variant=C`: spatial launch map with the current gate beside the topology.

Use the floating arrows or the left and right keyboard arrows to compare variants. The scenario selector changes the Journey 1 state without changing the selected layout. Prototype controls appear only in the local development build.

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

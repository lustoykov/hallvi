# Application Launch UI storyboard

Interactive planning prototype for [Journey 01: Launch an application](../../docs/user-journeys/01-application-launch.md).

It contains all 36 source-mapped journey states. Chat with Pi is the primary surface; the application-scoped Operator Record reflects decisions across chats; and every phase exposes a named deliverable with a three-condition Exit Gate.

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

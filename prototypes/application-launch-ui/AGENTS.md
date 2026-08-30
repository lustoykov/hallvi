# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Server Guy prototype decisions

- The selected visual direction is a chat-primary Operator Workspace: application sidebar, persistent launch map, primary Chat with Pi, and a compact structured Operator Record beside it.
- Keep the workspace permanently placed and predictable. Pi may choose what to investigate, propose, execute, or explain, but it must not rearrange navigation, panes, or invent a new screen structure per situation. Use fixed Record, Changes, and Evidence Inspector destinations.
- Compose dynamic operational situations from a small typed presentation grammar inside Chat. Journey 01 currently prototypes seven families: Input / Decision, Review / Proposal, Approval, Operation, Intervention, Outcome, and Agent Handoff.
- Server Guy is for developers who understand code and logs but do not want infrastructure drudgery. Surface concrete PRs, diffs, commands, CI checks, logs, provider receipts, probes, and immutable evidence; do not reduce these to unsupported Pi claims.
- Chat is where collaboration and decisions happen. Pi prose and embedded tool/activity evidence appear there, while recognized decisions and resulting operational state are reflected into the Operator Record with provenance.
- Every launch phase has one named deliverable and a three-condition Exit Gate. Pi's visible intent must be framed as work toward that deliverable, and the primary advance action must not imply completion while a gate condition is unmet.
- Operator Sessions are application-scoped chats. Users can start, switch, archive, and resume them; all sessions contribute durable outcomes to the same Operator Record.
- Keep the default Operator Record minimal: current deliverable, Exit Gate, and decisions from chat only. Show one concise application status in the header; move detailed structured state, provenance, resources, and evidence into the on-demand current-state drawer.
- Every Phase Deliverable, Gate Check, Decision Record, and material fact needs a quiet Review Control Point. It opens progressive detail for plain-language explanation, provenance/source, asking Pi for help, direct engineer or external-agent takeover, and re-verification. Gate results are recomputed from evidence and cannot be manually marked passed.
- Product actions belong in Chat with Pi, not in the Operator Record. Storyboard state IDs and counts are prototype controls and must not appear inside product chrome.
- The launch map must always make the current phase and current mockup state obvious. Default screens should be low-text; detailed evidence is opened on demand.
- Every Journey 01 phase needs multiple inspectable mockup states. The canonical state inventory is `docs/user-journeys/01-application-launch-ui-map.md`.
- UI copy and product behavior must stay aligned with the journey Markdown. Unresolved workshop choices must remain visibly unresolved instead of becoming prototype defaults.
- This is a planning artifact. Do not add backend calls, persistence, provider integrations, or production application logic.

# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Server Guy prototype decisions

- The selected visual direction is a chat-primary Operator Workspace: application sidebar, persistent launch map, primary Chat with Pi, and a compact structured Operator Record beside it.
- Keep the workspace permanently placed and predictable. Pi may choose what to investigate, propose, execute, or explain, but it must not rearrange navigation, panes, or invent a new screen structure per situation. Keep Record, Activity, Changes, and Receipts as direct Inspector tabs. "Receipts" is the UI label for the underlying Evidence Records.
- Compose dynamic operational situations from granular typed primitives inside Chat: desired-state facts, observed facts, computed deltas, Operations, approval boundaries, progress observations, provider receipts, Judgment Points, agent handoffs, Operational Claims, and Evidence References. Input / Decision, Review / Proposal, Approval, Operation, Intervention, Outcome, and Agent Handoff are composition examples, not indivisible smart cards.
- Server Guy is for developers who understand code and logs but do not want infrastructure drudgery. Surface concrete PRs, diffs, commands, CI checks, logs, provider receipts, probes, and immutable evidence; do not reduce these to unsupported Pi claims.
- Treat a supported Application Launch as Launch Reconciliation: compare Application Contract desired state with fresh actual-state observations, compute a dependency-ordered Operation Graph, apply permitted nodes, verify their effects, and recompute. Normal Hetzner, Cloudflare, runtime, Release, and verification nodes should be deterministic. Pi enters at visible Judgment Points where evidence or rules do not determine one valid resolution, and the user may inspect or take over at every node.
- Chat is where collaboration and decisions happen. Pi prose and embedded tool/activity evidence appear there, while recognized decisions and resulting operational state are reflected into the Operator Record with provenance.
- Every launch phase has one named deliverable and a variable-size Exit Gate made of fixed, uniform Gate Checks. Pi's visible intent must be framed as work toward that deliverable, and the primary advance action must not imply completion while any check is unmet.
- Journey 1 has exactly one Operator Session per phase. Passing the Gate archives that chat and opens a fresh next-phase chat seeded from the Operator Record rather than transcript history. Other application conversations exist outside Journey 1.
- A visible New chat action starts a general application conversation. It does not create a second Journey 1 phase session or replace the current one.
- Keep the default Operator Record minimal: lead with the current deliverable, completed-check progress, human-readable Gate Check names, and decisions from chat. Internal references such as `P1.G1` belong only in deeper provenance. Show one concise application status in the header; move detailed structured state, provenance, resources, and evidence into the on-demand current-state drawer.
- Every Phase Deliverable, Gate Check, Decision Record, and material fact needs a quiet Review Control Point. It opens progressive detail for plain-language explanation, provenance/source, asking Pi for help, direct engineer or external-agent takeover, and re-verification. Gate results are recomputed from evidence and cannot be manually marked passed.
- Product actions belong in Chat with Pi, not in the Operator Record. Storyboard state IDs and counts are prototype controls and must not appear inside product chrome.
- Use one compact dark application header. Keep prototype branch controls behind a single clearly labeled prototype menu, and show the current application status only once rather than repeating generic “in progress” labels across stacked bars.
- The launch map must always make the current phase and current mockup state obvious. Default screens should be low-text; detailed evidence is opened on demand.
- Preserve the “Setup only · not live yet” band across phases 5–7 and the threshold before Go live. Render it as one centered group rather than separate decoration under each phase.
- In the Launch Brief, show Approval Mode as an explained three-way choice rather than a dropdown. Data protection, downtime reduction, and cost discipline are Server Guy defaults, not launch preferences the engineer must select; ask only about constraints that genuinely depart from that baseline.
- Use these user-facing phase labels everywhere: Start, Inspect app, Make launch-ready, Review launch plan, Set up server, Connect domain, Configure and protect, Go live, Handoff. Keep Application Contract, Conformance Result, Launch Plan, Host Record, Domain Route, Operational Baseline, Verified Release, and Operations Handoff as the precise deliverable names.
- Every Journey 1 phase needs multiple inspectable mockup states. The canonical state inventory is inside `docs/user-journeys/01-application-launch.md`.
- UI copy and product behavior must stay aligned with the journey Markdown. Unresolved workshop choices must remain visibly unresolved instead of becoming prototype defaults.
- This is a planning artifact. Do not add backend calls, persistence, provider integrations, or production application logic.

# Design QA: Application Launch control points

final result: passed

## Comparison target

- Last accepted simplified UI: `qa/implementation-deliverables-L6.3.jpg`
- Product-state source: `../../docs/user-journeys/01-application-launch-ui-map.md`
- Updated default UI: `qa/implementation-control-links-L6.3.png`
- Control Point detail: `qa/implementation-control-point-L2.2.png`
- Same-state comparison: `qa/comparison-control-links-L6.3.jpg`
- Compared state: `L6.3 · Domain registered elsewhere`
- Focused state: `L2.2 · Application Contract review`
- Browser viewport override: `1309 × 931` CSS px
- Baseline source pixels: `1309 × 931`
- Updated implementation pixels: `1189 × 846` because the in-app browser applies display scaling
- Normalization: the updated implementation was scaled to `1309 × 931` with Lanczos before the `2618 × 931` side-by-side comparison.

The last accepted simplified UI remains authoritative for layout, restrained developer-tool styling, typography, density, and the chat-primary hierarchy. The journey specification is authoritative for the new Control Point behavior.

## Full-view comparison evidence

- Information architecture: the default UI still contains the application sidebar, launch map, primary Chat with Pi, and compact Operator Record. No new persistent dashboard section was introduced.
- Layout and spacing: only quiet `What is this?` and `Review` links were added to existing rows. The composer, current chat action, phase map, and record remain visible at the tested viewport.
- Fonts and typography: Geist and Geist Mono, hierarchy, weights, line heights, and technical labels remain consistent with the accepted source.
- Colors and visual tokens: the existing navy, blue, green, orange, neutral borders, and dimmed drawer backdrop are unchanged. Control links reuse the existing blue action token.
- Image and asset fidelity: the UI contains no source imagery or decorative assets. No placeholder, CSS drawing, inline SVG, or replacement asset was introduced.
- Copy and content: Gate Checks are explicitly described as computed results, Decision Records as revisable choices, and facts as source-attributed values. The UI never offers a manual `mark passed` control.

## Focused-region comparison

`qa/implementation-control-point-L2.2.png` was opened at original size and inspected as the focused control surface. It keeps plain-language explanation first, then current result, source/provenance, evidence, guided Pi help, direct takeover, and re-verification. The full path remains visible without hiding the close control or requiring a second page.

The focused check confirmed:

- `Application Contract` explains what the contract is rather than only showing `2/3 checks passed`;
- the product-definition source expands in place and names the journey document;
- `Ask Pi to handle it` returns the user to the current Operator Session with a concrete request;
- `Take control` reveals the affected repository/configuration source and the return-to-verify path;
- `Re-run verification` reads the current source, reports the refreshed result, and provides no status override;
- the same detail grammar works for a Phase Deliverable, Gate Check, Decision Record, and operational fact.

## Interaction verification

- Opened the Phase Deliverable Control Point from `What is this?`.
- Opened a current Gate Check and verified that it is identified as computed, not as a decision.
- Opened a Decision Record and verified origin, affected scope, revision path, and dependent re-verification.
- Opened `View current state`, then opened an operational fact Control Point from its `Review` link.
- Expanded source/provenance, expanded direct takeover, and completed the simulated re-verification state.
- Used `Ask Pi to handle it`; the drawer closed and the request plus Pi acknowledgement appeared in the current chat without creating a Decision Record.
- Verified `L6.3` after the change: three Gate Checks and two Decision Records each expose a quiet Review path while the Operator Record remains compact.
- Browser warning/error log after the interaction pass: empty.

## Comparison history

1. The accepted simplified source had no direct path from a deliverable, check, decision, or fact to its meaning and underlying source.
2. The first control pass added links and one progressive-disclosure drawer without changing the main workspace hierarchy.
3. Visual review found the current-result badge was being colored from result text; this could make `0/3 checks passed` look positive.
4. The badge now derives color from the result label (`in progress`, `pass`, `current`, or `recorded`).
5. The final same-state comparison shows only the intended links and minor row-width adjustment; no persistent control panel or layout regression was introduced.

## Findings

No actionable P0, P1, or P2 issues remain in the tested desktop states.

## Follow-up polish

- [P3] The prototype simulates opening repository/provider sources rather than integrating a real editor, MCP client, or provider console.
- [P3] The dark storyboard control bar remains prototype-only and should not become Server Guy product chrome.

## Claim-to-evidence verification — L9.1

final result: passed

- Opened `Launch evidence assembled`, then followed the `Verify` link on `Sentinel observation` instead of treating the green `Passed` badge as sufficient proof.
- Confirmed that the Evidence Reference names the observing source, exact observation time, collection method, raw result, artifact identity, parent Operational Claim, and point-in-time scope.
- Expanded the captured artifact and inspected the underlying structured probe result.
- Confirmed that the product-definition source and current evidence are separate controls: the former explains the rule; the latter supports this result.
- Confirmed that the same Observation is directly inspectable from chat activity, the Gate Check's evidence list, and the current-state drawer.
- Confirmed that refresh appends a new Observation and does not offer a manual status override.
- `npm run build` completed successfully after the interaction pass.

No actionable P0, P1, or P2 issues were found in the tested desktop flow. The captured artifact remains simulated prototype data until Journey 01 implementation is connected to real probe and receipt stores.

## Settled Details grammar — L3.1

final result: passed

- Replaced competing `Review`, `Verify`, and `What is this?` entry labels with one quiet `Details` affordance across Phase Deliverables, Gate Checks, Decision Records, operational facts, and activity Observations.
- Opened `Conformance analysis recorded` from chat activity and confirmed the Details surface presents `Ask Pi`, `Read contract or source`, and `Verify with evidence` as separate paths.
- Confirmed the inline explanation explicitly says Pi's answer is not proof or the governing rule.
- Expanded the Journey 01 contract source and confirmed it remains distinct from the current captured Observation.
- Confirmed direct takeover and fresh verification remain available below the comprehension paths.
- `npm run build` completed successfully after the interaction pass.

No actionable P0, P1, or P2 issues were found in the tested desktop flow.

# Design QA — Journey 1 Component Catalog

- Status: passed
- Reference: `/Users/aiwithlyubomir/.codex/generated_images/01a04f0f-98ee-70b0-bb79-2b5167b1139e/exec-f5485f65-30a6-4604-8856-6aa49e4e7c8a.png`
- Implementation: `qa/component-catalog-handoff.png`
- Side-by-side comparison: `qa/component-catalog-comparison.png`
- Comparison state: Agent Handoff with the Changes inspector open
- Captured browser viewport: 1352 × 962; reference was proportionally normalized to the same size for comparison

## Reference comparison

The implementation preserves the selected direction's load-bearing hierarchy: stable application/session rail, application and phase context, chat as the dominant surface, and a fixed Inspector with Record, Changes, and Evidence destinations. The Handoff state exposes pull-request metadata, changed files, CI status, a line-oriented diff, and the remaining environment check without allowing Pi to rearrange the workspace.

The catalog-only family switcher is intentionally outside product chrome. It does not appear in the reference because it is a throwaway prototype control, not a Server Guy product surface.

## Interaction checks

- All seven family controls switch to the correct typed presentation and update the URL.
- Record, Changes, and Evidence tabs switch the fixed Inspector and update the URL.
- Recording the recommended hostname creates a visible Operator Record confirmation and selected state.
- The application launch map updates phase, state, deliverable, and status per presentation family.
- Source, Details, Changes, Evidence, Review, and Take control affordances are semantic buttons.
- Browser console: no errors or warnings.

## Verification history

1. Initial render compiled and matched the fixed-workspace reference at the correct density and hierarchy.
2. Added per-claim Evidence/Diff controls to Outcome and Handoff rows and safe callback defaults.
3. `npm run check:journey`, `npm run build`, and `npm run test:sites` passed.

## Known intentional differences

- The dark top bar is prototype chrome for switching presentation families.
- The catalog uses representative Journey 1 data rather than reproducing a single reference state verbatim.
- Existing source-map coverage remains 36 selectable states; the three `L3.W1–W3` working-environment states are represented through the Handoff family rather than changing the existing journey data in this isolated prototype.

# Design QA — Deterministic Launch Reconciliation

- Status: passed
- Source before this change: `qa/reconciliation-source.png`
- Implementation: `qa/reconciliation-implementation.png`
- Same-viewport comparison: `qa/reconciliation-comparison.png`
- Operation Graph detail: `qa/reconciliation-operation-graph.png`
- Handoff composition detail: `qa/reconciliation-deep-state.png`
- Browser screenshot size: 1164 × 655 pixels for both source and implementation

## Product-model check

- The fixed application rail, launch map, chat-primary workspace, and Record / Changes / Evidence Inspector remain stable.
- The seven top-level examples now compose one granular library rather than each owning a different large smart card.
- Desired Application Contract facts, fresh observed facts, and their computed delta are visibly distinct.
- The selectable Operation Graph exposes eight dependency-ordered nodes: Inspect, Contract, VPS, Domain, Runtime, Release, Verify, and Evidence.
- Normal provider and host nodes are labeled as deterministic rule nodes. Pi appears only at visible Judgment Points, while application-code gaps become bounded external-agent handoffs.
- Selecting a graph node updates the fixed Inspector with its actor, external effect, dependencies, operation detail, developer renderer, and evidence target.
- Provider receipts, commands, diffs, logs, checks, pull requests, and immutable evidence remain directly inspectable instead of being summarized as unsupported Pi claims.

## Interaction verification

- All seven composition examples switch successfully and expose the expected current status and selected graph node.
- Selecting `VPS` changes the Inspector from the hostname Judgment Point to the deterministic compute Operation.
- Recording `Use app.northstar.dev` creates a visible Operator Record event and leaves the plan ready to be recomputed.
- `New` creates an application-scoped Operator Session; archived sessions can be revealed again.
- Approval Mode switches between `Pi Decides`, `Always Ask`, and `Full Autonomy` without changing the fixed layout.
- Record, Changes, and Evidence continue to be stable Inspector destinations.
- Browser console warning/error log after the interaction pass: empty.

## Visible comparison findings

The side-by-side comparison preserves the accepted information hierarchy, typography, density, colors, borders, and technical character. The material visual change is inside Chat and the Inspector: the old decision card is replaced by a reconciliation summary and the Inspector is driven by the selected Operation. At the tested short viewport the Chat surface correctly scrolls; the operation graph and handoff detail were separately inspected at interaction depth.

No actionable P0, P1, or P2 visual or interaction issues remain in the tested desktop states.

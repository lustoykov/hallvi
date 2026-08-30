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

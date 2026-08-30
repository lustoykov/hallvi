# Design QA: Application Launch UI storyboard

final result: passed

## Comparison target

- Visual-language source: `qa/source-option-1-chat-prominent.png`
- Product-state source: `../../docs/user-journeys/01-application-launch-ui-map.md`
- Implementation capture: `qa/implementation-deliverables-L6.3.jpg`
- On-demand state capture: `qa/implementation-current-state-drawer-L6.3.jpg`
- Same-state side-by-side comparison: `qa/comparison-deliverables-L6.3.jpg`
- Representative nine-phase contact sheet: `qa/contact-sheet-phases.jpg`
- State: source Domain Setup compared with `L6.3 · Domain registered elsewhere`
- Browser CSS viewport: `1309 × 931`
- Device pixel ratio: `1.1`
- Source pixels: `1487 × 1058`
- Implementation pixels: `1309 × 931`
- Normalization: source scaled to `1309 × 931`; implementation retained at `1309 × 931`; comparison placed them side by side at `2618 × 931`.

The source remains authoritative for the restrained developer-tool visual language, typography, color, and component anatomy. Its structured-pane-first composition and density were intentionally superseded by user direction: Chat with Pi is primary, the Operator Record contains only the current deliverable, Exit Gate, and recorded decisions, detailed current state is opened on demand, and application chats can be started or archived.

## Full-view comparison evidence

- Information architecture: the implementation gives the conversation the largest working region, keeps a minimal shared Operator Record beside it, adds application-scoped chats in the sidebar, and places the nine-phase map above both. The header exposes one concise application status; detailed current state is one click away.
- Layout and spacing: application sidebar, application header, map, two-surface workspace, composer, and next-action control remain visible at the tested desktop viewport. Content-heavy regions scroll independently.
- Typography: Geist and Geist Mono preserve the source's technical character. Deliverable, gate, provenance, and status labels remain visually subordinate to the chat content.
- Colors: dark navy, restrained blue emphasis, green passing checks, orange current/blocking checks, and orange primary actions remain consistent with the selected direction.
- Copy and content: every representative phase names what Pi is working toward, shows three Exit Gate conditions, and keeps the concise application status separate from on-demand facts and provenance. Storyboard IDs and state counts no longer leak into product chrome.
- Image and asset fidelity: the interface contains no content imagery or decorative illustration. Letter avatars are intentional application identity tokens; no source imagery was replaced with placeholders.

## Focused-region comparison

The normalized comparison and each original-size half were inspected for the dense sidebar, chat header, Phase Deliverable card, Exit Gate rows, and persistent bottom controls. A separate crop was not retained because the original-size implementation already makes those regions readable and the source has no equivalent deliverable or multi-chat component to compare pixel-for-pixel.

The focused check confirmed:

- the active chat, New control, archived count, and selected state remain distinct;
- the map names `Domain Route` and shows `1/3 checks` at `L6.3` without exposing the storyboard state ID;
- Chat with Pi says it is working toward `Domain Route`;
- the Operator Record contains only the same deliverable, three Exit Gate conditions, and chat decisions;
- the header exposes the concise application status and `View current state` opens the authoritative facts and observations;
- the composer and next action remain within the viewport.

## Interaction verification

- Phase and mockup-state selectors navigate the 36 source-mapped states.
- Creating a new chat selects it and provides the same application context.
- A statement in the new chat is reflected in the Operator Record and remains visible after switching chats; a question does not create a record.
- Archiving the active chat moves it to the archived list; an archived chat can be opened and restored.
- `Current position`, `Current structured state`, `What matters now`, and the Operator Record action footer are absent from the default right panel.
- `View current state` opens a drawer containing current facts, provenance, and observations.
- The primary product action is available inside Chat with Pi and advances the storyboard state when its gate permits.
- `L1.3` shows a passed `3/3` Exit Gate and its primary action advances to Phase 2.
- `L6.5` remains visibly waiting at `1/3` rather than implying the Domain Route is complete.
- `View current state` opens the state drawer, and the fixed composer plus Chat with Pi primary action remain visible.

## Comparison history

1. The first selected visual made the structured launch pane primary.
2. User review made Chat with Pi primary and required chat decisions to be reflected into a durable record.
3. The chat-primary pass added the always-visible journey map and fixed viewport overflow that hid persistent controls.
4. User review identified that phase labels did not communicate an outcome or bar for advancement and that chats needed lifecycle controls.
5. This pass adds nine named Phase Deliverables, three-condition Exit Gates, Pi intent tied to the current deliverable, shared Operator Record semantics, and functional new/archive/restore chat behavior.
6. User annotation review found the right panel repeated current position, structured state, situational context, and the primary action even though the map and chat already carried them.
7. The simplified pass removes those four regions, moves the primary action into Chat with Pi, retains one application status in the header, and moves detailed current state behind an explicit on-demand action.
8. The final same-state Domain Setup comparison and nine-phase contact sheet show a consistent hierarchy with no clipped persistent controls.

## Findings

No actionable P0, P1, or P2 issues remain in the tested desktop states.

## Follow-up polish

- [P3] The dark storyboard control bar is intentionally prototype-only and should not become Server Guy product chrome.
- [P3] The three-condition gate grammar is deliberately uniform for workshop comparison. Individual phases may later use specialized compact evidence widgets after their deliverables are approved.

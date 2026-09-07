# A quieter Record and three sidebar-free hypotheses

The current workspace keeps the application, phase, conversation and durable Record. Record now offers a compact section picker, a wider reading mode, and a hide/show control. Hiding it keeps section state and open details mounted; following a saved-record reference opens it again. A different phase gets its own initial section state. Runs and Environment start collapsed with visible summaries. The Environment status still refreshes when the phase Record mounts.

Section summaries use two lines instead of competing for a single truncated row. The outer outline uses separators instead of another layer of cards. Phase 3's detailed progress list sits behind a disclosure; its current purpose, status and actions remain visible. Chat metadata wraps at narrower desktop widths.

Approval operations and execution rules are unchanged. One authoritative action remains in the current-step area. Wider review is a layout choice, not a new permission or approval flow.

## Sidebar-free exploration

User-authorized throwaway branch: `codex/prototype-sidebar-free`.
Run `npm run prototype:sidebar` there. It seeds isolated scratch host records, starts no worker and opens the existing application route with `?variant=A`, `B` or `C`. The three UI variants use in-memory example actions only. The prototype is excluded from production rendering and is not part of this implementation branch.

A is a task desk with full-width review and a bottom conversation drawer. B groups work chronologically, with inline review and conversation. C starts from the application and opens full-page workspaces, with contextual questions available in the review.

Two text-only Fable consultations favored A, with C close behind. Codex agrees this is a useful starting hypothesis; no option has been selected by the user or validated with customer interviews. Fable initially mistook preview for PR rendering; the follow-up corrected it to a locally running application with disposable data. User feedback about a local preview is distinct from publication approval and from production health.

The remaining question is whether people can understand the current state, review the scope, ask why and return to their reading position more easily in one of the alternatives. Do not promote a variant merely because it looks cleaner.

## Verification

778 application tests passed (15 Docker tests excluded from the standard run), 32 desktop browser journeys passed, and TypeScript, lint and production build passed. Browser coverage includes hide/show focus, wider reading, retained section selection, phase navigation, Docker recovery and the existing publication/verification flow. The changed production UI was also captured on the real local review application without submitting any actions. The visible Mac browser was locked; verification used headless Chromium.

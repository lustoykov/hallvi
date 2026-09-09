# Handoff: carry conversation-first into the integration shell

> Archived reference, 9 September 2026. Preserved for evidence and migration; instructions and unchecked lists below are historical, not the current product plan. See [Product](../../../../../PRODUCT.md) and [Roadmap](../../../../../ROADMAP.md).

9 September 2026. For whoever integrates the accepted direction into `.worktrees/self-hosted-shell` (branch `codex/self-hosted-shell`). Source: the exploration worktree `/private/tmp/server-guy-chat-views`, branch `claude/chat-views-exploration`. Read [the comparison](2026-09-09-chat-and-views-exploration.md) for the reasoning and [the design language](../../explore-DESIGN.md) for the visual rules.

**Decision (owner, 9 September):** conversation first. No permanent right panel. Receipts in the chat, one application-level action record shared by chat, views and Overview, quiet marks in navigation, Overview built around condition, attention, recent changes and evidence freshness. View first, pinned split and the floating window are declined.

## Take these, in this order

1. **The action record.** Types in `src/components/server-guy/explore/scenario.ts`: `ApplicationAction`, `ActionState`, `ActionStep`. Make it a durable, application-owned table: id, kind (inspection or change), title, state (proposed, working, inspected, verified, failed), destinations, conversationId, messageId, startedAt, updatedAt, summary, steps, approval (note, inputs, action label), evidence, next, resolvedById. First producer is the existing deployment record: queued and planning are working; awaiting-approval is proposed with the host offer and missing inputs; deploying is working with the events as steps; live is verified with `verifiedAt` and the checks as evidence; failed is failed with the error as the next step. Second producer is the log snapshot as an inspection. Backups come with their increment.
2. **Derivations.** `explore/model.ts`: navigation indicators with precedence working, then waiting, then failed, then changed-since-looked; attention items; recent changes; conversation scope and status; relative time. Use the wall clock in product.
3. **Components.** `explore/receipts.tsx`: `StateChip`, `ActionSteps`, `ApprovalCard`, `DestinationLinks`, `ActionReceipt`. Move them into `src/components/server-guy/` under `sg-` class names. The approval card must wrap the existing deployment approval call (recommendation id, maximum monthly cost, missing inputs); the exploration’s card is a stand-in.
4. **Chat.** `chat-pane.tsx` renders the receipt under the message that started the action, keyed by `messageId`, updating in place. Generalise today’s “Saved from this reply” references (`record-references.ts`) into the same mechanism rather than keeping two. Add reference chips for actions that belong to other conversations (`explore/chat.tsx`).
5. **Shell.** In `operator-shell.tsx` remove the `sg-live-panel` aside (compact overview, second deployment panel, legacy preparation details). When a destination opens, park the chat column (visibility hidden and inert) instead of unmounting it, and show a bar above the destination with “Back to [conversation]”. While an action is working or proposed and the chat is parked, show the work strip in the top bar. `ApplicationNavigation` already accepts optional `indicators` and `chatMarks` in the exploration’s copy of the file; that change is backwards compatible.
6. **Views.** In `application-section-view.tsx` render the activity card and origin line at the top of a destination’s content (`DestinationActivity` in `explore/sections.tsx`). Facts stay confirmed-only. Database and Backups keep their honest placeholders in product until real data exists; the activity card can already show deployment actions on Deployment, Architecture, Database and Variables.
7. **Overview.** `explore/overview.tsx`: condition row, Needs you, Running, Recent changes, Evidence freshness. The legacy Record inspector moves under Deployment or behind a “Preparation record” link. The stale rule is 24 hours since the last verification.
8. **Styles.** From `explore/explore.css` take the receipt, chip, step list, approval, activity, origin, marks, Overview and back-bar rules into `application-shell.css`. Leave behind the toolbar, `.x-drawer`, `.x-pinned`, `.x-float*` and `.x-stage`.
9. **Design language.** Merge `explore/DESIGN.md` into `src/components/server-guy/DESIGN.md` once adopted; its tokens extend the workspace tokens and do not replace them.

## Do not carry over

Options B, C and D, the floating window, the exploration bar, the scenario fixtures, the simulated banners and tags, and the page-route change that removed the prototype import (that was only to build without Codex’s prototype directory).

## Acceptance to add to the browser journeys

- Open a destination from a receipt and come back: same scroll position, same draft.
- A deployment in progress shows a working mark on Deployment and a receipt with steps under the message that started it; verified shows a green mark until Deployment is viewed; failed shows a red mark and a Needs-you item on Overview.
- A second conversation sees the same marks, and views show the originating conversation of another conversation’s action.
- Overview says nothing needs you when nothing does; a verification older than 24 hours turns the condition dot grey and offers a re-verification draft.
- No green before verification, and a proposal never changes a fact.
- Reduced motion disables the pulsing mark.

## Open questions for the owner

- Where automatic work such as a nightly backup reports. The exploration posts a recorded event into the conversation that set the policy. PRODUCT.md makes in-app notifications the durable home. Recommendation: both, with the conversation event referencing the notification.
- Whether “changed since you looked” is per browser (as in the exploration) or per user account. Product should persist it.
- Whether a failed automatic action should open a new conversation when no conversation set it up, or attach to the primary one.

# Conversation and stable views: an exploration

> Archived reference, 9 September 2026. Preserved for evidence and migration; instructions and unchecked lists below are historical, not the current product plan. See [Product](../../../../../PRODUCT.md) and [Roadmap](../../../../../ROADMAP.md).

9 September 2026. Interaction design exploration by Fable, in its own worktree, on top of a snapshot of the accepted application shell. Everything it shows about backups, measurements and time is **simulated and labelled as such**. Nothing here is product behavior, and no host, provider or database was touched.

- Worktree: `/private/tmp/server-guy-chat-views`, branch `claude/chat-views-exploration`, port 3280. Uncommitted.
- URL: `http://127.0.0.1:3280/explore?variant=a&step=0`. The bar at the bottom switches between options A to D and steps through the scenario; `[` and `]` step too. The variant and step live in the URL, so any state can be shared or captured.
- Start: launch configuration `chat-views` in the main checkout’s `.claude/launch.json`, or `npm run dev -- --port 3280` inside the worktree. No database or worker is needed; the route is development-only.
- Captures: `node tests/browser/chat-views-exploration.capture.mjs` writes desktop and 390 px scenes for every option to `tests/results/chat-views-exploration/`.
- Design language of the conversation-first option, for agents building on it: `src/components/server-guy/explore/DESIGN.md` (extends the workspace `DESIGN.md`; sidecar beside it for the live panel).

## Where it started from

The integration tree `.worktrees/self-hosted-shell` at `c7ed574` plus its uncommitted and untracked work was copied into a fresh worktree on the same commit, excluding `.env*`, `.server-guy`, `data`, `node_modules`, `.next`, `tests/results`, `.impeccable`, logs and nested worktrees. Codex’s `src/components/server-guy/prototype/` was excluded and the page route no longer imports it. The integration tree was not modified.

Two small, backwards-compatible additions were made to production components: `ApplicationNavigation` accepts optional per-destination and per-conversation marks, and nothing else in the shell changed. Everything else lives under `src/components/server-guy/explore/` and `src/app/explore/`.

## The one thing every option needs: an application-level action record

Layout was not the first decision. Each option reads the same **per-application action record**, and without it none of them can show anything better than today’s static facts.

An action belongs to the application, not to a chat. It carries: kind (inspection or change), title, state, the destinations it reads or changes, the conversation and message that started it, timestamps, a one-line summary, visible steps while working, an approval request while proposed, evidence once verified, a next step once failed, and a pointer to the later action that resolved a failure.

States and how they look, everywhere they appear:

| State | Meaning | Appearance |
| --- | --- | --- |
| Inspected | Read-only look at the host or data | Grey chip, evidence line, “Read” links |
| Waiting for you (proposed) | Nothing applied; approval or an input is needed | Amber chip, approval card, “not applied” |
| Working | Executing, with steps | Blue chip and pulsing navigation mark, step list |
| Verified | Confirmed by evidence | Green chip, evidence line, “Changed” links |
| Failed | Did not complete | Red chip, failed step, next step |

The same record renders in five places without duplication of logic: as a **receipt** under the message that started it, as an **activity card** above the confirmed facts of the views it touches, in **Overview**’s “Needs you” and “Recent changes”, as a **mark** beside the destination in navigation, and as a mark beside the conversation. A view never shows the desired outcome before it is verified: the Backups facts stay “Not connected” under a “Proposed change · not applied” card until the restore test passes.

**Generated or fixed?** These are fixed components. The agent does not generate UI; it emits the record as data (title, state, steps, inputs it needs, destinations, evidence) and the executor updates the state. This follows the accepted rendering contract in `docs/design/adaptive-agent-experience.md`: proposals and observations are data, trusted components render them. The catalogue in this exploration is small on purpose: state chip, step list, approval card, receipt, activity card, origin line, destination links, reference chip.

## The scenario

Fourteen steps, shared by every option, on a fixed clock so relative times read the same on any day. Two conversations belong to the application at the start; a third appears at step 13.

| Step | What happens | What it tests |
| --- | --- | --- |
| 1 | A second conversation about the same application | Baseline |
| 2 to 4 | “How much disk is the database using?” → measured (simulated 1.9 GB) | Inspection is distinct from change |
| 5 to 6 | “Set up backups” → proposal with an R2 access request | Proposed, not applied; approval with inputs |
| 7 to 8 | Approved → steps run, upload in progress | Progress while browsing elsewhere |
| 9 | Verified: first backup uploaded, restore test passed | Confirmed facts appear with their origin |
| 10 | Two nights later a scheduled upload is rejected (HTTP 403) | Failure that needs the user; last good backup stays visible |
| 11 to 12 | New token → retry → recovered | Return from Overview; history keeps the failure |
| 13 to 14 | Another conversation restores that backup into a scratch database | Same area, different conversation |

The approval buttons work: approving in step 6 or providing a token in step 10 advances the scenario, so the interaction can be tried rather than only stepped.

## The four options

**A · Conversation first.** No side panel. Receipts in the chat carry the state, steps, approval and links; navigation shows a quiet mark on each destination with live or unseen work. Opening a destination shows it full width with a “Back to conversation” bar; the chat stays mounted, so scroll position and draft survive. While a view is open and work is live, the top bar shows a small work strip.

**B · View first.** The destination stays in front; the conversation is a drawer on the right, scoped by chips showing which destinations the conversation touched. The drawer collapses into a tab that still shows the conversation’s live state. The approval card also renders inside the Backups view, so a decision can be made where the change lands.

**C · Pinned split.** The conversation is primary; the user pins one destination beside it from a picker, a receipt link or navigation. Server Guy may suggest a destination (“Server Guy is in Backups · show”) but never changes the pin. The pinned view can be expanded to full width and back.

**D · Floating window.** The owner’s picture-in-picture idea. A small window in the top right shows the destination Server Guy is working in and follows the conversation; it can be held on one view, minimized, or swapped with the chat by clicking it. Opening a destination from navigation makes it the main surface and floats the conversation with its composer. On a phone the window becomes a bar above the composer.

## Same scenario, four answers

| Moment | A · Conversation first | B · View first | C · Pinned split | D · Floating window |
| --- | --- | --- | --- | --- |
| Inspect disk use | Receipt with evidence; “Open Database” | Database in front, drawer explains | Pin Database beside the chat | Window follows to Database |
| Proposal and access | Approval card in the receipt; amber marks on Backups and Database | Approval card in the view and pointer in the drawer | Approval in the chat, proposal card in the pin | Approval in the chat; window shows “not applied” |
| Progress while on Logs | Blue mark on Backups, work strip in the top bar | Drawer tab shows “Working · step 4 of 5” | Suggestion chip: “Server Guy is in Backups” | Window keeps showing Backups over Logs |
| Verified | Green receipt, green marks until looked at; origin line in views | Facts change in place; drawer receipt | Pinned Backups updates in place | Window updates in place |
| Failure | Red mark, receipt with next step, Overview “Needs you” | Activity card in Backups, drawer tab red | Suggestion chip; pin shows the failure | Window shows the failure |
| Return via Overview | One click to the conversation at the message | Overview in front, drawer open | Overview pinned or expanded | Overview main, chat floating |
| Mobile | Unchanged shell | Bottom sheet | Bottom sheet | Bar above the composer |

Judgement against the brief’s criteria, after walking every step in every option:

| Criterion | A | B | C | D |
| --- | --- | --- | --- | --- |
| Reading effort | Low: one surface, receipts summarise | Medium: two surfaces say the same thing | Medium: two surfaces, user chooses | High: three surfaces on desktop |
| Steps to the changed view | 1 (receipt link or mark) | 0 to 1 | 0 once pinned, else 1 | 0 to see, 1 to use |
| Noticing a confirmed change | Marks plus receipt | Facts change silently unless the view is in front | Only if pinned | Only if following |
| Approval handling | In context of the request | Where the change lands, but often the wrong view is in front | In the chat | In the chat, window points back |
| Background work | Marks and work strip | Drawer tab | Suggestion chip | Window |
| Mobile | Works as today | Sheet competes with the view | Sheet competes with the chat | Loses its point; becomes a bar |
| Does a right panel earn its space? | Not needed | Drawer is the product | Only when pinned | Window, not a panel |

## Findings

1. **Conversation first wins, with two borrowed pieces.** The receipts make the conversation self-sufficient, and the navigation marks make consequences visible without visiting each destination. The pieces worth keeping from the others are the activity card above a view’s facts (all options share it) and, from C, the suggestion chip that offers a view but never opens it. The current permanent right panel repeats facts that receipts and views already carry; A removes it without loss.
2. **View first is the wrong default for an agent.** The view in front is rarely the one the next action concerns, so the drawer becomes the real interface and the “first” view becomes decoration. Approving where you look reads well in the Backups view and badly everywhere else.
3. **The pinned split asks the user to manage layout.** It is a good escape hatch for a long investigation, not a default. Everything it offers is reachable from A with one more click.
4. **The floating window is charming and expensive.** It reproduces the right panel’s cost (a third surface) with motion. It works best when Server Guy is in exactly one place, and worst on a phone. The FaceTime swap is a good gesture for opening a view, but A’s receipt link does the same with less on screen.
5. **The owner’s reaction on 9 September** matched this: conversation first, with the shared elements and marks; B rejected, C too many options, D overwhelming in practice.

## What happens with a second conversation

Steps 13 and 14 show it. A new conversation, “Restore a deleted todo”, starts work that touches Database and Backups. Because the record belongs to the application:

- The first conversation does not change. Its receipts are its own; nothing is inserted into it.
- The Database and Backups views show the new action’s card with its origin, “Open in Restore a deleted todo”, above facts that were confirmed from the first conversation with their own origin.
- Navigation marks Database and Backups as working, and marks the new conversation itself, so a user reading the first conversation can see that something is happening and where it comes from.
- The new conversation’s first reply **refers to** the earlier actions with small reference chips (“Verified · Configure nightly backups to Cloudflare R2 · from Database and backups”), which open the other conversation at that message. That is the shared element: one record, referenced from several places, never copied.
- Overview lists all of it in “Recent changes” with the originating conversation on each line.

If two conversations tried to change the same thing at the same time, the record is also the place to notice it: a proposal for Backups while another Backups change is working should be refused by the agent with a reference to the live action. This exploration does not simulate that conflict.

## Overview

The redesigned Overview answers four questions in order: what is running, what needs you, what changed, and how fresh the evidence is. The setup checks and the launch record are gone from it; they belong with Deployment. Evidence freshness is honest about staleness: two days after the deployment’s verification the condition dot turns grey, the row reads “Stale · over 24 h”, and a button drafts a re-verification request in the deployment conversation. Nothing on Overview claims continuous monitoring.

## Honest limits

- All measurements, uploads, restore results, times and agent replies are fixtures. The real product records only the deployment.
- Logs, Architecture, Deployment, Observability, Domains and Variables are the production components fed the recorded deployment. “Refresh logs” in the exploration calls the real API, which fails honestly because there is no database.
- Sending a message is not simulated; drafts are kept per conversation in memory.
- Mobile behaviors are sketches at 390 px, not finished layouts. The architecture canvas scrolls sideways in the compact pin and window.
- No accessibility certification is claimed. Marks carry hidden text and titles; the receipts and cards are plain DOM.

## What conversation-first still needs before it is product work

1. The action record in the backend, with the deployment flow as its first producer: the existing deployment events, approval and verification already map onto it.
2. A rule for automatic work such as nightly backups: in this exploration a failed nightly run posts a recorded event into the conversation that set the policy. In-app notifications from PRODUCT.md would be the durable home; the receipt would reference the notification.
3. Marks that clear when a destination is looked at, per user; archived conversations keep their receipts read-only.
4. Generalising today’s “Saved from this reply” references (`record-references.ts`) into receipts, so the legacy Record and the new views share one mechanism.
5. Removal of the permanent right panel in production and the “Back to conversation” bar on full-width destinations.
6. Overview as above, with the legacy Record reachable from Deployment.

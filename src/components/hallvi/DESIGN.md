---
name: Hallvi conversation-first workspace
description: The quiet application workspace plus one application-level action record that renders as receipts in chat, activity cards in views, marks in navigation and blocks on Overview.
colors:
  ink: "#202838"
  muted: "#687183"
  line: "#e7e9ee"
  surface: "#ffffff"
  navigation-top: "#e9eef9"
  navigation-bottom: "#e1e8f6"
  navigation-groove: "#d2dbee"
  navigation-text: "#344363"
  shade: "rgb(28 52 110)"
  context: "#fafbfc"
  blue: "#285ad8"
  blue-hover: "#2350c4"
  link: "#315bc6"
  selected-bg: "#e8edf7"
  selected-text: "#244d98"
  field-line: "#ccd5e3"
  card-surface: "#fbfcfe"
  working-bg: "#edf3ff"
  working-text: "#2852a6"
  working-line: "#c7d6f5"
  waiting-bg: "#fff4e9"
  waiting-text: "#9a4b10"
  waiting-line: "#ecd6b8"
  waiting-surface: "#fffdfa"
  amber: "#b25a16"
  verified: "#14945f"
  verified-bg: "#eaf8f1"
  verified-text: "#0f7a4e"
  failed: "#a6312b"
  failed-bg: "#fdf1f0"
  failed-line: "#f2d3d0"
  failed-surface: "#fffbfb"
  inspected-bg: "#eef1f6"
  simulated-bg: "#fff8f0"
  simulated-line: "#f0dcc4"
typography:
  title:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 600
    letterSpacing: "-0.025em"
  conversation-title:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 600
  body:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "14px"
    lineHeight: 1.8
  label:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    letterSpacing: "0.04em"
  mono:
    fontFamily: "Geist Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "12px"
  receipt:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "14px"
    lineHeight: 1.6
  chip:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.6
  meta:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "11px"
rounded:
  control: "7px"
  card: "8px"
  container: "12px"
  receipt: "10px"
  pill: "999px"
spacing:
  compact: "12px"
  standard: "16px"
  panel: "24px"
  dashboard: "36px"
  chip: "2px 8px"
components:
  button-primary:
    backgroundColor: "{colors.blue}"
    textColor: "{colors.surface}"
    rounded: "{rounded.card}"
    height: "34px"
    padding: "0 14px"
  button-primary-hover:
    backgroundColor: "{colors.blue-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "0 14px"
  field:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "10px"
  navigation-selected:
    backgroundColor: "{colors.surface}"
    textColor: "#172238"
    rounded: "9px"
    padding: "8px 10px"
  architecture-card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.container}"
    padding: "24px"
  state-chip-working:
    backgroundColor: "{colors.working-bg}"
    textColor: "{colors.working-text}"
    typography: "{typography.chip}"
    rounded: "{rounded.pill}"
    padding: "{spacing.chip}"
  state-chip-waiting:
    backgroundColor: "{colors.waiting-bg}"
    textColor: "{colors.waiting-text}"
    typography: "{typography.chip}"
    rounded: "{rounded.pill}"
    padding: "{spacing.chip}"
  state-chip-inspected:
    backgroundColor: "{colors.inspected-bg}"
    textColor: "{colors.muted}"
    typography: "{typography.chip}"
    rounded: "{rounded.pill}"
    padding: "{spacing.chip}"
  state-chip-verified:
    backgroundColor: "{colors.verified-bg}"
    textColor: "{colors.verified-text}"
    typography: "{typography.chip}"
    rounded: "{rounded.pill}"
    padding: "{spacing.chip}"
  state-chip-failed:
    backgroundColor: "{colors.failed-bg}"
    textColor: "{colors.failed}"
    typography: "{typography.chip}"
    rounded: "{rounded.pill}"
    padding: "{spacing.chip}"
  receipt:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.receipt}"
    rounded: "{rounded.receipt}"
    padding: "12px 14px"
  receipt-waiting:
    backgroundColor: "{colors.waiting-surface}"
  receipt-failed:
    backgroundColor: "{colors.failed-surface}"
  approval-card:
    backgroundColor: "{colors.card-surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.receipt}"
    padding: "12px"
  activity-card:
    backgroundColor: "{colors.card-surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.receipt}"
    padding: "14px 16px"
  destination-link:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.working-text}"
    typography: "{typography.receipt}"
    rounded: "{rounded.pill}"
    padding: "3px 10px"
  destination-link-hover:
    backgroundColor: "{colors.working-bg}"
  navigation-mark:
    size: "7px"
    rounded: "{rounded.pill}"
  simulated-banner:
    backgroundColor: "{colors.simulated-bg}"
    textColor: "{colors.waiting-text}"
    typography: "{typography.meta}"
    rounded: "{rounded.card}"
    padding: "9px 12px"
  attention-item:
    backgroundColor: "{colors.waiting-surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.receipt}"
    padding: "12px 14px"
---


# Design System: Hallvi application workspace

## Redesign status

[Application operator design](../../../docs/operator-design.md) and the [UI reference](../../../docs/design/screens.md) govern the redesign. Keep this visual language and the sidebar's guiding purpose as starting points; view interiors and interactions can change to serve the deployment journey.

Pi chooses what to surface through shared knowledge records with optional presentation. One main conversation owns changes; side conversations are read-only, with native queue/steer for active work. The operation receipts, fixed states, approval placement and facts contracts described below document the existing UI. They do not require the redesign to preserve that record model or workflow machinery. Exact new presentation roles are not settled. Review each view's capabilities after the deployment path works.

## The presentation protocol

Pi decides what a view says. This decides how it is said, so a destination nobody has designed yet still comes out looking like the rest of the product. Everything that renders a saved record obeys it.

**One source of tone.** `presentation.css` holds the tokens and the certainty tag; `presentation.tsx` holds `Tag`, `Working`, `toneOf` and `rank`. A component that draws a record does not pick its own colour, and no file below this layer writes a hex value for a state. The shell's `--ink`, `--muted` and `--line` and this file's `--verified*`, `--waiting*`, `--failed*`, `--unknown-bg` and `--blue` are the whole palette.

**Five tones, five meanings.** Verified (checked, and the check is recent), stale (true once, wants looking at), failed (it did not work), unknown (recorded, not established), absent (retired, or never there). Each carries an icon as well as a tint so the state survives a colour-blind reading. A component never chooses a tone from a literal — it passes the record to `toneOf`.

**Never print the enum.** `status: "info"` reads “Recorded”. `status: "warning"` reads “Needs attention”. A raw field name on screen means the design stopped early.

**One certainty per record, at the top left.** The tag, then the title, then when it was established. Never a second badge repeating the first, and never a tint without its word.

**Say which clock.** “Established” when Pi established it, “Saved” when that is all we know. `LocalTime` with `variant="compact"` — the full date lives in the hover title. One timestamp per fact: if the header carries it, the footer does not.

**One measure.** Prose, the checks grid and the next step all stop at 68ch. A body longer than four lines folds, with the control only offered when something is folded away; a view of six records must stay scannable without scrolling past one of them.

**Checks are the substance.** What was actually verified goes in `checks`, one line each, with its own pass/fail/noted mark — not buried in the prose. Failed checks colour their own line and nothing else.

**Actions are pills, and there is at most one primary.** The primary is the application itself. A card never offers to open the page it is already on; pass `currentView` and it will not.

**Evidence is a disclosure.** Counted, closed by default, named for what it is (“What this rests on”), never an open list of ids.

**Attention first.** Views sort with `rank`: failed, then needs attention, then what is simply true, then what Pi suggests, then retired. No group headings — with two or three records they weigh more than the records do.

**[Empty means unassessed, never healthy.](../../../PRODUCT.md#empty-means-unassessed-never-healthy)** “Nothing has been established here yet”, and a sentence saying that is not a claim that there is nothing to find. Never an empty state that implies working backups, an absent firewall or a healthy application.

**Motion is for state, not arrival.** `--fast` for the press of a control, `--base` for a state changing, nothing on page entrance. Every transition has a reduced-motion answer in the same file.

**Overview uses the chosen Timeline composition.** The live route uses the reference layout: an application action in the header, a hero of four rails (Checks, Backups, Server, Access; `lane-rails.tsx`, shared with Database), a dark recorded-work log, then an architecture miniature and recent work. It reads shared records directly; the prototype scenario engine and retired operation model do not run here. Check `subject` places an observation on its lane, and `establishedAt` places it in time. A mark proves an observation at that time, never continuous uptime or a backup schedule. Missing evidence reads “Not established”. Clicking a mark opens its original record. Since 17 September the lanes are rails, not dots on a time axis: stops are evenly spaced and worded as things that happened, the quiet between them is written on the line, each lane opens with the question it answers and one plain sentence, only the stretch from the last stop to now wears the lane's state, and "Earlier" pages back through history. Kept deliberately quiet: hairline rails, small rings, colour only on that last stretch.

**Typed content keeps meaning separate from layout.** Deployment results expose source, running image, material changes and checks; application access exposes the entry point and, for private access, the SSH route. Chat folds deployment details. Overview gives the application link prominence; destination views expand the relevant details. Both render the same saved record and reuse the certainty tag, body disclosure, timestamps and tone tokens. `presentation.content.kind` selects these product-owned components; Pi never supplies layout or styling.

**Adding a destination** means rendering `InformationCard` from the sorted records with `currentView` set, and nothing else until that destination earns more. The content contract Pi writes against lives with the `save_information` tool in `src/server/pi.ts`; when a component needs a field the records do not carry, the fix is that contract, not a component that invents one.


## Overview

**Creative North Star: "Quiet application workspace"**

A light, Railway-inspired shell gives application facts and conversation room to breathe. Restrained blue identifies actions and selection; thin borders separate surfaces. This document describes the functioning Hetzner/Compose slice at this component boundary, not the richer simulated prototype or all capabilities in PRODUCT.md.

**Key Characteristics:**

- Stable application destinations above multiple conversations.
- Agent-directed progress inside familiar components; the agent does not rearrange navigation.
- Stable application facts before changing deployment progress.
- Inspectable recorded work with quiet, collapsible detail.

Source authority: `application-shell.css`, `application-navigation.tsx`, `operator-shell.tsx` and the `*-page.tsx` destinations; inherited controls and fonts come from `src/app/hallvi.css` and `src/app/globals.css`. Review captures are in project-root `.impeccable/review/`: `conversation-desktop.png`, `desktop.png`, and `mobile.png`. These are visual evidence of the exercised slice, not a promise of current host health.

## Applications home

The [applications-home design](home/DESIGN.md) owns the “in good company”
composition: each application and its caretaker share a colored header,
followed by its explicitly illustrated preview and recorded condition.
Blue remains the action color; caretaker colors identify applications rather
than health. Greeting the caretaker is a small optional interaction, separate
from opening the application. It makes no new claims about runtime state.

## Adopted interaction direction (9 September)

Fable A is the selected experience: conversation first, inline operation receipts and quiet navigation marks, with stable full-page application views. There is no permanent right pane, split mode or floating window. Operations are shared across conversations and application views; completed evidence stays historical while application facts reflect later verified work.

**Built into the shell on 9 September.** `operator-shell.tsx` renders this design against real records: `operation-receipt.tsx` (chip, steps, receipt, destination links, reference chips), `destination-activity.tsx` (activity cards and origin lines above a destination's facts), `overview-page.tsx` (condition, needs you, running, recent changes, evidence freshness) and the marks in `application-navigation.tsx`. The record they read is projected in `src/server/operation-record.ts`. `deployment-decision.tsx` and `application-overview.tsx` were the components of the day; the approval now lives in the receipt itself and Overview is a page composed from records. See the [UI reference](../../../docs/design/screens.md).

## The visual vocabulary (later on 9 September)

Views were reworked so each one leads with its state, groups its facts, and
draws a picture only where a picture is faster to read than a sentence. The
elements live in `views/visuals.tsx` and each renders nothing when its data
would not support it, so a simple application stays a simple page.

| Element | Says | Renders when |
| --- | --- | --- |
| `Condition` | The state of this destination in one line | Always, at the top of a view that has one |
| `Tally` | How a set of states divides: 1 failing, 5 passing | Three or more items in two or more states |
| `Composition` | How a measured whole divides, with the headroom | A measured total exists and the parts fit inside it |
| `Meter` | One level against its capacity, marked at 75% and 90% | A measurement and a capacity are both recorded |
| `Flow` | A path whose stages each carry their own state | Delivery (Domains), caching (CDN) and release (Deployment) |
| `Timeline` | Recorded moments on a real time axis, and the gaps | Two or more recorded points |
| `OutcomeStrip` | The rhythm of the last few outcomes | Three or more recorded runs |
| `Bars` | Comparable magnitudes with no whole | Observed values, never an assumed zero |
| `Loading` | The shape of the answer before the record is read | The first record fetch has not returned |

Security states exposure rather than a switch. A rule open to every network
is stated as such, but only administrative access reachable from anywhere is
marked: a public web application needs port 80 open, and calling that a
warning would teach the reader to ignore the marks.

Rules that keep this restrained: a visual must answer a question the reader
already has; it never invents a value a capability has not recorded; and a
view that has one honest sentence to say says it in one sentence. Facts run
in two columns on a wide screen so a label and its value stay together, and
a row list tints only when something is wrong.

## Where identity sits

The application name, its repository and the switcher sit in the sidebar
head, above the destinations they scope, with a small “Hallvi” link back
to all applications. The top bar then carries where you are — the open
destination, or the current conversation. There
is one place to switch application. `application-identity.tsx` also carries
`topbar` and `breadcrumb` placements, compared live in `/prototype/shell`.

Before the first request, the welcome explains the next action. During first
setup, a compact row beside the composer shows the four recorded milestones:
Read it, A place to run, Deploy, Open it. Completed setup removes it.

**Hallvi working (19 September).** A running turn has one live line, at the end
of the reply it belongs to: a small spinner, what Hallvi is doing now, and the
elapsed time. It has no box and no button. "Running" is said once per thing and
by the words themselves — `.hv-sheen`, a slow band of ink over muted text — on
the live line, on a running group in the transcript and on a running call
inside it; nothing pairs a spinner with the word "working", the running reply
wears no "Draft" tag, and a server command's card leaves "Running" to its own
terminal bar. Little Server (`working-mascot.tsx`, flat, 30px) rises from
behind the end of the live line for about five seconds in every eighteen,
tightens something and goes; his slot is always reserved so the words never
move, and he is absent under reduced motion. Stop is an icon — a ring with a
square — in Send's place in the composer while a turn runs and nothing is
typed; the first character brings "Send next" back. Its accessible name says
what it cancels ("Stop + cancel 1 queued"). Chosen from a switchable prototype
on the real shell; the options and the verdict are on the
`prototype/ux-sidebar-and-working` branch.

## Conversation-first design language from Fable

Imported from commit `017d656`. These interaction and visual rules supersede older context-pane descriptions above. The exploration that produced them is retired; the living source is the product itself: `npm run scenarios -- <port>` serves every state through the shipping pages from the records in `tests/fixtures/scenario-records.ts`. The reference shell that used to hold invented data under `/prototype` has been retired. Reference chips lead to one approval at the originating message. The earlier source is archived in [explore/DESIGN.md](https://github.com/lustoykov/hallvi/blob/0682ab257469bc5cee994572285283ea949bc3c6/docs/archive/previous-direction/explore-DESIGN.md).

## Colors

The workspace palette, plus a small fixed set of state tints. Each state owns one tint pair (soft background and text), one border for cards in that state, and, where a card carries the state, a barely tinted surface.

### Primary

- **Action blue** (`blue`, `link`, `selected-bg`, `selected-text`): primary buttons, links, the selected navigation row. Unchanged from the workspace system.
- **Working blue** (`working-bg`, `working-text`, `working-line`): the Working chip, the pulsing navigation mark, the active step in a step list, destination links and their hover. The same hue as the action blue on purpose: work in progress is the agent acting.

### Neutral

- **Ink, muted, line** (`ink`, `muted`, `line`): text, secondary text and separators, scoped to the shell as before.
- **Surfaces** (`surface`, `context`, `card-surface`): white work surfaces, the tinted bars and headers, and the faintly blue card surface for approval and activity cards.
- **The column** (`navigation-top` to `navigation-bottom`, `navigation-groove`, `navigation-text`): a faint tint of the action blue, recessed behind the white workspace. `shade` is the one blue-navy every shadow in the shell is mixed from, so depth reads as one light.
- **Inspected grey** (`inspected-bg` with `muted` text): the chip for a read-only inspection. Grey because reading changes nothing.

### State

- **Waiting amber** (`waiting-bg`, `waiting-text`, `waiting-line`, `waiting-surface`, `amber`): anything that needs the user. The Waiting-for-you chip, the amber navigation mark, the approval card’s parent receipt, the Needs-you items on Overview, and the “Proposed change · not applied” card. Amber is the only colour a proposal is allowed to wear.
- **Verified green** (`verified`, `verified-bg`, `verified-text`): the Verified chip, the evidence line, the “updated since you looked” navigation mark, the Fresh cell in the freshness table, the “Protected” protection line.
- **Failed red** (`failed`, `failed-bg`, `failed-line`, `failed-surface`): the Failed chip, the failed step, the red navigation mark, the failed attempt in Backups, “Behind policy”, and the border of a failed receipt or activity card.
- **Simulated** (`simulated-bg`, `simulated-line` with `waiting-text`): the banner and the small “Simulated” tag on invented data. Exploration only; the product never needs it.

### Named Rules

**The Recorded State Rule.** Green appears only with evidence: a verified action, a passed restore test, a fresh check. A schedule, a connected bucket or a pending upload is never green. Inherited from the workspace system and extended to every chip and mark.

**The Not-Applied Rule.** A proposal wears amber and the words “not applied”. The facts beneath it stay exactly as they were. Nothing in a view may preview the desired outcome.

**The Proportion Rule.** Amber and red are for something that broke or for a decision the owner must make now. An established absence on a small application (no backup, no monitor, no restore test) is grey: a fact, in plain words, with an offer in a sentence and no next step. The stakes decide the tone, and Pi records the stakes; a component never turns "nothing here yet" into a warning on its own. See [proportionate care](../../../docs/operator-design.md#proportionate-care).

**The One Tint Per State Rule.** Each state uses its own pair and nothing else. Do not mix a green chip with an amber border, and do not invent a sixth state colour; a new state is a product decision, not a colour choice.

## Typography

**Display and body font:** Geist (with system-ui, sans-serif). **Code and logs:** Geist Mono.

**Character:** the same working-application voice as the workspace system, one step smaller inside records. Receipts, cards and chips are read while doing something else, so they are compact and their hierarchy is carried by weight and colour rather than size.

### Hierarchy

- **Title** (600, 23px, -0.025em): destination headings such as “Overview” and “Backups”.
- **Conversation title** (600, 18px): the name of the conversation above the transcript.
- **Body** (400, 13px, 1.8): messages, facts, Overview text. Facts keep a 70ch measure.
- **Receipt** (400, 12.5px, 1.6): everything inside a receipt, approval card or activity card. The action title inside a receipt is 600 at the same size.
- **Label** (600, 11.5px, 0.04em, uppercase): the “Read” and “Changed” prefixes before destination links, “Refers to”, and Overview block headings (0.05em).
- **Chip** (600, 11px, 1.6): state chips. The step detail after the state (“· step 2 of 5”) is 500.
- **Meta** (400, 11px, tabular numbers): timestamps and relative times, always in muted.
- **Mono** (12px): revisions, database names, log lines.

### Named Rules

**The Chip Speaks First Rule.** In a receipt head, an activity card head, a Needs-you item or a Recent-changes row, the state chip comes before the title. The reader learns the state before the subject.

**The Relative Time Rule.** Inside records, time is relative to now (“3 min ago”, “2 days ago”) and set in meta size at the right edge. Absolute local time appears in facts tables, never in chips.

## Layout

The workspace shell: a 240px navigation column, a 56px top bar, and a workspace that fills the rest. Beside the column the top bar and workspace form one sheet, its top-left corner rounded 14px and set 8px down, casting a soft shadow onto the column; on a phone the navigation is a strip above it and there is no sheet edge. Conversation-first uses the workspace as one column. The transcript keeps the 780px measure of the production chat pane, centred; the composer stays attached at the bottom.

A destination opened from a receipt, a mark or navigation takes the full workspace width. A 41px bar sits above its header with one text button, “Back to [conversation name]”, and, when work elsewhere is live, a suggestion chip. While a destination is open and an action is working or waiting, the top bar shows a **work strip** on the right: state chip, action title, nothing else. The conversation stays mounted but parked (visibility hidden, inert), so scroll position and draft survive the trip. A question opened from a destination carries a removable “About [destination]” chip, preserves any existing draft, and offers “Return to [destination]” after submission. Ordinary drafts survive tab closure in controller-origin, application and conversation scoped browser storage. While a reply is running, the submit control is the Stop icon until something is typed, then “Send next”; queued text has an explicit waiting state. Stop also cancels queued follow-ups in that conversation. Completed Pi replies offer a quiet, always available Copy reply action with success or failure feedback. Sending returns focus to the composer; returning to a destination focuses its navigation control. Settings and GitHub connection links carry the application and conversation, so setup returns to the same draft. The first application explains ownership and the deployment steps; subsequent additions keep just the short introduction and repository form.

Receipts sit under the message that started the work, inside the message column, and stretch to the message width. Activity cards and origin lines sit at the top of a destination’s content, above the first heading, so the first thing a view says is what is happening to it right now.

Overview is a two-column grid at desktop (Needs you beside Running, 28px by 36px gaps), then Recent changes and Evidence freshness at full width. Everything collapses to one column at 640px and below, where navigation becomes the workspace’s horizontal row as in the workspace system.

The dark bar at the very bottom of the exploration (variant tabs, scenario stepper, clock) is exploration tooling, not part of the product language. It reserves 44px so it never overlaps the composer.

## Elevation & Depth

Two levels, one light (19 September). The navigation column is recessed; the workspace is a sheet resting on it. Within the column, what is selected is lifted off it (`--raise`: a hairline ring and a short shadow on white): the application identity, the selected destination or conversation, and the new-conversation button. Group separators are grooves — one dark hairline with a light one under it — rather than rules. On the sheet, top-level cards keep their one-pixel border and gain `--lift`, a short soft shadow: the composer, command cards, and each destination's lead cards. Both shadows are mixed from `shade`. Focus stays a two-pixel blue outline; the composer's focus ring sits over its lift.

State is still carried by tint and one-pixel borders. A receipt, approval card or activity card is a bordered rectangle on white; its state tints the border (`working-line`, `waiting-line`, `failed-line`) and sometimes the surface (`waiting-surface`, `failed-surface`, `card-surface`).

### Named Rules

**The Tint, Not Shadow Rule.** Depth says where something sits — column, sheet, card — and never what state it is in. If a card needs to say something about state, change its border or surface tint. Never lift it further.

## Shapes

Three radii and a pill. Controls keep 7px and cards 8px from the workspace system. Records are softer: receipts, approval cards, activity cards and Needs-you items use 10px, so they read as objects placed in the conversation rather than as panels. Containers keep 12px.

Everything that names a state or a place is a pill (999px): state chips, destination links, reference chips, suggestion chips, and the 7px navigation marks. The approval card is the one dashed border in the system: a request is not yet a fact, and the dashed line says so.

## Components

### State chip

- **Character:** the smallest unit of the language and the most repeated. One icon, one word, optionally one detail.
- **Shape:** pill, 2px by 8px padding, chip typography, 12px icon before the word.
- **Variants:** Working (spinner, working tints), Waiting for you (hourglass, waiting tints), Inspected (magnifier, inspected grey), Verified (check, verified tints), Failed (warning, failed tints).
- **Detail:** “· step 2 of 5” after Working. Nothing else is allowed inside a chip.

### Receipt

- **Character:** the durable trace of one action, placed under the message that started it, updating in place as the action changes state.
- **Anatomy, top to bottom:** head (state chip, action title in 600, relative time at the right edge), one-line summary, then exactly one of: step list while Working or Failed, evidence line in verified green after Verified or Inspected, “Next:” line in waiting amber after Failed; then the approval card while Waiting for you; then destination links with a “Read” or “Changed” prefix once settled.
- **Shape and colour:** 10px radius, 12px by 14px padding, white surface, `line` border. Waiting tints the border amber and the surface to `waiting-surface`; Working tints the border blue; Failed tints the border red and the surface to `failed-surface`.
- **Behaviour:** the receipt never moves and is never duplicated. A later message reports; the receipt records.

### Step list

- **Style:** 16px mark column, 13px icons; done in ink with a check, active in working blue at 600 with a spinner, pending in muted with a 6px hollow circle, failed in red at 600 with a warning. A note after a step (“· 412 MB”) is muted and regular weight.

### Approval card

- **Character:** the one place a decision is made. Dashed `field-line` border, 10px radius, `card-surface`, 12px padding.
- **Content:** “Your approval is needed” with a Simulated tag in the exploration, a sentence on scope and cost, password fields with a label and hint each, then a primary button carrying the exact action (“Approve and apply”, “Provide token and retry”) and the sentence “Nothing changes until you approve.”
- **Placement:** inside the receipt in conversation-first. The same component can render in a view; this option does not.

### Destination links and reference chips

- **Record hierarchy:** name the interaction (Recommendation, Needs attention, Result or Update) separately from the evidence grade. Give the outcome title prominence, keep evidence disclosed, and label a recorded next step without inventing an executable action. Retired records remain quiet history with obsolete calls to action removed.
- **Destination link:** pill, `line` border on white, working-blue text, 11.5px, an arrow icon after the verb and destination (“Open Backups →”). Hover tints the background `working-bg`. The verb is the option’s verb; conversation-first says “Open”.
- **Reference chip:** the same pill with a state chip inside, the referenced action’s title in ink and “from [conversation]” in muted. It opens that conversation at that message. Used when a reply builds on work from another conversation.
- **Text link:** the bare blue text button used for “from Database and backups” and the Backups link inside a fact.

### Activity card and origin line

- **Activity card:** at the top of a destination while an action touching it is Waiting, Working or Failed. Head with state chip and a plain-language title (“Proposed change · not applied”, “Hallvi is applying a change”, “This needs you”), one sentence, step list or next step, then one link: “Review and approve in the conversation” or “Open in [conversation]”. 10px radius, 14px by 16px padding, `card-surface`, border tinted by state.
- **Origin line:** once settled, one line of meta text with the last action’s chip, its title, “from [conversation]” as a text link, and the relative time. It is a sentence, not a row.

### Navigation mark

- **Style:** a 7px dot at the right edge of a navigation row, with the reason in a title and as the row's accessible description, so the row keeps its plain name.
- **Tones:** Working (working blue, pulsing at 1.6s, still under reduced motion), Waiting for you (amber), Failed (red), Updated since you looked (verified green).
- **Rules:** precedence is failed, then waiting for you, then working, then updated, so a new operation cannot hide an issue. A mark never opens anything; the row it sits on does. The green mark clears when the destination is looked at; the others clear when the state changes. Conversations get the same mark for their own live action.

### Overview blocks

- **Before a recorded deployment:** lead with one stage-specific continuation based on the latest application record and stored connection settings. Missing records mean “No deployment is recorded yet”, not “Not deployed”. Hide repeated unknown vital rows. Failed or limited latest deployments take precedence over older verified records.
- **Condition row:** status dot (green only when the last verification is under 24 hours old), application name, one line of condition with the relative verification time and “no continuous monitoring yet”. When stale, a secondary button drafts a re-verification request.
- **Needs you:** items with a state chip, title, one sentence, and two links: review or open the conversation, and open the destination. Amber surface; red border when failed. Empty state: “Nothing needs you right now.”
- **Running:** a four-row fact list (application, host, database, protection) with a 110px label column; protection is coloured by state.
- **Recent changes:** rows of chip, title with origin and time, and destination links beneath the title.
- **Evidence freshness:** a three-column table; the fact is a text link to its destination, the last-checked cell shows local time and relative time, the freshness cell is Fresh (green), Stale · over 24 h (amber, 600) or No evidence (muted).

### Prototype bar

- A scenario database is labelled by what it is rather than by a banner inside the pages: the applications it holds are named “Scenario · …” and say what each exists to show. Nothing inside a destination or a receipt says “simulated”, and product screenshots come from the same components reading real records.

### Views from facts

- A view renders its finished design when the facts contract (`src/server/application-facts.ts`) has facts for it, and its placeholder (what would appear, whether Hallvi can record it today, “Ask in the conversation”) otherwise. A view without an action handler shows the fact and no control.
- **Investigate** means one thing: open a linked conversation that adopts the automatic operation, starting from the recorded event. Only when nothing can be adopted does it draft a question in the current conversation.
- An issue carries its operation: Overview shows the issue card (Investigate, Acknowledge) and never a second card for the failed operation it records. Recovered issues have no Investigate; they link to their conversation when one exists.
- Automatic work says “automatic” in origin lines and Recent changes; work a person started names its conversation.
- Times render in the reader’s zone through `LocalTime`; a schedule states its own timezone next to the time.

### Buttons and fields

One primary button everywhere (19 September): 34px tall (`--button-height`), 0 by 14px padding, 13px at weight 560, 8px radius, 15px icons, action blue with `--button-shadow` — a faint top light and a short shadow — so it reads as the action without sheer size. The home call to action, the setup and connection footers, the new-application form, dialogs and the Deployment “Open” button all use it; none is 44px or full-width on desktop. Secondary buttons share the height on white with a `field-line` border and no shadow. Smaller variants stay small and take the same shadow: the 32px Send, the 30px in-transcript retry and record pills, the onboarding rail start. Every primary uses `--blue` and `--blue-hover`; no file hard-codes its own blue. Password inputs keep a `field-line` border; inside records the input is 8px by 10px at 12px type.

## Do's and Don'ts

### Do:

- **Do** render every action from the record. If a surface wants to say something about work, it reads the action and uses these components; it does not keep its own copy of the state.
- **Do** keep confirmed facts below and live activity above in every destination, with the origin line as the settled form.
- **Do** link both ways: a receipt links to the destinations it touched, a view links to the conversation at the message that started the work.
- **Do** mark, never move. Marks and receipts tell the reader where to look; the reader navigates.
- **Do** keep the conversation mounted while a destination is open so scroll position and draft survive.
- **Do** lead with the chip, keep relative time at the right edge, and use one state tint per record.
- **Do** label anything simulated with the banner or tag, and keep the exploration bar out of product screenshots.

### Don't:

- **Don't** add a permanent side panel. Receipts, marks and full-width destinations carry everything the old right panel repeated.
- **Don't** show verified green, a “Protected” line or a configured destination before the evidence exists.
- **Don't** put the same approval card in two places at once in this option; the decision lives in the receipt.
- **For existing receipts**, use their established states and tints consistently. New shared-record presentation is designed around the deployment journey rather than forced into this operation state model.
- **Do** use designed presentation components. Pi chooses content and placement; the current operation fields are not a required schema for new shared records.
- **Don't** lift a card with a shadow to signal state; `--lift` is the same on every card.
- **Don't** put a spinner beside the word "working", or a second "Running" on something that already says it.


## Application journey polish (9 September)

Review used the saved Todo, Uptime Kuma, and Grafana/Prometheus deployments,
recreation receipts, verification checks, logs and Grafana's failed/retried
attempt. Claude Opus 5 at maximum effort reviewed source and six screenshots.

- Shared destinations use 24px titles, 14px reading text, and 13px metadata.
  Qualifying evidence is readable text, including on touch screens.
- Completed receipts show identical result text once. The first three
  destination links remain visible; additional destinations expand in place.
- History keeps failure reasons visible, names the verified resolver, and
  expands detailed evidence/steps. “Outside chat” describes origin accurately
  without assuming that every log collection is automatic or user-triggered.
- Overview summarizes the primary destination; History holds the full list.
- Verified Deployment shows its revision, runtime type, server and HTTP access.
  Event logs retain all original evidence.
- Controller-restricted HTTP is labeled beside the application link and in
  Architecture and Overview. A timestamp is a recorded check, not monitoring.
- Security stays in navigation while a provisioned host is available; opening
  it reads the provider. No locally cached observation is promoted to a fact.
- Pointer hover highlights home illustrations without selecting a different
  application for the chat action. Explicit click and keyboard focus select it.
- Mobile omits the redundant back-to-chat bar while keeping the conversation
  controls. The destination strip fades at its scroll edge. Variable names use
  the existing mono font; the explanatory condition states that values are hidden.

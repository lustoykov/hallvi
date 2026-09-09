---
name: Server Guy conversation-first workspace
description: The quiet application workspace plus one application-level action record that renders as receipts in chat, activity cards in views, marks in navigation and blocks on Overview.
colors:
  ink: "#202838"
  muted: "#687183"
  line: "#e7e9ee"
  surface: "#ffffff"
  navigation: "#f7f8fa"
  context: "#fafbfc"
  card-surface: "#fbfcfe"
  blue: "#285ad8"
  link: "#315bc6"
  selected-bg: "#e8edf7"
  selected-text: "#244d98"
  field-line: "#ccd5e3"
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
    fontSize: "23px"
    fontWeight: 600
    letterSpacing: "-0.025em"
  conversation-title:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 600
  body:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "13px"
    lineHeight: 1.8
  receipt:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "12.5px"
    lineHeight: 1.6
  label:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "11.5px"
    fontWeight: 600
    letterSpacing: "0.04em"
  chip:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    lineHeight: 1.6
  meta:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "11px"
  mono:
    fontFamily: "Geist Mono, ui-monospace, SFMono-Regular, Menlo, monospace"
    fontSize: "12px"
rounded:
  control: "7px"
  card: "8px"
  receipt: "10px"
  container: "12px"
  pill: "999px"
spacing:
  chip: "2px 8px"
  compact: "12px"
  standard: "16px"
  panel: "24px"
  dashboard: "36px"
components:
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
  button-primary:
    backgroundColor: "{colors.blue}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
---

# Design System: Server Guy conversation-first workspace

This document extends the application workspace system in `src/components/server-guy/DESIGN.md`. It covers the conversation-first option of the chat-and-views exploration (9 September 2026): the shared action record and every surface that renders it. Source authority: `explore.css`, `receipts.tsx`, `sections.tsx`, `overview.tsx`, `chat.tsx`, `exploration.tsx` and the two marks added to `application-navigation.tsx`. Values not restated here come from the workspace document. Everything in the exploration is simulated and labelled; this document describes the design language, not product capability.

## Overview

**Creative North Star: "Quiet application workspace"**

Inherited from the workspace system and kept. The conversation is the working surface; the stable destinations are where confirmed facts live. What this option adds is one idea: **every piece of agent work is one record, rendered in several places, never copied.** A receipt under the message that started the work, an activity card above the facts of the views it touches, a mark beside those destinations in navigation, a line in Overview. They all read the same record and show the same state, so the reader can look anywhere and learn the same thing.

The owner’s words for the result, in September 2026: focused, clean and calm; a sense of working and of progress, with controls in reach. The interface earns that by being quiet by default. Nothing moves the reader; marks say where to look, and the reader decides when. There is no permanent side panel. The one accent colour, blue, still means “action or selection” and now also means “Server Guy is working here”. Green appears only with evidence.

**Key Characteristics:**

- One application-level action record with five states; every surface renders it from the same data.
- Receipts make the conversation self-sufficient; destination links and origin links tie chat and views together in both directions.
- Views show confirmed facts below and live activity above, so a proposal can never look like a result.
- Quiet marks in navigation carry consequence: working, waiting for you, failed, changed since you looked.
- Overview answers four questions in order: what is running, what needs you, what changed, how fresh the evidence is.
- The agent emits records as data; the components are fixed. Nothing is generated.

## Colors

The workspace palette, plus a small fixed set of state tints. Each state owns one tint pair (soft background and text), one border for cards in that state, and, where a card carries the state, a barely tinted surface.

### Primary

- **Action blue** (`blue`, `link`, `selected-bg`, `selected-text`): primary buttons, links, the selected navigation row. Unchanged from the workspace system.
- **Working blue** (`working-bg`, `working-text`, `working-line`): the Working chip, the pulsing navigation mark, the active step in a step list, destination links and their hover. The same hue as the action blue on purpose: work in progress is the agent acting.

### Neutral

- **Ink, muted, line** (`ink`, `muted`, `line`): text, secondary text and separators, scoped to the shell as before.
- **Surfaces** (`surface`, `navigation`, `context`, `card-surface`): white work surfaces, the cool grey navigation column, the tinted bars and headers, and the faintly blue card surface for approval and activity cards.
- **Inspected grey** (`inspected-bg` with `muted` text): the chip for a read-only inspection. Grey because reading changes nothing.

### State

- **Waiting amber** (`waiting-bg`, `waiting-text`, `waiting-line`, `waiting-surface`, `amber`): anything that needs the user. The Waiting-for-you chip, the amber navigation mark, the approval card’s parent receipt, the Needs-you items on Overview, and the “Proposed change · not applied” card. Amber is the only colour a proposal is allowed to wear.
- **Verified green** (`verified`, `verified-bg`, `verified-text`): the Verified chip, the evidence line, the “updated since you looked” navigation mark, the Fresh cell in the freshness table, the “Protected” protection line.
- **Failed red** (`failed`, `failed-bg`, `failed-line`, `failed-surface`): the Failed chip, the failed step, the red navigation mark, the failed attempt in Backups, “Behind policy”, and the border of a failed receipt or activity card.
- **Simulated** (`simulated-bg`, `simulated-line` with `waiting-text`): the banner and the small “Simulated” tag on invented data. Exploration only; the product never needs it.

### Named Rules

**The Recorded State Rule.** Green appears only with evidence: a verified action, a passed restore test, a fresh check. A schedule, a connected bucket or a pending upload is never green. Inherited from the workspace system and extended to every chip and mark.

**The Not-Applied Rule.** A proposal wears amber and the words “not applied”. The facts beneath it stay exactly as they were. Nothing in a view may preview the desired outcome.

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

The workspace shell is unchanged: a 240px navigation column, a 56px top bar, and a workspace that fills the rest. Conversation-first uses the workspace as one column. The transcript keeps the 780px measure of the production chat pane, centred; the composer stays attached at the bottom.

A destination opened from a receipt, a mark or navigation takes the full workspace width. A 41px bar sits above its header with one text button, “Back to [conversation name]”, and, when work elsewhere is live, a suggestion chip. While a destination is open and an action is working or waiting, the top bar shows a **work strip** on the right: state chip, action title, nothing else. The conversation stays mounted but parked (visibility hidden, inert), so scroll position and draft survive the trip.

Receipts sit under the message that started the work, inside the message column, and stretch to the message width. Activity cards and origin lines sit at the top of a destination’s content, above the first heading, so the first thing a view says is what is happening to it right now.

Overview is a two-column grid at desktop (Needs you beside Running, 28px by 36px gaps), then Recent changes and Evidence freshness at full width. Everything collapses to one column at 640px and below, where navigation becomes the workspace’s horizontal row as in the workspace system.

The dark bar at the very bottom of the exploration (variant tabs, scenario stepper, clock) is exploration tooling, not part of the product language. It reserves 44px so it never overlaps the composer.

## Elevation & Depth

Flat, as before. State is carried by tint and one-pixel borders, not by shadow. A receipt, approval card or activity card is a bordered rectangle on white; its state tints the border (`working-line`, `waiting-line`, `failed-line`) and sometimes the surface (`waiting-surface`, `failed-surface`, `card-surface`). Focus stays a two-pixel blue outline.

The only shadow in the conversation-first option belongs to the exploration bar. The floating window of option D used `--shadow-l`; it is not part of this language.

### Named Rules

**The Tint, Not Shadow Rule.** If a card needs to say something about state, change its border or surface tint. Never lift it.

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

- **Destination link:** pill, `line` border on white, working-blue text, 11.5px, an arrow icon after the verb and destination (“Open Backups →”). Hover tints the background `working-bg`. The verb is the option’s verb; conversation-first says “Open”.
- **Reference chip:** the same pill with a state chip inside, the referenced action’s title in ink and “from [conversation]” in muted. It opens that conversation at that message. Used when a reply builds on work from another conversation.
- **Text link:** the bare blue text button used for “from Database and backups” and the Backups link inside a fact.

### Activity card and origin line

- **Activity card:** at the top of a destination while an action touching it is Waiting, Working or Failed. Head with state chip and a plain-language title (“Proposed change · not applied”, “Server Guy is applying a change”, “This needs you”), one sentence, step list or next step, then one link: “Review and approve in the conversation” or “Open in [conversation]”. 10px radius, 14px by 16px padding, `card-surface`, border tinted by state.
- **Origin line:** once settled, one line of meta text with the last action’s chip, its title, “from [conversation]” as a text link, and the relative time. It is a sentence, not a row.

### Navigation mark

- **Style:** a 7px dot at the right edge of a navigation row, with the reason in a title and as the row's accessible description, so the row keeps its plain name.
- **Tones:** Working (working blue, pulsing at 1.6s, still under reduced motion), Waiting for you (amber), Failed (red), Updated since you looked (verified green).
- **Rules:** precedence is failed, then waiting for you, then working, then updated, so a new operation cannot hide an issue (adopted from the integration; the exploration ranked working first). A mark never opens anything; the row it sits on does. The green mark clears when the destination is looked at; the others clear when the state changes. Conversations get the same mark for their own live action.

### Overview blocks

- **Condition row:** status dot (green only when the last verification is under 24 hours old), application name, one line of condition with the relative verification time and “no continuous monitoring yet”. When stale, a secondary button drafts a re-verification request.
- **Needs you:** items with a state chip, title, one sentence, and two links: review or open the conversation, and open the destination. Amber surface; red border when failed. Empty state: “Nothing needs you right now.”
- **Running:** a four-row fact list (application, host, database, protection) with a 110px label column; protection is coloured by state.
- **Recent changes:** rows of chip, title with origin and time, and destination links beneath the title.
- **Evidence freshness:** a three-column table; the fact is a text link to its destination, the last-checked cell shows local time and relative time, the freshness cell is Fresh (green), Stale · over 24 h (amber, 600) or No evidence (muted).

### Simulated banner and tag

- **Banner:** `simulated-bg` on `simulated-line`, 8px radius, 9px by 12px padding, meta size in waiting amber, first thing in a view’s content. **Tag:** the same colours as a 10.5px pill inside approval cards. Exploration only.

### Buttons and fields

Inherited: blue primary with a 7px radius, white secondary, password inputs with a `field-line` border. Inside records the primary button is 8px by 12px and the input 8px by 10px at 12px type.

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
- **Don't** invent a sixth state or a new tint. Inspected, Waiting for you, Working, Verified and Failed cover the record.
- **Don't** generate UI. The agent emits a record (title, state, steps, inputs, destinations, evidence); the components are fixed.
- **Don't** lift a card with a shadow to signal state.

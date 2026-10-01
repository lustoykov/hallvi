---
name: Hallvi plugin panel
description: A compact Hallvi inside an MCP Apps host. The application first, its operator one tab away, and the rest of Hallvi one link away.
colors:
  ink: "host --color-text-primary, else #202838"
  muted: "host --color-text-secondary, else #687183"
  line: "host --color-border-secondary, else #e7e9ee"
  surface: "host --color-background-primary, else #ffffff"
  sunken: "host --color-background-tertiary, else #f4f6fa"
  blue: "#285ad8"
  working-bg: "#edf3ff"
  working-text: "#2852a6"
  waiting-bg: "#fff4e9"
  waiting-text: "#9a4b10"
  waiting-line: "#ecd6b8"
  verified: "#14945f"
  failed: "#a6312b"
typography:
  body:
    fontFamily: "host --font-sans, else Geist, system-ui"
    fontSize: "13.5px"
    lineHeight: 1.6
  condition:
    fontSize: "15px"
    fontWeight: 620
  meta:
    fontSize: "11.5–12.5px"
  mono:
    fontFamily: "host --font-mono, else Geist Mono, ui-monospace"
    fontSize: "11.5–12.5px"
rounded:
  control: "7–8px"
  segment: "8px in a 10px track"
  card: "10px"
  field: "12px"
  pill: "999px"
---

# Design System: Hallvi plugin panel

## North star: "Hallvi at your elbow"

Someone working in Codex turns to the side and sees how their application is
doing: its condition, anything its operator needs from them, what is running
and how it is being used. From there they act through the operator or open
the right page of Hallvi. The panel is a smaller Hallvi, not a dashboard of Hallvi and not only a
chat. The [workspace design](../../src/components/hallvi/DESIGN.md) remains the
visual authority; this file records what changes in a narrow frame.

## Frame

1. **Header.** The application's initial, its name as a switcher (a native
   select laid over the name) and its address underneath. **Hallvi ↗** opens
   the matching page of Hallvi: its Overview from the overview, the
   conversation from the operator. `⋯` holds Refresh and the panel version with
   its update check, nothing else. When the adapter serves a newer panel than
   the one rendered, or a check is asked for, a quiet notice under the views
   says which is shown and which is available, and to reopen Hallvi in a new
   chat or reconnect the plugin.
2. **Two views, Overview · Operator,** as a segmented control. The selected
   segment is raised (surface, hairline ring, short shadow; in the dark it is
   lighter than its track). The Operator segment carries the operator's state
   in a word and a mark, so it stays in sight from the overview: *Working*
   (pulse), *Needs you* (an approval), *Interrupted* and *Not confirmed*
   (amber), *Not running* (grey), *New reply* (blue, until the conversation is
   opened). Under 360px only the mark shows; the tab's accessible name keeps
   the word.
3. The panel opens on the overview. The chosen view survives application
   switches; the conversation keeps its scroll position and the composer its
   draft while the other view is shown.

At every width nothing scrolls sideways; checked at 320, 380, 480 and 760px
(wider frames centre a 640px panel), light and dark, sidebar and in-thread.

## Overview: one row per part

A row is the mark Hallvi's sidebar gives that part, one line of what is true,
its time at the right edge, and **↗** to that page of Hallvi (**→** to the
conversation). No headings, no prose: a row says one thing and links to where
the rest is.

- **Needs you** (the mascot), first and only while the operator is stopped on
  the owner, in amber with the one action that belongs to it: *Interrupted* →
  Continue or stop in Hallvi, *Waiting for your approval* → Decide in Hallvi.
  What the operator is doing or last said is the Operator view's, and its tab
  already says so.
- **Condition.** Hallvi's own condition, in the words of its home page, with
  its tone dot and when the evidence was recorded: the newest check for
  *Checks held*, the judging record for a failure or a warning; an aged pass
  already says its age. Pi's next step is the offer's draft and the row's
  tooltip, not another line.
- **Open requests** (the mascot, not amber). Input Hallvi asked for through
  its cards (a secret, where to run, DNS, how to deploy) and nobody answered,
  with when it was asked and **Review in Hallvi**. A request can outlive the
  work that asked for it, so its presence never says "Needs you" or claims the
  current work is blocked.
- **Deployment** (rocket). What runs, by the Deployment page's own rule (the
  newest release a check proved), and since when; a newer failed or
  unconfirmed attempt beneath it; how it deploys in a few words once chosen.
- **Traffic** (footprints). Views and server errors over 24 hours, the hours
  as bars with uncovered ones hatched and counted, and the two paths with the
  most server errors. Visitors, pages and sources are Traffic's to tell.
- **Setup** (graph). The server and provider, what runs and the source
  repository, and the permission mode as a pill.

**Offers, not alarms.** At most one per concern: *Ask Hallvi about it* on a
failing condition, *Ask Hallvi to check it* on an unchecked or aged one, *Ask
about these errors*. An offer drafts a request, switches to the conversation
and focuses it. It never sends, never replaces a draft already started and is
not offered while the composer could not send.

## Operator

The main conversation, unchanged in what it can do. Its latest five turns come
from any surface: the panel, Codex's own tool calls, the CLI or Hallvi's page.
Earlier turns are a link into Hallvi.

- **The ask** is a right-aligned tint, folded after about four lines. A message
  Pi has not read yet is dashed and says when it will be read.
- **The reply** opens with the small mascot, the time and how long it took.
  What it did is one line that opens ("3 commands and 1 record"); each call
  opens onto its command and an output excerpt, with **Full output** read on
  request through `hallvi_inspect`. Its words render as safe Markdown and fold
  when long; saved records follow as one-line cards. *Copy reply* and *Send to
  Codex* (posted as the user's message; Codex offers no draft) come after it.
- **Now** is written under the reply it belongs to, from records only: the
  running call's intent, place and elapsed time, and its last lines of output.
  After a failed read it freezes as "At 12:07: …".
- **Sending** goes through `hallvi_exec` with a fresh request key: *Send* when
  idle, *Send next* while Hallvi works. The message and key are saved before
  the host is called and the text stays locked until acceptance is known. A
  lost answer keeps them as the draft, marked "Not confirmed", and **Send
  again** reuses the key, which Pi never takes twice. A refusal keeps the draft
  and says why. App switches keep that pending identity even when the sandbox
  denies local storage, and the in-memory draft wins when writes fail but
  storage still reads older text; reopening the panel restores it only where
  the host saved it. A late acknowledgement settles the original application's
  draft, never another one's.

## Decisions stay in Hallvi

Approval waits and interruptions show where they belong (an amber card in the
reply, a row on the overview), each with one way into Hallvi: **Decide** or
**Continue or stop in Hallvi**. Unanswered input requests show above the
composer and on the overview as neutral **open requests** with their original
asking time (or "Request date unavailable" from an older controller) and
**Review in Hallvi**; all of them remain discoverable in Hallvi. The panel
never approves, declines, continues or stops: an MCP host cannot prove that a
person, rather than the model beside it, pressed the button, and the permission
mode is only a promise if its decisions are made where Hallvi knows who decides.

## Links

Deep links use Hallvi's own addresses: `#overview`, `#deployment`, `#traffic`
and `#architecture` on the application's page, `?chat=` for its conversation.
In the Codex desktop app (September 2026), `ui/open-link` opens an HTTPS
address in Codex's browser. For HTTP, which every loopback Hallvi and SSH
forward is, it answers as if it had opened it and does nothing, and the frame
may not open windows. So an HTTP link shows a small popover naming where it
leads, the address, **Copy** and a line about the SSH forward. An application's
own private address says it opens on the machine running Hallvi.

## Honest states

- **Unassessed is not zero or healthy.** "No release is recorded yet". "Not
  counted: traffic history is off", "no access log to read yet" or "Hallvi
  can't read this proxy's log"; "Counting stopped: Hallvi lost the access log".
  An hour the log did not cover is hatched, never an empty bar.
- **Unavailable is not absent.** "Couldn't be read just now" for a failed read;
  "Not counted by this Hallvi version" for a controller without traffic
  history; "Reconnect the Hallvi plugin to see releases" for a panel updated in
  place ahead of its adapter.
- **Stale is said.** After a failed read the last read stays, under "Can't
  reach Hallvi. Showing what was read at …; it may have changed. Retrying…",
  whichever view is open.
- **Empty is one sentence and one action**: a new application, no requests
  yet, no main conversation, no applications, Hallvi's worker not running, no
  host bridge.

## Colour, type, motion

Surface, text, borders and fonts come from the host's MCP Apps style
variables, so the panel sits in Codex rather than on top of it. Hallvi keeps
its blue for action and working, amber only when someone is needed, red only
for something that failed, green only for a verified record or a running
release. Theme follows the host's `theme`, else `prefers-color-scheme`. Motion
is the pulse, the spinners and the disclosure chevrons; each has a
reduced-motion answer.

## Keyboard

Tab reaches the switcher, the address, **Hallvi ↗**, `⋯`, the views, then the
open view. Arrow keys, Home and End move between the views; Enter sends and
Shift+Enter adds a line. Escape closes the menu or the address popover. Redraws
keep a focused control focused.

## Don't

- Don't draw approval, continue or stop controls in the panel.
- Don't turn a failed read, a stopped worker or missing traffic into idle,
  healthy or zero.
- Don't count Hallvi's own failed commands as the application's errors.
- Don't give a row prose; the page it links to holds the rest.
- Don't offer more than one ask per concern, and never send from the overview.

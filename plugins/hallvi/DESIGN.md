---
name: Hallvi plugin panel
description: A compact Hallvi inside an MCP Apps host, built around the main operator.
colors:
  ink: "host --color-text-primary, else #202838"
  muted: "host --color-text-secondary, else #687183"
  line: "host --color-border-secondary, else #e7e9ee"
  surface: "host --color-background-primary, else #ffffff"
  blue: "#285ad8"
  working-bg: "#edf3ff"
  working-text: "#2852a6"
  waiting-bg: "#fff4e9"
  waiting-text: "#9a4b10"
  waiting-line: "#ecd6b8"
  verified-text: "#0f7a4e"
  failed: "#a6312b"
typography:
  body:
    fontFamily: "host --font-sans, else Geist, system-ui"
    fontSize: "13.5px"
    lineHeight: 1.6
  meta:
    fontSize: "11.5–12.5px"
  mono:
    fontFamily: "host --font-mono, else Geist Mono, ui-monospace"
    fontSize: "11.5–12px"
rounded:
  control: "7–8px"
  card: "10px"
  field: "12px"
  pill: "999px"
---

# Design System: Hallvi plugin panel

## North star: "Hallvi at your elbow"

A person working in Codex should be able to turn to the side and talk to the
application's operator: ask for work, watch it happen, read what came of it and
carry on. The panel is that conversation, with the application's condition,
traffic and errors one click away. It is a smaller Hallvi, not a dashboard of
Hallvi: the [workspace design](../../src/components/hallvi/DESIGN.md) remains
the visual authority, and this file records what changes in a narrow frame.

## Layout: one column, three layers

1. **Who and what now.** The application's initial, its name as a switcher
   (a native select laid over the name, so keyboard and screen readers get a
   real control), and a state chip that appears only when there is something to
   say: *Working* (Hallvi's pulsing mark, not a spinner), *Awaiting approval*,
   *Interrupted*, *Worker stopped*, *Can't reach Hallvi*. Idle
   says nothing. `⋯` holds Open in Hallvi, Refresh and the panel version with
   its update check.
2. **One line of context.** Condition, then today's views and server errors
   when traffic history is on. Traffic that is not kept, or Hallvi's own failed
   commands, are not in this line: they are facts for the details, not alarms.
   The line opens **details in place** (not a tab, not a second page): address,
   how it deploys, server, what runs, the permission mode, the last day's views
   per hour with uncovered hours hatched, and errors by path from the access
   log. Escape closes it and returns focus.
3. **The conversation, then the composer.** The latest five turns of the main
   conversation, from any surface: the panel, Codex's own tool calls, the CLI
   or Hallvi's page. Earlier turns are a link into Hallvi.

At every width the composer stays attached at the bottom and nothing scrolls
sideways; checked at 320, 380, 480 and 760px, light and dark, sidebar and
in-thread.

## Panel updates

The menu keeps the rendered version and a stable **Check for a panel update**
action. A neutral notice below the header holds the outcome outside the menu:
which version is shown, which the adapter serves, and how to get the newer one.
It never changes the operator's activity state. A mismatch explains the new-chat
path in Codex and the reconnect fallback, with a reminder to copy unsent text.
A check cannot send work, switch applications or erase a draft. While waiting,
repeat checks are disabled; a host timeout restores retry and preserves the
last known version. Matching panel bytes do not imply an adapter restart.

## A turn

- **The ask** is a right-aligned tint, folded after about four lines. A message
  Pi has not read yet is dashed and says when it will be read.
- **The reply** opens with the small mascot, *Hallvi*, the time and how long it
  took. What it did is **one line that opens**: "3 commands and 1 record", in
  the same words as Hallvi's page. Opened, each call is a row (mark, intent,
  where it ran); opened again, the command and an output excerpt, with **Full
  output** read on request through `hallvi_inspect`. Interim findings Pi wrote
  while working sit between the rows.
- **Its words** render as safe Markdown (paragraphs, lists, code, links, bold).
  Long answers fold with *Show all*. Saved records follow as a one-line card:
  certainty tag, title, checks.
- **Afterwards:** *Copy reply* and *Send to Codex*, which posts the reply to the
  Codex conversation as the user's message (Codex sends it at once; it offers
  no draft) and falls back to copying where the host refuses. This is the
  plugin's native move: Hallvi describes an application problem, the coding
  agent beside it has the repository.

## Now

What is happening is written **under the reply it belongs to**, from records
only, never estimated: *Thinking*, *Writing the reply*, or the running call's
intent and place with its elapsed time, plus the last few lines it has printed.
Nothing else moves. When Hallvi cannot be read, the last line freezes as "At
12:07: …", the clock stops, a pinned banner says what was read when, and the
panel retries with back-off.

## Decisions stay in Hallvi

An approval wait becomes an amber card in the reply, *Awaiting approval*: what
is asked, where it would run, the command, "Nothing runs until you decide", and **Decide in
Hallvi**. Unanswered input requests (a secret, where to run, DNS, how to deploy)
show above the composer as neutral **open requests**, with their original asking
time and **Review in Hallvi**. A request can outlive the work that asked for it;
its presence alone never replaces the operator's state with *Awaiting
approval* or claims the current work is blocked. As in the workspace, nothing
is labelled by who it needs. An older controller without request dates
says the date is unavailable. All requests remain discoverable in Hallvi. Interruption shows **Continue or stop in
Hallvi** and disables the composer with the reason. The panel never approves,
declines, continues or stops: an MCP host cannot prove that a person, rather
than the model beside it, pressed the button, and the permission mode is only a
promise if its decisions are made where Hallvi knows who is deciding.

HTTPS addresses open through the host. HTTP ones, which the installed Codex
host ignores, show a small popover with the address, Copy and a line about the
SSH forward.

## Sending

The composer sends through `hallvi_exec` with a fresh request key: *Send*
when idle, *Send next* while Hallvi works (a queued follow-up, as in the page).
If the answer is lost the message stays as the draft with its key, marked "Not
confirmed", and the button becomes **Send again**, which is safe because Pi
never takes one key twice. A refusal keeps the draft and says why. The hint
under the field names the permission mode. The message and key are saved before
calling the host, and the text stays locked until acceptance is resolved. App
switches keep that pending identity even when the sandbox denies local storage;
reopening the panel can restore it only where the host allows storage. A late
acknowledgement settles the original application's draft, never another one's.

## Honest states

- Empty conversation: a short invitation and two suggestions that fill the
  composer, never send.
- Worker stopped: the conversation cannot be read; that is said, not drawn as an
  empty or idle conversation.
- No traffic history: "not being counted, which is not a claim there were
  none", with an offer to keep it in Hallvi.
- No applications, no main conversation, no host bridge: one plain sentence and
  the one useful action.

## Colour, type, motion

Surface, text, borders and fonts come from the host's MCP Apps style variables
(Codex supplies them), so the panel sits in Codex rather than on top of it.
Hallvi keeps its own blue for action and working, amber only when someone is
needed, red only for something that failed, green only for a verified record.
Theme follows the host's `theme`, else `prefers-color-scheme`. Motion is the
pulse, the spinner on the running line and disclosure chevrons; each has a
reduced-motion answer.

## Keyboard

Tab reaches the application switcher, `⋯`, the context line, each disclosure
and reply action, then the composer. Enter sends, Shift+Enter adds a line.
Arrow keys move in the menu; Escape closes the menu, the address popover or the
details, returning focus. Redraws while Hallvi works keep a focused disclosure
focused.

## Don't

- Don't add tabs for overview, traffic and errors; they are context for the
  conversation.
- Don't draw approval, continue or stop controls in the panel.
- Don't turn a failed read, a stopped worker or missing traffic into idle,
  healthy or zero.
- Don't count Hallvi's own failed commands as the application's errors.

---
name: Hallvi settings
description: A sidebar of four pages, each a raised summary over grouped rows; chosen 30 September 2026.
colors:
  canvas: "#f5f7fb"
  surface: "#ffffff"
  ink: "#202838"
  muted: "#687183"
  line: "#e7e9ee"
  primary: "#285ad8"
  link: "#315bc6"
  selected: "#e8edf7"
  verified: "#14945f"
  waiting: "#9a4b10"
  error: "#a6312b"
typography:
  body: {fontFamily: "var(--font-geist-sans), system-ui, sans-serif", fontSize: "14px"}
  page-title: {fontSize: "24px", letterSpacing: "-0.025em"}
  summary-title: {fontSize: "24px", letterSpacing: "-0.02em"}
  code: {fontFamily: "var(--font-geist-mono)", fontSize: "30px", letterSpacing: "0.12em"}
rounded: {summary: "16px", rows: "14px", row: "10px", button: "8px"}
---

# Settings design reference

**Settings is a sidebar of four pages (30 September 2026).** Connections,
Model, GitHub and Workspace sit in a left sidebar with icons, the way Claude's
settings are laid out; the page is on the right. Every page has the same three
parts: a raised **summary** that says in one line where things stand (what
Hallvi thinks with, who is signed in to GitHub, where Pi works, whether Hallvi
can work at all), then **grouped rows** — an icon, a name, one line of state and
one action — then fine print and the Storage & privacy popover. The owner chose
this from a switchable prototype: direction A ("model first") for Model, the
same language for the other pages, and the sidebar over top tabs. The
alternatives are on the `prototype/model-settings` branch.

The implementation is the source of truth: [shell and toast](../../src/components/hallvi/settings-shell.tsx),
[settings styles](../../src/components/hallvi/settings.module.css), and the four
screens. The popover, confirmation and inline sign-in cards keep their own
styles. The [application design reference](../../src/components/hallvi/DESIGN.md)
owns the product's overall visual language.

## Behaviour

- **Choices apply when they are made.** Picking a model, a reasoning effort or
  a workspace saves at once and says so in a small toast ("Saved · the next
  message uses Claude Sonnet 5"), as Claude and Codex do. There are no Save
  buttons and no footer; the top bar's way out returns to the conversation
  Settings was opened from, or to the applications.
- **Calm by default.** Not set up is an offer: quiet buttons, dimmed rows. Blue
  is kept for what someone is needed for — no model at all, or a credential
  that stopped working — and amber only for the latter.
- **Connection lifetime.** Cancelling or replacing a pending sign-in — or
  saving another model meanwhile — prevents its later callback from changing
  the account or model. Once a turn starts, it keeps its OpenRouter key in
  memory until that turn ends; replacing or disconnecting the saved key applies
  to future turns. A saved ChatGPT connection remains usable when an unused
  OpenRouter credential file is damaged, and connecting OpenRouter recovers
  invalid model settings while keeping a valid ChatGPT connection.
- **Saved is not proven.** A login or key is "saved" and "checked when you send
  a message", never "working", until a message has used it.

## Pages

- **Connections** — the summary counts what is connected and says what Hallvi
  can do ("Connect a model to start", "Hallvi can read and plan", "… and
  deploy"), with a strip of the six icons. Two groups: *Hallvi* (Model, GitHub,
  Workspace) and *Your providers* (Hetzner, Cloudflare, backup storage), then
  the recovery kit when there is one. A row that is not connected opens its
  form or the same sign-in card the conversation draws, in place; a row that
  holds a login links to its page.
- **Model** — the summary is "Thinking with" the active model, its account and
  price, and the reasoning effort as a segmented control. Below, every model
  grouped under the account that pays for it: ChatGPT (subscription; its
  newest generation first, older ones folded) and OpenRouter (pay per use; the
  curated `OPENROUTER_MODEL_IDS`, prices per million tokens). Each account's
  header carries its state and its sign-in; a model from an account that is
  not connected is dimmed, and picking it starts that account's sign-in. Only
  a usable model wears the check. Connecting OpenRouter makes it active;
  disconnecting either hands new messages to the other. Hallvi never switches
  between them by itself.
- **GitHub** — the summary is the account: "Public repositories just work" with
  a quiet sign-in, the device code while signing in (copy, open, expiry,
  cancel; the account still in use named while replacing it), or who is signed
  in with Choose repositories, Change and Disconnect. Below, repository checks
  as rows, then what the Hallvi App may do in three lines: read code, propose
  changes as a pull request, never merge.
- **Workspace** — the summary says where Pi works; the two places are
  selectable rows with Docker's state beside the second. A Docker choice that
  cannot be met says so without offering to switch. What each protects folds
  away.

## Layout

A 220px sidebar and a content column up to 700px, centred, under the shared
56px top bar (`hv-setup-topbar`). Below 860px the sidebar becomes a row of
pills above the page and the summary stacks. The summary is the only raised
surface (soft shadow, faint blue gradient); rows sit in one white, hairlined
list per group. The visible focus outline is 2px primary blue, offset 3px.

## Do's and Don'ts

- **Do** add a new page as a sidebar entry built from the same summary and
  rows, and keep one action per row.
- **Don't** bring back Save buttons, walls of explanatory copy on the page, or
  a blue button for something optional.

# Experience diagnosis · the craft pass

Written before any code changed, from using the product as its user against the
three real applications (Getting Started, Shop, Metrics) at 1440px and 1180px.

## The archetype

A solo technical founder deploying small and medium applications. Fluent in
GitHub, Docker, environment variables and domains; deliberately not a server
administrator. They delegate infrastructure to Server Guy and keep the
consequential decisions. Four questions, every time they open it:

1. What is true right now?
2. How does Server Guy know, and when was it checked?
3. What needs my attention?
4. What can I safely do next?

The product already answers these **truthfully**. The presentation contract,
the five tones and the record model are sound and stay. What this pass fixes is
that the answers are frequently not the most prominent thing on the screen.

## The one diagnosis

**Hierarchy is inverted on the surfaces that matter most.** In almost every
case the machinery of how Server Guy knows something outranks what it knows.

| Surface | Largest thing | The thing the user came for |
| --- | --- | --- |
| Application list | An identical mascot, then an identical fake-browser illustration | "3 need you", last line, smallest type |
| Overview | A 330px timeline chart carrying three unlabelled digits | "A check did not pass", muted, inside a lane caption |
| Overview | The dark recorded-work log — the loudest block on the page | It is history, and the least actionable content there |
| Chat | Six grey tool-activity rows between Pi's plan and its conclusion | A **failed** provider request, collapsed inside one of them |
| Deployment | A raw JSON payload as the step description | What actually happened at that step |

That is one problem with one cause: components render what the record *is*
rather than what the reader *asked*. Fixing it does not need a new data model.

## Findings, in the brief's priority order

### 1–2 · Chat and action-required

- **A failure hides inside a collapsed group.** `Requests · at Hetzner · 1 · 1 failed`
  is a grey row identical to five others. A failed call is the one piece of
  activity that must not be quiet.
- **Activity interrupts the argument.** Six group rows sit between "I'll inspect
  the DNS provider's record…" and "Current state:", so the explanation and its
  conclusion are separated by machinery.
- **The group labels repeat and under-inform.** "Commands" appears three times
  with different qualifiers; the counts are mostly `1`. "File reads, records"
  is a comma-joined compound, not a phrase.
- **The jump-to-latest button overlaps the transcript**, obscuring a row of the
  facts table beneath it.
- **The permission control is a bare segmented toggle** pinned under the top
  bar. `Bypass` — execute without asking — is selected and styled as a solid
  dark chip, with nothing stating the consequence. It looks like a view filter.
- **The record's state is a ~3px left bar.** The design system's own rule is
  "tint the border, never lift"; a heavy left rule is neither, and the craft
  floor refuses it outright.
- **The facts grid is ragged.** Two label/value pairs on some rows, one on
  others, long values spanning both columns. No scan pattern survives it.

### 3 · Overview and Deployment

- **Three stacked headings**: the top bar says Overview, the page says
  Overview, then "Getting Started web".
- **The timeline hero is decorative.** Four lanes, five gridlines, two day
  columns, ~330px — carrying three bare digits whose meaning exists only in
  their `aria-label` ("9 checks, today at 11:38"). The lane captions beside it
  carry the entire informational load.
- **Little Server is clipped by the viewport edge** on Overview and floats
  unanchored on Deployment.
- **Deployment renders raw JSON as step detail** —
  `{"command":"set -euo pipefail\ncurl -fsS …` — from
  `execution.input.split("\n")[0].slice(0, 140)`. A `plain()` unwrapper already
  exists in `pi-activity.tsx`, whose own docstring says this exact string "is
  not readable". It was never shared.
- **The same paragraph appears twice** on Deployment, in the summary and again
  in the "Now" timeline entry.
- **"Last verified" is not one of the five tone words** and reads ambiguously.
- **"Latest logs · collected 3 h ago"** is a heading with a timestamp and no
  content beneath it.

### 4 · Architecture

Architecture is the strongest page in the product. "Follow: a visit / your data
/ a release" is a genuinely good idea and stays. Its defects are local:

- **"Nothing is watc…"** truncated mid-word.
- **The SSH tunnel label straddles a container border**, sitting across the
  edge of the group it is not in.
- **"Off the server"** floats in whitespace, its dashed connector crossing the
  host boundary.
- Node times are absolute ("Checked 11:57 AM") where the rest of the product is
  relative ("7 h ago").

### 5 · The application list

- Inverted hierarchy as above, plus **"Shuffle", "Show me a dance" and "Pause
  animations"** on the surface a user returns to in order to check on their
  software.
- **No health, no last-checked, no attention count above the fold.** This is
  journey step 11 — "returns later and immediately understands current health"
  — and the page opens with a marketing headline.

## The governing principle · prefer visual comprehension

Audit every component and ask whether the user is being made to **read** prose,
metadata rows or repeated labels in order to reconstruct a relationship,
sequence, hierarchy, comparison, boundary, state or change. Where the same
meaning lands faster through spatial composition, a diagram, a timeline, a
flow, grouped signals, direct labelling or progressive disclosure, redesign the
component around that form.

This is not a licence to add charts, icons or illustrations. A visual must
reduce cognitive work and express real structure already in the data.
Decorating a text-heavy component while leaving the reading burden unchanged is
the failure mode, not the goal — and it is precisely what the current Overview
timeline does.

Concise prose carries the verdict, the essential context and the next action.
Identifiers, timestamps, raw evidence and supporting detail stay available on
demand rather than at equal prominence. Duplicated explanations go, and
position, grouping, scale, connection and state treatment carry the meaning
instead.

Apply the judgement to each component on its own terms — chat, approvals,
progress, architecture, deployment, processes, data, storage, backups,
monitoring, domains, CDN, security, history and logs — choosing the form that
fits, rather than forcing the product into one card, diagram or dashboard
template.

### Where prose is currently doing a diagram's work

| Component | The structure hiding in it | Form it wants |
| --- | --- | --- |
| Chat activity groups | A sequence across three *places* — your server, a repository copy, Server Guy's records | Grouped by place, with the sequence visible and failures marked in the margin |
| Record facts grid | Label/value pairs with no scan rhythm | Aligned pairs on one measure; long values given their own full-width row |
| Overview lanes | Four subjects, each with a state and a last-checked time | The lane *is* the visual; the empty chart around it is not |
| Deployment steps | An ordered sequence with durations and outcomes | The existing spine, with human descriptions instead of payloads |
| Domains | DNS configured → resolves → application answers: three gates in order | A progression where the gate that failed is visibly the one that failed |
| Security | Concentric exposure — internet, network, host, container | Already rings; keep and tighten |
| History | A sequence of outcomes over time | Rhythm of outcomes, not a uniform list |

## Principles for the pass

1. **Answer before evidence.** The verdict is the largest text on a page; the
   machinery that produced it is available and secondary.
2. **A failure is never quiet.** No failed call, check or request may be
   indistinguishable from a successful one at a glance.
3. **Say it once.** One heading per page, one statement of a fact per screen.
4. **Never print the envelope.** No JSON, no tool names, no escaped newlines
   where a human sentence is possible.
5. **A picture must beat its sentence.** A diagram that carries less than its
   own caption becomes the caption.
6. **Personality where it helps comprehension**, and nowhere it competes with
   the answer.

## Explicitly unchanged

The sidebar's information architecture, grouping, order and "Show more";
the conversation-navigation model; the presentation contract and record model;
the five tones and their meanings; the honest secret boundary; private access
by default. Architecture's map and "Follow" tabs, and Deployment's "How it got
here" spine, are good ideas kept and repaired rather than replaced.

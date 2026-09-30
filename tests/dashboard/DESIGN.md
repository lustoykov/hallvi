---
name: Hallvi testing dashboard
description: Local developer checks, saved eval review, and source-based architecture learning.
colors:
  blue: "#285ad8"
  blue-deep: "#204ab5"
  blue-bg: "#e5edfc"
  ink: "#192338"
  muted: "#5d6981"
  line: "#e1e6ef"
  line-2: "#eceff5"
  line-strong: "#c9d3e2"
  paper: "#f6f8fb"
  panel: "#f0f3f8"
  nav-top: "#edf1f9"
  nav-bottom: "#e6ecf7"
  nav-text: "#344363"
  surface: "#ffffff"
  green: "#11633e"
  green-bg: "#e3f3e9"
  red: "#9b222b"
  red-bg: "#fdeaea"
  amber: "#815018"
  amber-bg: "#fff0db"
typography:
  body: { fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', fontSize: "14px", lineHeight: 1.5 }
  reading: { fontSize: "15px", lineHeight: 1.55 }
  section: { fontSize: "20px", fontWeight: 700, lineHeight: 1.25, letterSpacing: "-.01em" }
  answer: { fontSize: "20px", fontWeight: 700, letterSpacing: "-.015em" }
  label: { fontSize: "12px", fontWeight: 600 }
  chip: { fontSize: "12px", fontWeight: 600 }
rounded:
  control: "7px"
  chip: "5px"
  card: "12px"
  surface: "10px"
  row: "6px"
components:
  button-primary: { backgroundColor: "{colors.blue}", textColor: "{colors.surface}", rounded: "{rounded.control}", padding: "7px 14px" }
  button-secondary: { backgroundColor: "{colors.surface}", borderColor: "{colors.line-strong}", textColor: "#234577", rounded: "{rounded.control}", padding: "7px 14px" }
  chip: { rounded: "{rounded.chip}", padding: "1px 7px" }
---

# Design System: Hallvi testing dashboard

## Overview

This document applies only to the loopback developer dashboard in `tests/dashboard/`, not the Hallvi product UI. It is an Operate surface: an engineer runs fixed checks and grades saved answers, so scanability and a fast review loop outrank expression. Implementation authority: [styles](dashboard.css), [markup](dashboard.html), and [behavior](dashboard.js).

Learn Hallvi (`/learn`) extends that same world with a Read and Operate destination for understanding Hallvi’s architecture. Its [page](learning-page.ts), [styles](learning.css), [interactions](learning.js) and [source/progress model](learning.ts) own the learning-specific details below. A separate scheduled Codex task reviews merged repository sources and saves the learning catalog. The page reads that content and records local progress; it does not operate Hallvi applications or establish runtime health.

## Colors

Blue marks primary actions, links, the selected tab, the open run/answer, and keyboard focus. Ink and muted text set hierarchy on paper, panel and white surfaces; a pale blue gradient, as in the product navigation, sets the sidebar apart from the page. Verdicts use one vocabulary everywhere: green pass, red fail, amber needs-discussion, and a dashed outline for "to review". A human verdict is a filled chip; LLM advice is the same color as an outline-only chip, so advisory output never looks like sign-off. Automatic outcomes reuse green/red for checks passed/failed.

Learning reuses blue for selected topics, map components, connected edges and answers. Learned status is green; changed material is blue; other learning statuses stay muted. Grading adds the existing green/red fills to correct/incorrect options and an explicit result sentence, so color never carries the answer alone.

## Typography

System stack only. UI chrome runs at 14px, labels and chips at 12px, and the material a reviewer reads (rubric, engineer message, answer, advice) at 15px with a 78ch measure. Section titles are 20px; the open answer's title is 20px so the case name, not the run, is the largest thing on screen. Tabular numerals throughout.

Learning keeps this stack and quiet metadata. The question and its definition lead the reading hierarchy; explanations and concept descriptions keep a bounded measure. Source paths use the existing monospace treatment where rendered as code, and long paths wrap rather than widen the page.

## Layout

Desktop baseline: a fixed 232px sidebar, rendered once by `sidebar()` in [markdown.ts](markdown.ts) for every page: the brand as a home link with a small uppercase "Dev" tag, then the destinations in four labeled groups (Checks: Run checks, Eval archive, How it works, Acceptance guide; Learn: Learn Hallvi; Environment: Development, Releases; Agents: Agent feedback, Agent features), each a 16px line icon and label, the current one on a white raised row with a blue icon, Eval archive carrying the amber count of answers needing attention; at the bottom, the external Open app link with a hidden new-tab hint and the local origin in muted figures. Content is centered beside it (1440px maximum), 40px side padding. At 760px and below the sidebar becomes one horizontally scrollable row above the page, without group labels or icons. Each page opens with its h1 and a one-line description. Run checks is a suite table, then a recent-runs list with an inline output panel. How it works (`/about`) is a Read page: one comparison table across the four suites (rows are the guide's fields, columns the suites), then the AI-usage notes and the file map, with no disclosures. Review is a two-column grid: a 380px sidebar (runs, then the open run's answer queue) and a flexible main column holding the run panel (tinted, with the run's actions and triage bar) above one white answer card, so run-level and answer-level controls never sit on the same surface. The sidebar is sized to the viewport space below the page heading and sticks while the page scrolls; it scrolls in two regions, runs (capped near a third of the viewport) and the answer queue (the remaining height), so nothing runs below the fold and the open answer stays in view while browsing the queue. The answer header wraps long titles without overlapping Previous/Next; longer evidence uses the page scroll. Check-running and eval-review flows have no mobile layout contract.

Learn Hallvi is the responsive exception. Its Architecture / Quiz / Your progress links sit below the heading and freshness region, opposite the local-progress status. The freshness region is one wrapping meta line: a green dot with the reviewed source identity and time, then quieter text for the last source check and the daily Codex task. A blue disclosure below summarizes the last review. The Quiz tab carries its due count as a small pill. Architecture places the map above one card of topic disclosures separated by hairlines; saved progress uses the same card. Quiz uses a 260px topic queue and one flexible question column with a 40px gap. At 760px and below, headings and toolbars stack, side padding becomes 18px, and a labeled native Topic select replaces the queue. Question actions wrap without losing their order. The map keeps readable node labels inside its own horizontal scroll region; its connection details stack below it. History summaries wrap their title, state and date. These accommodations do not extend the learning layout contract to other dashboard flows.

## Elevation & Depth

Hairline borders with two soft shadows: a 1px lift on rows, secondary buttons and the current navigation item, and a slightly deeper one on cards, tables and documents. Table headers use small uppercase labels on the paper tone. Dialogs use a dim navy backdrop.

## Shapes

Cards, the answer card and dialogs use 12px radii; controls 7px; chips 5px; queue rows 6px. Segmented verdict controls are one bordered pill divided by hairlines.

The existing report surface, also used for the learning map and question, has a 10px radius. Learning answer options and map nodes use the control radius. Topic and history disclosures remain flat rows separated by hairlines.

## Components

- Suite table: a plain table of actions with no disclosures inside it. AI usage uses quiet "No AI calls" text and an amber "Uses subscription" chip; "CI" separates the primary schedule from a short secondary line; "Last result" shows the latest run. Suite actions share one width and height. Explanations, AI-usage notes and the file map live on the How it works page.
- Recent runs: the latest eight rows, then "Show all N runs". A judge row names the run it judged, and an open output panel stays visible even when its row is older than the fold. A failed live run's output says how many answers were saved, whether any failed their checks and whether sources changed while it ran, since the runner's own output is hidden.
- Suite explanations: the suite name is a keyboard-accessible disclosure, separate from Run/Choose actions. One explanation opens directly below its row, using the same fields for execution, real and simulated dependencies, database and state lifecycle, checks/review, and limitations. Lifecycle copy says which state is shared, which state is reset, gives a concrete cross-test example, and says whether temporary data is deleted or retained after the run. Code paths, commands and saved output locations sit behind a further disclosure. Reading never starts a runner.
- Navigation: the sidebar's Run checks / Eval archive links mark the current page with `aria-current`; the Eval runs link carries the amber count of answers needing attention in active runs, and "View saved runs" under the Live agent evals suite opens the same page. Both URLs load directly; ordinary link clicks preserve in-memory drafts/selections while updating browser history, title and heading focus. Modified clicks use native new-tab behavior. Generating eval answers and judging saved answers are always separate actions.
- Run cards: date, model/effort, answer count, then an amber "N need attention" or green "Nothing needs attention" segment followed by the LLM-cleared and human-reviewed counts, so runs compare at a glance; while the judge works through a run, its first segment reads "Judging now". A live run in progress appears first as a dashed "Running now" card with its scope and elapsed time; its answers exist only when the runner finishes. No automatic clearance is labeled as human approval. The open run is tinted blue. Archived runs stay in a collapsed disclosure with Archive/Restore in the open run's header.
- Run header: "Run from <date>", the saved plan (cases × repetitions = planned, answers saved, commit, local-changes flag), one Judge action (labeled with what it will judge: the unjudged answers, or everything again) and Archive/Restore run, then one bar of the run's triage (red failures, amber needs review, gray not judged, light-green LLM-cleared, green human pass) with a text line (“N need attention · N LLM-cleared · N of M human-reviewed · judge agreed A of B”); while a judge run is grading this run the line leads with “Judging now · N of M judged” and unjudged answers say they are still queued. A run whose fingerprinted sources changed mid-run carries a notice that the runner's failure says nothing about the answers. The Judge button is primary only while unjudged answers remain; afterwards it is a secondary "Judge these N again…" for the current filter's answers, or "Judge run again…" for the whole run under All. When a run has more than one repetition the header explains that each case was answered N times from a fresh application.
- Answer queue: one row button per answer that opens it; the open row is tinted. Runs with several repetitions group rows under the case name and label rows "Repetition n"; single-repetition runs list case names directly. Rows show the derived triage status: not judged is a quiet hollow dot, every other status (Needs review, Failed checks, LLM fail, Human fail/pass, LLM-cleared) a labeled chip; an outlined "LLM" chip marks advice that did not clear the answer. Filter counts apply to the current run; there are no checkboxes or bulk actions.
- Answer card: title, a meta line with the case id, model/effort and "Run case again…", and Previous/Next with "n of N"; one status line (triage chip plus its reason); the rubric in a panel (today's casebook wording, with the wording saved at run time behind a "Wording changed since this run" disclosure when they differ); the conversation as an inset chat area on the paper tone, the engineer's turn in a blue-tinted bubble and Hallvi's in a white bordered one, each labeled by speaker; then a separate evidence section with proposed decisions rendered as kind chips plus values (and what they replace) and collapsed automatic checks and recorded state; then LLM advice; then the verdict form. Decisions recorded before the message appear in an amber context panel.
- Verdict: one row with three one-click buttons, Pass / Fail / Discuss, each showing its shortcut key (P / F / D) and an "LLM" tag on the button that matches the saved judgment. A click saves immediately (no name, no reason) and advances to the next row of the queue; the saved verdict stays pressed with "Saved · <time>". "Add a note" reveals an optional note saved with the next click; notes survive switching answers until saved. J/K move through the queue.
- Judge-first triage: sidebar filters Attention (default), Failed, Cleared, Reviewed, All, each with a count on one line. Attention includes not judged, uncertain and failed answers. Landing on a run with nothing needing attention shows All with a one-line note instead of an empty queue; a manually chosen filter with no matches offers "Show all answers". Current-policy clearance requires recorded checks to pass. The triage label/reason is distinct from the human verdict; the header text counts human reviews separately from clearance. Spot-checking is just opening Cleared. Calibration guidance is collapsed under "How triage works" at the bottom of the sidebar.
- LLM judgment: verdict chip, an amber "Older rubric wording" chip when the casebook wording has changed since, model/effort/time, the reason's first sentence in bold with the rest behind a "Full reasoning" disclosure that stays open per answer, and one small secondary button at the right, "Judge this answer…" or "Judge again…", for this repetition. The run header's Judge button is the only run-wide control and counts only queued answers without a current judgment. Judgments never fill or change the human verdict.
- Paid actions: live evals and judging open one dialog: what will run, "Uses <model> at <effort> effort" with a Change disclosure for the fields, the selection and limits collapsed, and a single Start button. A live run's dialog adds "Judge the answers automatically when the run finishes", ticked by default.
- Pickers: suite scope selection uses native dialogs with one-column checklists, a scrollable body and a visible footer; closing keeps selections. Eval cases have searchable, collapsible categories; a tri-state checkbox beside each category name selects that group's visible cases without expanding it, and rows carry compact names plus their last outcome and date (Failed, Needs review, Not judged, LLM-cleared or Human pass, with "rubric changed" when today's wording differs); expected behavior and input sit behind a disclosure. Only cases without a saved attempt are selected by default, including archived history; skipped or merely planned cases remain unrun. Polling updates this default until the user makes a manual selection; Select unrun restores it. Select failed last time and Select rubric changed are the other presets; each carries its count and is disabled at zero. Categories containing unrun cases start expanded. Eval repetitions default to one, with 2–5 available explicitly.
- Single-case rerun: "Run case again…" sits under the answer title, separate from the saved-answer judge. It always runs once, using current code/case definitions in a new run with fresh spending consent. Original answers and verdicts stay intact. Cases that failed before replying can rerun; a removed case has a disabled button and explanation.

### Learn Hallvi

- Navigation and source identity: `/learn` opens Architecture, with hash links for Quiz and Your progress and `aria-current` on the selected view. The heading shows Start learning or Continue learning outside Quiz; Quiz reserves the primary action for the current question. A freshness region identifies the reviewed main commit and time, the most recent main check and the daily Codex task. Before the first successful review, it explicitly labels local extraction as starter content.
- Saved review: **The Saved Review Rule.** Keep catalog maintenance visible through saved source metadata and the “What changed in the last review” disclosure. A newer checked revision is labeled as awaiting review in Codex. Review stages, failures and manual review requests belong in Codex; the page reads the saved catalog and records answers. Opening the page and answering questions never start an agent.
- Source transparency: a separate scheduled Codex task reviews merged main daily, even with the dashboard closed; the computer and Codex app must be running. “How this stays current” explains this schedule, asking Codex for an earlier review, local storage and the content lifecycle. A failed review leaves the prior catalog available. Source links open the cited commit and line, and Architecture notes opens the documentation at the reviewed commit. Unchanged questions can retain an older citation. Model explanations are not runtime verification. Unchanged knowledge keeps its question version and saved progress; materially changed facts get a new version, and removed concepts remain in history. Planned concepts retain their qualifications.
- Architecture map: selectable nodes expose their pressed state and highlight their incoming/outgoing edges. Connection names appear in text below the diagram as "Receives from" and "Connects to"; selecting one selects that component. Labels wrap to fit the node interior, and node height accommodates the longest label. Tab reaches the scroll region and each node; Enter and Space select a node, with focus retained on that node after redraw. The connection details announce changes politely.
- Concept list: searchable, native topic disclosures show learned/total counts and one Learn this topic action. Definitions and explanations remain readable without starting a quiz. Every concept carries a source link and a text status. Search reveals matching topics and gives an explicit empty result.
- Single-question loop: a topic queue shows due counts and prioritizes changed material. Learned and archived questions leave that queue. Native radio options support one answer, with Check answer as the single primary action; Later and Archive question are quiet alternatives. Grading then reveals the answer, explanation and source, replaces the action with Next question, and keeps incorrect answers in the queue. Later defers a question within the current session; Archive removes that version until restored or its learned material changes. A completed queue links to the architecture and saved progress.
- Progress and history: flat disclosures preserve the original question, answer, attempts, last selected answer and completion date. Filters distinguish Learned, Still learning, Archived, and Changed or removed. Earlier versions and removed concepts are labeled as history and cannot be restored into the current quiz; current archived questions offer Restore question. Learning progress stays separate from Hallvi application data and Git-tracked files.
- Focus and recovery: use the inherited visible blue focus outline, including in the sidebar. Starting a topic or moving to another question focuses its heading; grading focuses the result heading, and a history action retains focus on that row. Saved-content polling leaves unchanged content in place. When changed content replaces the markup, restore focus to the same logical control if it survives; within the question, fall back to the new question heading when the question changes or the former control is absent or disabled. Result/status messages use live regions. A save is presented as successful only after read-back; a failure focuses the error, preserves saved progress and gives retry guidance. Unavailable or saving states disable answer mutations instead of implying they succeeded.

## Do's and Don'ts

- "Run new evals only (N)…" is prominent on both Run checks and Eval runs. It uses only case IDs with no saved attempt on this machine (archived runs count), one repetition, and the normal confirmation with automatic judging enabled. With zero eligible cases it gives way to a status line ("All N cases have a saved answer"); it never falls back to the full suite. Choose cases remains available for explicit reruns. This is history-based, not a diff of case revisions or a branch comparison.

- Do keep human verdict, LLM advice and automatic checks separately labeled and differently styled.
- Do keep the queue on the left, one answer on the right, and the verdict at the bottom of the card; the queue scrolls inside the sticky sidebar so the open answer stays in view.
- Do state costs next to paid actions; reading Learn Hallvi and grading questions do not use a model. Catalog maintenance runs separately in Codex.
- Do keep learning source identity, freshness and source links visible, and distinguish documented knowledge from runtime verification.
- Do keep one primary action in the quiz and retain the original content of earlier question versions in history.
- Don't extend the learning-only responsive exception into a new mobile contract for check-running or eval-review flows, a new visual identity, or product-wide design rules.
- Don't default the verdict control; a saved verdict must be an explicit choice.

## Development and Releases

Two read-only pages, added beside Run checks and the Eval archive. They use
the same surface, footnote and chip vocabulary as the rest and introduce no
new colours: `.surface` cards, a `.facts` definition list of one fact per row,
`.warn` for something that needs a person and `.ok` for a check that passed.

Three rules they follow, which are the reason they are worth having:

- **Report, do not operate.** No SQL, no bulk actions, no credential values.
  The only two buttons dispatch the existing release workflow and publish a
  draft that already exists.
- **Registered things only.** The database shown is the one the development
  environment's register names. Nothing scans the machine for databases, and
  Hallvi's own records are kept visually distinct from the applications' own
  databases on their own host.
- **Measure, do not assume.** The running Hallvi's serving directory is read
  from the process rather than assumed to be this checkout, and an archive's
  contents are read from the archive once one has been built — before that the
  page says it is showing a plan.

They are read when their page is opened rather than polled: nothing on them
changes by itself except a workflow run, and `gh` every 2.5 seconds would be
rude to the laptop and to GitHub.

Agent feedback (`/feedback`) and Agent features (`/features`) are separate
read-only document pages with their own links in the sidebar's Agents group. The
current document link carries `aria-current="page"`; both pages preserve the
Acceptance guide reading layout and typography. Feedback renders
`AGENT_FEEDBACK.md`, the raw observations, bugs and wishes collected during
ordinary tasks, with its active request table, +1 counts and statuses. Features
renders `AGENT_FEATURES.md`, which owns researched proposals, proposal status and
the owner's selection and assignment. Its overview shows +1 counts backed by
references to independent tasks; votes express interest, not priority or approval.

Closed feedback and Done or Declined features live in a final `Archive` section,
preserving their original entries, votes and fix or decision references. Either
document's archive renders as a native disclosure, collapsed by default, with the
entry count in its summary. It keeps the existing heading styles and visible
keyboard focus; Return toggles it. Original fragment IDs remain intact, and a
link to an archived heading reveals the entry. The disclosure uses no client
script; manual expansion is not persisted across reloads.

Both pages render their canonical local file on every request, preserving tables
and fragment links to headings. Reloading shows local edits; changes move between
worktrees through merges. Repository links open GitHub main. A missing or
unreadable file keeps the shell and shows a recovery message to check the file
and reload. These pages add no editing controls or visual system changes.

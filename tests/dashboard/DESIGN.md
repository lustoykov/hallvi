---
name: Server Guy testing dashboard
description: Desktop-only local developer checks and a review queue for saved live eval answers.
colors:
  blue: "#285ad8"
  blue-deep: "#204ab5"
  blue-bg: "#e5edfc"
  ink: "#192338"
  muted: "#53617a"
  line: "#d8e0ec"
  line-strong: "#b7c6dd"
  paper: "#f5f7fb"
  panel: "#eef2f8"
  shell: "#172238"
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
  row: "6px"
components:
  button-primary: { backgroundColor: "{colors.blue}", textColor: "{colors.surface}", rounded: "{rounded.control}", padding: "7px 14px" }
  button-secondary: { backgroundColor: "{colors.surface}", borderColor: "{colors.line-strong}", textColor: "#234577", rounded: "{rounded.control}", padding: "7px 14px" }
  chip: { rounded: "{rounded.chip}", padding: "1px 7px" }
---

# Design System: Server Guy testing dashboard

## Overview

This document applies only to the loopback developer dashboard in `tests/dashboard/`, not the Server Guy product UI. It is an Operate surface: an engineer runs fixed checks and grades saved answers, so scanability and a fast review loop outrank expression. Implementation authority: [styles](dashboard.css), [markup](dashboard.html), and [behavior](dashboard.js).

## Colors

Blue marks primary actions, links, the selected tab, the open run/answer, and keyboard focus. Ink and muted text set hierarchy on paper, panel and white surfaces; shell navy anchors the topbar. Verdicts use one vocabulary everywhere: green pass, red fail, amber needs-discussion, and a dashed outline for "to review". A human verdict is a filled chip; LLM advice is the same color as an outline-only chip, so advisory output never looks like sign-off. Automatic outcomes reuse green/red for checks passed/failed.

## Typography

System stack only. UI chrome runs at 14px, labels and chips at 12px, and the material a reviewer reads (rubric, engineer message, answer, advice) at 15px with a 78ch measure. Section titles are 20px; the open answer's title is 20px so the case name, not the run, is the largest thing on screen. Tabular numerals throughout.

## Layout

Desktop only: a 56px navy topbar: the brand as a home link with a small uppercase "Testing" tag, a hairline divider, the page switch (Run checks / Eval runs / How it works as pill links, the current one on a translucent background, with an amber count of answers needing attention), then on the right the local origin in muted tabular figures, the Acceptance guide (rendered in the same shell at `/guide`, underlined when current) and the external Open app link with a small arrow icon and a hidden new-tab hint; centered content (1440px maximum), 36px side padding. Each page opens with its h1 and a one-line description. Run checks is a suite table, then a recent-runs list with an inline output panel. How it works (`/about`) is a Read page: one comparison table across the four suites (rows are the guide's fields, columns the suites), then the AI-usage notes and the file map, with no disclosures. Review is a two-column grid: a 380px sidebar (runs, then the open run's answer queue) and a flexible main column holding the run panel (tinted, with the run's actions and triage bar) above one white answer card, so run-level and answer-level controls never sit on the same surface. The sidebar expands fully in normal page flow, with no nested scroll area hiding answers. The answer header wraps long titles without overlapping Previous/Next; longer evidence uses the page scroll. There is no mobile layout contract.

## Elevation & Depth

Flat surfaces: borders and tonal fills, no shadows, except a faint offset shadow on Server Guy's reply bubble in the conversation. Dialogs use a dim navy backdrop.

## Shapes

Cards, the answer card and dialogs use 12px radii; controls 7px; chips 5px; queue rows 6px. Segmented verdict controls are one bordered pill divided by hairlines.

## Components

- Suite table: a plain table of actions with no disclosures inside it. AI usage uses quiet "No AI calls" text and an amber "Uses subscription" chip; "CI" separates the primary schedule from a short secondary line; "Last result" shows the latest run. Suite actions share one width and height. Explanations, AI-usage notes and the file map live on the How it works page.
- Suite explanations: the suite name is a keyboard-accessible disclosure, separate from Run/Choose actions. One explanation opens directly below its row, using the same fields for execution, real and simulated dependencies, database and state lifecycle, checks/review, and limitations. Lifecycle copy says which state is shared, which state is reset, gives a concrete cross-test example, and says whether temporary data is deleted or retained after the run. Code paths, commands and saved output locations sit behind a further disclosure. Reading never starts a runner.
- Navigation: the topbar's Run checks / Eval runs links mark the current page with `aria-current`; the Eval runs link carries the amber count of answers needing attention in active runs, and "View saved runs" under the Live agent evals suite opens the same page. Both URLs load directly; ordinary link clicks preserve in-memory drafts/selections while updating browser history, title and heading focus. Modified clicks use native new-tab behavior. Generating eval answers and judging saved answers are always separate actions.
- Run cards: date, model/effort, answer count and an amber "N need attention" or "No answers needing attention" line. No automatic clearance is labeled as human approval. The open run is tinted blue. Archived runs stay in a collapsed disclosure with Archive/Restore in the open run's header.
- Run header: "Run from <date>", the saved plan (cases × repetitions = planned, answers saved, commit, local-changes flag), one Judge action (labeled with what it will judge: the unjudged answers, or everything again) and Archive/Restore run, then one bar of the run's triage (red failures, amber needs review, gray not judged, light-green LLM-cleared, green human pass) with a text line (“N need attention · N LLM-cleared · N of M human-reviewed · judge agreed A of B”). The Judge button is primary only while unjudged answers remain; afterwards it is a secondary "Judge these N again…" for the current filter's answers, or "Judge run again…" for the whole run under All. When a run has more than one repetition the header explains that each case was answered N times from a fresh application.
- Answer queue: one row button per answer that opens it; the open row is tinted. Runs with several repetitions group rows under the case name and label rows "Repetition n"; single-repetition runs list case names directly. Rows show the derived triage status: not judged is a quiet hollow dot, every other status (Needs review, Failed checks, LLM fail, Human fail/pass, LLM-cleared) a labeled chip; an outlined "LLM" chip marks advice that did not clear the answer. Filter counts apply to the current run; there are no checkboxes or bulk actions.
- Answer card: title, a meta line with the case id, model/effort and "Run case again…", and Previous/Next with "n of N"; one status line (triage chip plus its reason); the rubric in a panel (today's casebook wording, with the wording saved at run time behind a "Wording changed since this run" disclosure when they differ); the conversation as an inset chat area on the paper tone, the engineer's turn in a blue-tinted bubble and Server Guy's in a white bordered one, each labeled by speaker; then a separate evidence section with proposed decisions rendered as kind chips plus values (and what they replace) and collapsed automatic checks and recorded state; then LLM advice; then the verdict form. Decisions recorded before the message appear in an amber context panel.
- Verdict: one row with three one-click buttons, Pass / Fail / Discuss, each showing its shortcut key (P / F / D) and an "LLM" tag on the button that matches the saved judgment. A click saves immediately (no name, no reason) and advances to the next row of the queue; the saved verdict stays pressed with "Saved · <time>". "Add a note" reveals an optional note saved with the next click; notes survive switching answers until saved. J/K move through the queue.
- Judge-first triage: sidebar filters Attention (default), Failed, Cleared, Reviewed, All, each with a count on one line. Attention includes not judged, uncertain and failed answers. Current-policy clearance requires recorded checks to pass. The triage label/reason is distinct from the human verdict; the header text counts human reviews separately from clearance. Spot-checking is just opening Cleared. Calibration guidance is collapsed under "How triage works" at the bottom of the sidebar.
- LLM judgment: verdict chip, an amber "Older rubric wording" chip when the casebook wording has changed since, model/effort/time, the reason's first sentence in bold with the rest behind a "Full reasoning" disclosure that stays open per answer, and one small secondary button at the right, "Judge this answer…" or "Judge again…", for this repetition. The run header's Judge button is the only run-wide control and counts only queued answers without a current judgment. Judgments never fill or change the human verdict.
- Paid actions: live evals and judging open one dialog: what will run, "Uses <model> at <effort> effort" with a Change disclosure for the fields, the selection and limits collapsed, and a single Start button. A live run's dialog adds "Judge the answers automatically when the run finishes", ticked by default.
- Pickers: suite scope selection uses native dialogs with one-column checklists, a scrollable body and a visible footer; closing keeps selections. Eval cases have searchable, collapsible categories with whole-category selection, compact names and run-history labels; expected behavior and input sit behind a disclosure. Only cases without a saved attempt are selected by default, including archived history; skipped or merely planned cases remain unrun. Polling updates this default until the user makes a manual selection; Select unrun restores it. Categories containing unrun cases start expanded. Eval repetitions default to one, with 2–5 available explicitly.
- Single-case rerun: "Run case again…" sits under the answer title, separate from the saved-answer judge. It always runs once, using current code/case definitions in a new run with fresh spending consent. Original answers and verdicts stay intact. Cases that failed before replying can rerun; a removed case has a disabled button and explanation.

## Do's and Don'ts

- "Run new evals only (N)…" is prominent on both Run checks and Eval runs. It uses only case IDs with no saved attempt on this machine (archived runs count), one repetition, and the normal confirmation with automatic judging enabled. Zero eligible cases disables it; it never falls back to the full suite. Choose cases remains available for explicit reruns. This is history-based, not a diff of case revisions or a branch comparison.

- Do keep human verdict, LLM advice and automatic checks separately labeled and differently styled.
- Do keep the queue on the left, one answer on the right, and the verdict at the bottom of the card; all answers remain reachable by ordinary page scrolling.
- Do state costs next to paid actions; reading and grading spend nothing.
- Don't add a mobile layout, a new visual identity, or product-wide design rules from this tool.
- Don't default the verdict control; a saved verdict must be an explicit choice.

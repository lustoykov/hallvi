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

Desktop only: a 56px topbar, centered content (1440px maximum), 36px side padding. Run checks is a suite table, then a recent-runs list with an inline output panel. Review is a two-column grid: a 360px sidebar (runs, then the open run's answer queue) and a flexible main column holding the run header and one answer card. The sidebar expands fully in normal page flow, with no nested scroll area hiding answers. The answer header wraps long titles without overlapping Previous/Next; longer evidence uses the page scroll. There is no mobile layout contract.

## Elevation & Depth

Flat surfaces: borders and tonal fills, no shadows, except the floating selection toolbar, which carries a soft offset shadow because it sits above the page. Dialogs use a dim navy backdrop.

## Shapes

Cards, the answer card and dialogs use 12px radii; controls 7px; chips 5px; queue rows 6px. Segmented verdict controls are one bordered pill divided by hairlines.

## Components

- Suite table: AI usage uses quiet "No AI calls" chips and amber "Uses subscription" chips. "CI" separates the primary schedule from a short secondary line for partial CI coverage or local-only runs. The collapsed "About AI usage & automatic runs" disclosure explains subscription confirmation, Actions minutes and what on demand means. Suite actions share one width and height.
- Navigation: "View saved runs" links to `/evals` from the Live agent evals suite, with an amber "N need attention" chip for active runs. The review screen links back to `/` (Run checks). Both URLs load directly; ordinary link clicks preserve in-memory drafts/selections while updating browser history, title and heading focus. Modified clicks use native new-tab behavior. Generating eval answers and judging saved answers are always separate actions.
- Run cards: date, model/effort, answer count and an amber "N need attention" or "No answers needing attention" line. No automatic clearance is labeled as human approval. The open run is tinted blue. Archived runs stay in a collapsed disclosure with Archive/Restore in the open run's header.
- Run header: "Run from <date>", the saved plan (cases × repetitions = planned, answers saved, commit, local-changes flag), a segmented progress bar (pass/fail/discuss) with a text summary, and Archive/Restore run. When a run has more than one repetition the header explains that each case was answered N times from a fresh application.
- Answer queue: a checkbox per answer plus a row button that opens it; the open row is tinted. Runs with several repetitions group rows under the case name and label rows "Repetition n"; single-repetition runs list case names directly. Rows show the derived triage label (Not judged, Needs review, Failed checks, LLM fail, Human fail/pass, LLM-cleared); model labels are outlined. Filter counts and the tri-state "Select all shown answers" checkbox apply to the current run.
- Answer card: title and Previous/Next with "n of N"; a status strip (checks, your verdict, LLM advice); the rubric in a panel; the engineer message and Server Guy answer as a transcript with proposed decisions rendered as kind chips plus values (and what they replace); collapsed automatic checks and recorded state; then LLM advice; then the verdict form. Decisions recorded before the message appear in an amber context panel.
- Verdict form: reviewer name is set once in the section header ("Reviewing as") and remembered; the verdict is a required segmented Pass / Fail / Needs discussion control with no default; reason is required. Save reports "Saved by <name> · <time>", "Unsaved changes" or "Not reviewed yet", and offers "Next needing attention" when another answer needs attention. Drafts survive switching answers. J/K move through the queue; Cmd/Ctrl+Enter saves.
- Judge-first triage: Needs attention (default), Failures, LLM-cleared, Human reviewed, All. Attention includes not judged, uncertain and failed answers. Current-policy clearance requires recorded checks to pass. The triage label/reason is distinct from the human verdict; the progress bar explicitly counts human reviews. "Spot-check a cleared answer" opens a random cleared answer, never saves approval. Calibration guidance is collapsed under "How triage works".
- LLM judgment: verdict chip, reason, model/effort/time, and "Judge answer…" or "Judge again…". "Judge run…" in the run header grades all saved input/answer pairs regardless of the current filter. Every action opens count/model/effort and consent, including repeat judgments. Advice never fills or changes the human form.
- Selection toolbar: appears floating at the bottom only in the review screen while answers are selected: "N selected", "Judge selected (N)…", "Set human verdict (N)…", Clear. Selection is scoped to the open run and filter; changing either clears it.
- Paid actions: live evals and LLM advice open the spending confirmation, which shows model/effort, the exact selection and limits, and requires a fresh consent checkbox; changing model or effort resets consent.
- Pickers: suite scope selection uses native dialogs with one-column checklists, a scrollable body and a visible footer; closing keeps selections. Eval repetitions default to one, with 2–5 available explicitly.
- Single-case rerun: "Run case again…" sits under the answer title, separate from the saved-answer judge. It always runs once, using current code/case definitions in a new run with fresh spending consent. Original answers and verdicts stay intact. Cases that failed before replying can rerun; a removed case has a disabled button and explanation.

## Do's and Don'ts

- Do keep human verdict, LLM advice and automatic checks separately labeled and differently styled.
- Do keep the queue on the left, one answer on the right, and the verdict at the bottom of the card; all answers remain reachable by ordinary page scrolling.
- Do state costs next to paid actions; reading and grading spend nothing.
- Don't add a mobile layout, a new visual identity, or product-wide design rules from this tool.
- Don't default the verdict control; a saved verdict must be an explicit choice.

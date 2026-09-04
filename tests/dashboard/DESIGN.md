---
name: Server Guy testing dashboard
description: Desktop-only local developer checks and saved-answer review.
colors:
  blue: "#285ad8"
  ink: "#192338"
  muted: "#53617a"
  line: "#d8e0ec"
  paper: "#f5f7fb"
  shell: "#172238"
  surface: "#ffffff"
typography:
  body: { fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', fontSize: "15px", lineHeight: 1.55 }
  headline: { fontSize: "36px", fontWeight: 700, lineHeight: 1.15, letterSpacing: "-.03em" }
  title: { fontSize: "22px", fontWeight: 700, lineHeight: 1.3, letterSpacing: "-.02em" }
  label: { fontSize: "13px", fontWeight: 600 }
rounded:
  control: "6px"
  action: "7px"
  answer: "8px"
  dialog: "12px"
components:
  button-primary: { backgroundColor: "{colors.blue}", textColor: "{colors.surface}", rounded: "{rounded.action}", padding: "9px 16px" }
---

# Design System: Server Guy testing dashboard

## Overview

This document applies only to the loopback developer dashboard in `tests/dashboard/`, not the Server Guy product UI. It records the existing restrained navy/blue interface: readable evidence, compact controls, and explicit action costs. Implementation authority: [styles](dashboard.css), [markup](dashboard.html), and [behavior](dashboard.js).

## Colors

Blue marks primary actions, links, selected sections, and keyboard focus. Ink and muted text establish hierarchy on paper and white surfaces; shell navy anchors the header and line separates content. Green, red, and amber status treatments always accompany written outcomes, never replace them.

## Typography

Use the system stack throughout; no separate display font. Headline identifies the dashboard, title introduces sections, and labels identify fields and evidence. Small metadata is secondary, not low-contrast decoration. Logs use monospace; run history uses tabular numerals.

## Layout

Desktop only: a full-width header (64px), centered content (1440px maximum), and main padding (24px 36px 64px). The topbar identifies the tool; avoid repeating a large title above the tabs. Run checks uses a suite/model-usage/CI/action table followed by recent runs; the browser policy states how many journeys run on every PR versus on demand. Review uses an Active/Archived run filter, a saved-run sidebar (300px) and flexible evidence column separated by a gap (28px). Each run groups its answers, not case types. The open run's answer list expands fully in normal page flow; neither the list nor the sidebar clips answers into a nested scroll area. Two-column form rows retain visible labels; answer text is bounded (78ch). There is no mobile layout contract.

## Elevation & Depth

Flat surfaces use borders and tonal fills, not shadows. The answer surface is white; selected cases and active runs receive light blue fills. The native confirmation dialog separates itself with a dim navy backdrop rather than ornamental elevation.

## Shapes

Modestly rounded controls, actions, answer panels, and dialogs use the roles above. The suite table remains square-edged; thin dividers organize the review form, evidence disclosures, and judge area. Status badges are compact rounded rectangles, not decorative pills.

## Components

- Buttons: solid blue for direct Run/Save and the prominent bulk Judge action; outlined secondary controls for configuration, stopping, human verdicts and archive/restore. Hover changes the fill; disabled controls visibly dim. Keyboard focus has a blue outline (3px, offset 4px).
- Navigation: section buttons combine a blue label and underline when selected; case buttons combine a tinted fill with `aria-current`. Keep visible focus through case selection and unchanged state polling.
- Evidence: show the rubric, engineer message, and saved answer before expandable proposals/checks and recorded state. Automatic outcome, human verdict, and LLM advice remain separately labeled.
- Review form: one “Review this answer” area contains the human form and LLM advice in adjacent columns, with Ask LLM for advice beside the shared heading. Verdicts remain explicitly human versus advisory; advice never fills or submits the human form. Native inputs, selects and textarea; save feedback sits beside the action. Preserve per-case/run unsaved drafts while switching, and distinguish “Unsaved changes” from timestamped saved feedback.
- Paid actions: disclose subscription usage beside the toolbar. Judge opens the confirmation dialog directly; model/effort are configured only there, with a fresh consent checkbox before Start run. Changing either resets consent. Human and LLM results remain separately labeled.
- Scope selection: suite actions open native dialogs, never detached scrolling sections. Use one-column checklists with a scrollable body and visible footer; closing retains selections. Live selection proceeds to spending confirmation; cancelling that returns to the picker and its Run control.
- Review context: call the section “Review live eval answers.” Use the saved run's counts, not current defaults. Group by run, newest first; its tri-state checkbox selects all accepted answers and its open list is flat. Opening a run/answer and selecting answers remain separate actions. Selection never silently spans multiple runs. Toolbar actions stay visible and disabled at zero; bulk human verdicts use a small dialog.
- Archive: Active runs and Archived runs are run-level inbox views, not verdicts. Archive run sits beside the selected run's date/model and affects all its answers, never the checked subset. Restore run reverses it. Selection clears when changing run/view. Empty/failed runs are archivable; failed answers can't be judged. Keep empty and metadata-error states visible.

## Do's and Don'ts

- Do retain readable tables, text labels, native controls, and visible empty/error/running states in this dashboard.
- Do state that saved-answer review does not execute a model; a judge request is a separate confirmed action.
- Don't turn this developer tool into a new visual identity, a mobile surface, or a product-wide design mandate.
- Don't conflate automatic success, advisory LLM output, and an engineer's saved judgment.

Observed desktop references: [Run checks](../results/dashboard-review/dashboard-runs.png), [saved review](../results/dashboard-review/dashboard-review.png), and [unsaved review](../results/dashboard-review/dashboard-unsaved-review.png). These private screenshots are gitignored evidence, not shipped assets.

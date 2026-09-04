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

Desktop only: a full-width header (64px), centered content (1280px maximum), and main padding (40px 36px 64px). Run checks uses a suite/model-usage/CI/action table followed by recent runs. Review answers uses a case sidebar (245px) and flexible evidence column separated by a gap (28px). Two-column form rows retain visible labels; answer text is bounded (78ch). There is no mobile layout contract.

## Elevation & Depth

Flat surfaces use borders and tonal fills, not shadows. The answer surface is white; selected cases and active runs receive light blue fills. The native confirmation dialog separates itself with a dim navy backdrop rather than ornamental elevation.

## Shapes

Modestly rounded controls, actions, answer panels, and dialogs use the roles above. The suite table remains square-edged; thin dividers organize the review form, evidence disclosures, and judge area. Status badges are compact rounded rectangles, not decorative pills.

## Components

- Buttons: solid blue for direct Run/Save actions; outlined secondary controls for configuration, stopping, and judge requests. Hover changes the fill; disabled controls visibly dim. Keyboard focus has a blue outline (3px, offset 4px).
- Navigation: section buttons combine a blue label and underline when selected; case buttons combine a tinted fill with `aria-current`. Keep visible focus through case selection and unchanged state polling.
- Evidence: show the rubric, engineer message, and saved answer before expandable proposals/checks and recorded state. Automatic outcome, human verdict, and LLM advice remain separately labeled.
- Review form: native inputs, selects, and textarea; save feedback sits beside the action. Preserve per-case unsaved drafts while switching cases, and distinguish “Unsaved changes” from timestamped saved feedback.
- Paid actions: disclose subscription usage before the action. Judge advice stays in a separate disclosure; the confirmation dialog names the model/effort and requires a fresh consent checkbox before enabling Start run.

## Do's and Don'ts

- Do retain readable tables, text labels, native controls, and visible empty/error/running states in this dashboard.
- Do state that saved-answer review does not execute a model; a judge request is a separate confirmed action.
- Don't turn this developer tool into a new visual identity, a mobile surface, or a product-wide design mandate.
- Don't conflate automatic success, advisory LLM output, and an engineer's saved judgment.

Observed desktop references: [Run checks](../results/dashboard-review/dashboard-runs.png), [saved review](../results/dashboard-review/dashboard-review.png), and [unsaved review](../results/dashboard-review/dashboard-unsaved-review.png). These private screenshots are gitignored evidence, not shipped assets.

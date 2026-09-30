---
name: Hallvi plugin panel
description: A quiet, read-only application view inside an MCP Apps host.
colors:
  ink: "#202838"
  muted: "#596477"
  line: "#e7e9ee"
  surface: "#ffffff"
  context: "#fafbfc"
  blue: "#285ad8"
  waiting: "#9a4b10"
  failed: "#a6312b"
  dark-ink: "#e6eaf2"
  dark-muted: "#aab5c7"
  dark-line: "#384151"
  dark-surface: "#20242c"
  dark-context: "#272d38"
  dark-blue: "#8aafff"
  dark-waiting: "#f0bc86"
  dark-failed: "#ffada6"
typography:
  title:
    fontFamily: "system-ui, sans-serif"
    fontSize: "24px"
    letterSpacing: "-0.025em"
  body:
    fontFamily: "system-ui, sans-serif"
    fontSize: "14px"
    lineHeight: 1.65
  detail:
    fontFamily: "ui-monospace, monospace"
    fontSize: "12px"
    lineHeight: 1.6
rounded:
  control: "7px"
spacing:
  page: "24px"
  page-mobile: "16px"
  section: "24px"
components:
  control:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    padding: "6px 12px"
  evidence:
    backgroundColor: "{colors.context}"
    typography: "{typography.detail}"
    rounded: "{rounded.control}"
    padding: "12px"
---

# Design System: Hallvi plugin panel

## Overview

**Creative North Star: "Quiet application workspace"**

This is the existing Hallvi identity adapted to a self-contained iframe. It is an **Operate** surface for choosing an application and reading its recorded state. The MCP bridge reads applications and evidence, shares the selection with the conversation, and opens Hallvi for approvals, missing input, Continue and Stop. The conversation submits operational requests. The [workspace design](../../src/components/hallvi/DESIGN.md) remains the visual authority; this file records the smaller panel's implemented subset.

**Key Characteristics:** One application at a time; identity and condition before evidence; attention before records; execution output behind a disclosure.

## Colors

The panel uses white, ink, quiet separators and Hallvi action blue. `waiting` marks attention, while `failed` marks errors and failed executions. `prefers-color-scheme: dark` switches all eight semantic colors to their `dark-*` counterparts. Color adds emphasis to text that already names the state; it never asserts a successful check by itself.

## Typography

Use the host-friendly system sans stack because this iframe does not load Hallvi's Geist files. Body copy is 14px/1.65; the Hallvi heading is 24px, section headings 18px or 14px, and notes 12px. Execution input and output use 12px/1.6 system monospace. Keep paragraphs within 70ch and long values wrap.

## Layout

Use one column capped at 760px, with 24px page padding. The header pairs Hallvi with Refresh; the full-width application selector precedes the selected application's name, condition, facts and Hallvi link. Sections have 24px separation and a 1px rule. Facts use a 100px label column and flexible value column. At 440px and below, page padding becomes 16px and fact labels 86px. Long addresses, record titles and execution text wrap or scroll within their own content area.

## Elevation & Depth

The panel is flat: no shadows or floating cards. Hairline rules separate sections, and the faint `context` surface sets execution text apart from the page.

## Shapes

Controls and execution excerpts use a 7px radius. Lists remain open rows with bottom rules. Avoid adding a separate card shape around every fact.

## Components

- **Application selector:** A labeled, full-width native select with a 38px minimum height. Changing selection clears the previous detail before reading the new application.
- **UI reload:** A secondary footer shows the content version and Reload UI. It publishes a new resource over the existing MCP connection and asks the owner to reopen the panel when needed; it never claims the visible iframe has already updated.
- **Refresh:** A secondary control that rereads recorded data. Its disabled state during a request and the visible connection, loading and error messages explain what is happening.
- **Attention and records:** Show the reason or title as plain text. When no attention is listed, say only what was known when records were read; if the operator is unavailable, say pending attention is unknown. No records means unassessed, never healthy.
- **Execution evidence:** A summary names the tool and status, with time, target and a short input preview. The full recorded input and output start collapsed in a native `details` disclosure. Mark failed runs in red and identify truncated output as an excerpt.
- **Hallvi browser access:** HTTPS addresses use the host’s Open in Hallvi action. HTTP addresses show a read-only address and Copy address because the installed Codex host silently ignores HTTP open-link requests. Clipboard denial selects the address for manual copying. An explicit host link failure exposes the same fallback. The plugin panel does not present approval controls.

## Do's and Don'ts

- **Do** keep the selected application, read time and historical nature of records explicit.
- **Do** retain the blue 2px `:focus-visible` outline with a 3px offset on keyboard targets.
- **Do** use semantic status and alert messages for connection and read failures.
- **Don't** imply that Refresh probes the server or that a completed execution proves the application works.
- **Don't** turn absent records or an unavailable operator into a healthy or idle state.

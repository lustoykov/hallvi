---
name: Hallvi settings
description: Observed conventions inherited from the approved Pi setup prototype A.
colors:
  canvas: "#f5f7fb"
  surface: "#ffffff"
  topbar: "#ffffff"
  ink: "#192338"
  muted: "#536078"
  primary: "#285ad8"
  action-text: "#2852a6"
  line: "#d8e0ec"
  success: "#0c7248"
  error: "#9c312a"
  focus: "#285ad8"
typography:
  body: {fontFamily: "var(--font-geist-sans), system-ui, sans-serif", fontSize: "14px"}
  headline: {fontSize: "36px", lineHeight: 1.1, letterSpacing: "-0.03em"}
  code: {fontFamily: "var(--font-geist-mono)", fontSize: "30px", letterSpacing: "0.08em"}
rounded: {card: "14px", button: "7px", help: "12px"}
---

# Settings design reference

**Settings is one page (20 September 2026).** `/setup/connections` lists every
account Hallvi acts through — ChatGPT, GitHub, Hallvi’s workspace, then the owner's
providers — each with its state in words and one action. A ChatGPT or GitHub
row that is not connected expands the same card the conversation draws
(`onboarding/chatgpt-connect.tsx`, `onboarding/github-connect.tsx`) with
`plain` set, so there is one sign-in in the product rather than a settings copy
of it. A row that already holds a login links to its own page instead: changing
an account, signing out and choosing a model are not things a sign-in card can
do. Only the first row that wants the owner carries the blue action. The
per-account routes remain for what does not belong in a list: model
preferences, repository checks, the workspace choice. The chosen direction and
the alternatives are on the `prototype/guided-setup` branch.

This documents the existing settings surface. The [operator redesign](../operator-design.md) adds permission modes whose placement and controls are not designed here yet. Preserve useful visual conventions without treating current settings as feature-complete.

## Overview

GitHub settings extends the approved Pi setup layout. This is an Operate surface: make the current account, next action, and repository-access implications easy to inspect. This is a settings-specific implementation reference, originally observed on 4 September 2026 and checked against the shared settings CSS on 11 September. It is not a separate product color system. The [application design reference](../../src/components/hallvi/DESIGN.md) owns overall visual language; this document records the settings surface's existing differences.

The implementation remains the source of truth: [shared settings styles](../../src/components/hallvi/pi-setup-screen.module.css), [Pi screen](../../src/components/hallvi/pi-setup-screen.tsx), [GitHub screen](../../src/components/hallvi/github-setup-screen.tsx), and [shared page shell](../../src/app/hallvi.css). Recheck them before extending this reference.

## Colors

Use the pale canvas, white card, white topbar over the `line` hairline, and dark body text. Blue marks primary actions, text actions, and the active tab. Green accompanies successful account state; errors and disconnect actions use red. Keep supporting copy muted and section boundaries subtle.

## Typography

Inherit Geist Sans from the [app layout](../../src/app/layout.tsx) and [global styles](../../src/app/globals.css). Section titles are compact (17px); introductory copy is slightly larger than body copy (15px); hints use smaller text (13px). Device codes use the separate monospace role and remain selectable.

## Layout

Keep a single centered content column (680px maximum including 16px side padding), a full-width topbar (56px tall, shared with the setup screens and Add application; `hv-setup-topbar` in the [shared page shell](../../src/app/hallvi.css)), settings navigation, heading, and one divided card. Account controls precede the second settings section; the footer holds the return action. Standard section padding is 26px by 30px. The existing height breakpoint at 800px reduces vertical spacing; preserve the existing narrow-width fallback without treating it as mobile acceptance evidence.

## Elevation & Depth

The main card is flat: its border and section dividers establish grouping. The separate Storage & privacy popover uses a shadow and sits against the right viewport edge (470px wide, constrained to the viewport). Keep technical storage details in that panel.

## Shapes

Retain the shared card, primary-button, and help-panel radii above. Controls use restrained rounding; Pi step markers remain circular. Phosphor icons accompany labels and state, with most action icons sized to 18px.

## Components

- **Navigation:** reuse [SettingsNav](../../src/components/hallvi/settings-nav.tsx): “Connections”, “ChatGPT & model”, “GitHub” and “Workspace”, with an underline and `aria-current="page"` for the active route. Settings opens on Connections, which shows every account at once; the other tabs are the detail each one links to.
- **Actions:** primary controls have a 44px minimum height, 12px by 20px padding, and a darker blue hover. Secondary actions remain text buttons. Preserve the visible focus outline (2px in the primary blue, offset 3px, shared by every screen) and disabled treatment.
- **Account choice:** distinguish a detected login from an accepted connection. Show the account and credential source, explicit reuse, an alternative login when available, and a way to retain the current connection.
- **Device sign-in:** show the code, copy feedback, provider link, stable waiting announcement, expiry, and cancel action. While replacing an account, name the account still in use. Keep the changing countdown outside the live announcement. A saved login is never drawn as a working one: it says ChatGPT checks it on the first message.
- **Repository access:** show GitHub App installation guidance only for an App connection. Existing CLI/environment connections use their existing permissions. Account connection does not claim repository verification; adding an application checks access and the exact commit.
- **Workspace choice:** two radio cards, “On this computer” (default) and “In Docker”, each with one short paragraph that states what it does and does not protect. The Docker card shows whether Docker answers now; a Docker choice that cannot be met says so without offering to switch. Saving applies from the next message.
- **Help and errors:** keep inline copy concise; disclose storage details in the titled popover. Show actionable errors near the account controls. Disconnect uses the existing confirmation dialog.
- **Return path:** the [GitHub route](../../src/app/setup/github/page.tsx) preserves `from=add` as “Back to add application”; otherwise the footer says “View applications”.

## Do's and Don'ts

- **Do** extend the shared settings components and inspect detected, connected, and pending-replacement states on desktop. The reviewed screenshots cover those states and the App connection at a 1394px desktop width.
- **Don't** infer a new visual identity, a universal settings state machine, or broader permission claims from this narrow GitHub extension.

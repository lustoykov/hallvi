---
name: Server Guy settings
description: Observed conventions inherited from the approved Pi setup prototype A.
colors:
  canvas: "#f5f7fb"
  surface: "#ffffff"
  topbar: "#172238"
  ink: "#192338"
  muted: "#536078"
  primary: "#285ad8"
  action-text: "#2852a6"
  line: "#d8e0ec"
  success: "#0c7248"
  error: "#9c312a"
  focus: "#7ba7ff"
typography:
  body: {fontFamily: "var(--font-geist-sans), system-ui, sans-serif", fontSize: "14px"}
  headline: {fontSize: "36px", lineHeight: 1.1, letterSpacing: "-0.03em"}
  code: {fontFamily: "var(--font-geist-mono)", fontSize: "30px", letterSpacing: "0.08em"}
rounded: {card: "14px", button: "7px", help: "12px"}
---

# Settings design reference

## Overview

GitHub settings extends the approved Pi setup layout. This is an Operate surface: make the current account, next action, and repository-access implications easy to inspect. These conventions describe the existing desktop implementation as of 2026-09-04.

The implementation remains the source of truth: [shared settings styles](../../../src/components/server-guy/pi-setup-screen.module.css), [Pi screen](../../../src/components/server-guy/pi-setup-screen.tsx), [GitHub screen](../../../src/components/server-guy/github-setup-screen.tsx), and [shared page shell](../../../src/app/server-guy.css). Recheck them before extending this reference.

## Colors

Use the pale canvas, white card, dark topbar, and dark body text. Blue marks primary actions, text actions, and the active tab. Green accompanies successful account state; errors and disconnect actions use red. Keep supporting copy muted and section boundaries subtle.

## Typography

Inherit Geist Sans from the [app layout](../../../src/app/layout.tsx) and [global styles](../../../src/app/globals.css). Section titles are compact (17px); introductory copy is slightly larger than body copy (15px); hints use smaller text (13px). Device codes use the separate monospace role and remain selectable.

## Layout

Keep a single centered content column (680px maximum including 16px side padding), a full-width topbar (64px tall), settings navigation, heading, and one divided card. Account controls precede the second settings section; the footer holds the return action. Standard section padding is 26px by 30px. The existing height breakpoint at 800px reduces vertical spacing; preserve the existing narrow-width fallback without treating it as mobile acceptance evidence.

## Elevation & Depth

The main card is flat: its border and section dividers establish grouping. The separate Storage & privacy popover uses a shadow and sits against the right viewport edge (470px wide, constrained to the viewport). Keep technical storage details in that panel.

## Shapes

Retain the shared card, primary-button, and help-panel radii above. Controls use restrained rounding; Pi step markers remain circular. Phosphor icons accompany labels and state, with most action icons sized to 18px.

## Components

- **Navigation:** reuse [SettingsNav](../../../src/components/server-guy/settings-nav.tsx): “ChatGPT & model” and “GitHub”, with an underline and `aria-current="page"` for the active route.
- **Actions:** primary controls have a 44px minimum height, 12px by 20px padding, and a darker blue hover. Secondary actions remain text buttons. Preserve the visible focus outline (3px, offset 4px) and disabled treatment.
- **Account choice:** distinguish a detected login from an accepted connection. Show the account and credential source, explicit reuse, an alternative login when available, and a way to retain the current connection.
- **Device sign-in:** show the code, copy feedback, provider link, stable waiting announcement, expiry, and cancel action. While replacing an account, name the account still in use. Keep the changing countdown outside the live announcement.
- **Repository access:** show GitHub App installation guidance only for an App connection. Existing CLI/environment connections use their existing permissions. Account connection does not claim repository verification; adding an application checks access and the exact commit.
- **Help and errors:** keep inline copy concise; disclose storage details in the titled popover. Show actionable errors near the account controls. Disconnect uses the existing confirmation dialog.
- **Return path:** the [GitHub route](../../../src/app/setup/github/page.tsx) preserves `from=add` as “Back to add application”; otherwise the footer says “View applications”.

## Do's and Don'ts

- **Do** extend the shared settings components and inspect detected, connected, and pending-replacement states on desktop. The reviewed screenshots cover those states and the App connection at a 1394px desktop width.
- **Don't** infer a new visual identity, a universal settings state machine, or broader permission claims from this narrow GitHub extension.

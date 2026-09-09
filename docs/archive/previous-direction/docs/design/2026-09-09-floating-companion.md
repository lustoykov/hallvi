# Floating companion exploration

> Archived reference, 9 September 2026. Preserved for evidence and migration; instructions and unchecked lists below are historical, not the current product plan. See [Product](../../../../../PRODUCT.md) and [Roadmap](../../../../../ROADMAP.md).

Variant D extends the existing development-only comparison in the same `codex/self-hosted-shell` worktree. Open the application on port 3270 with `?variant=D`. The accepted application remains available on 3260.

The owner's proposal is a compact floating window at the top right, showing the area relevant to the conversation. Opening it makes that view the main surface and turns the conversation into the floating window. This tests a different relationship from the permanently docked panels in B and C.

Current exploratory behavior:
- The companion follows the simulated conversation's destination by default, without navigating the main surface.
- Manually selecting a destination pins it. The pin toggle restores following; the user can hide and reopen the window.
- Mini views show database, architecture, deployment, backups and logs. All operational measurements and actions remain labeled synthetic.
- Clicking a mini view opens the full section with a compact, usable chat. Expanding chat restores the main conversation. Both read the same in-memory state and share the draft.
- The backup scenario retains proposal, approval, work, failure and verified-result distinctions.

Browser checks exercised automatic topic following, manual pinning across a topic change, draft preservation when opening a full view, sending an inspection from floating chat, shared measurements and expanding back to the companion. TypeScript and targeted lint passed. No provider work or real deployment operations were performed.

Open design questions: how often an agent may suggest a new companion; whether to show it before any topic emerges; whether the mini chat should expand for lengthy approvals; and whether users need to reposition it. This prototype does not select a final layout or introduce a production agent-to-view protocol.

## Variant E: fixed 16:9 window

The floating window is about focus, not saving space. It renders the same interactive page at reduced scale, preserving the full-page layout and smaller text instead of designing a compact card. E now has a fixed 16:9 frame, independent scrolling, and no resize controls. The header can still move it out of the way.

The view selector always lets the user choose a destination. For this experiment, Follow conversation is the default. Choosing a view manually pins it; subsequent agent replies cannot replace that selection until the user enables following again. This is a proposed behavior to evaluate, not a settled product decision. No main-page navigation happens automatically.

Opening the full view swaps the real conversation into the same 16:9 window. One open-full control, shared draft and scenario state, no peek or expandable sidebar modes. The prototype uses shared components rather than a screenshot, so controls remain interactive. All operational values and actions are simulated.

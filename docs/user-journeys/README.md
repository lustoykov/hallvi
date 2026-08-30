# Server Guy user journeys

Status: workshop drafts. These documents define the product experience, not implementation behavior or evidence that the product exists.

The five journeys are deliberately separate because **Application Launch**, routine **Deployment**, incident response, alert delivery, and external-agent collaboration have different triggers, user expectations, and definitions of success.

| Journey | Workshop state | Core user outcome |
| --- | --- | --- |
| [01 — Launch an application](./01-application-launch.md) | **Active** | Get a repository live and establish minimum ongoing operations. |
| [02 — Detect unavailability and alert](./02-unavailability-alert.md) | Placeholder | Learn promptly that the application is probably unavailable, even with the laptop offline. |
| [03 — Investigate and recover](./03-incident-recovery.md) | Placeholder | Restore service and prove Recovery without hiding uncertainty. |
| [04 — Collaborate through Codex](./04-codex-mcp-remediation.md) | Placeholder | Give Codex operational evidence and receive a reviewable Candidate Fix without copy-paste. |
| [05 — Ship a routine Release](./05-routine-release.md) | Placeholder | Move an exact revision into production and verify it or return to the predecessor. |

Journey 01 supporting artifacts:

- [Operator UI state map](./01-application-launch-ui-map.md) — the 39 representative user-facing states.
- [UI building-block catalog](./01-application-launch-ui-building-blocks.md) — the stable workspace, seven presentation families, technical renderers, and state coverage.
- [Journey and UI diagrams](./diagrams/01-application-launch.html) — current Journey 01 flow visuals.

## How to read these documents

Each journey separates:

- what the engineer is trying to accomplish;
- what the engineer sees and controls in the Operator UI;
- what Pi does adaptively inside the Operator Session;
- what Server Guy records as authoritative state or evidence;
- where Approval Mode affects the experience;
- which consequential product decisions remain unresolved.

The steps describe a comprehensible user experience, not a fixed agent pipeline. Pi may inspect, act, ask, revisit a conclusion, or enter a bounded Guided Operation as the situation demands.

## Cross-journey spine

```text
Application Launch
    -> externally observed application
    -> Incident Signal and Alert
    -> Incident Case and Recovery
    -> optional Codex Candidate Fix
    -> routine Release
```

The lifecycle is complete only when the same operational record connects repository revision, Release, Deployment, Observations, Incident Case, Remediation, and Recovery.

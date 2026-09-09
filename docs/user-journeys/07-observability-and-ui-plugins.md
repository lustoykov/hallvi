# Understand application state

**Goal:** “Show me what's filling the disk” or “Why is my application slow?” Finish with an answer supported by actual measurements and a useful stable view.

1. Identify the application/host, relevant services and available observations. Read logs, health, traffic/resource samples or job results within authorized access.
2. Explain the finding with source, time, units and uncertainty. If only total disk usage is known, do not invent a per-service breakdown or historical trend.
3. Show relevant evidence through existing interactive components and stable application views. Conversation and views refer to the same operation and facts; navigation does not interrupt investigation.
4. Where action is useful, propose a concrete next step with impact. Inspecting disk usage does not authorize deleting data; a suspected cause is not a verified fix.
5. Recheck after an authorized correction and show the actual result or remaining uncertainty.

**Acceptance:** measured values, unavailable/stale source, limited coverage, cross-conversation references and fresh evidence after action. Core health, logs, protection and issues remain usable without a model-generated dashboard.

The filename is retained for existing links. Its earlier requirement to generate a UI Plugin is superseded: custom Plugins are optional later work, not part of completing this journey. Fable's [design reference](../../src/components/server-guy/DESIGN.md) owns presentation.

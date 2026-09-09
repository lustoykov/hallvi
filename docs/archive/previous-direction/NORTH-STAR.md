# Server Guy north star

> Archived reference, 9 September 2026. Preserved for evidence and migration; instructions and unchecked lists below are historical, not the current product plan. See [Product](../../../PRODUCT.md) and [Roadmap](../../../ROADMAP.md).

> Server Guy — the agent for self-hosted software.

Deploy applications, keep them healthy, and protect their data—on servers you control. Start with applications from the user’s repository on their own machine, home server, VPS or raw cloud instance. Packaged tools such as Grafana, Prometheus and Coolify are also compatibility requirements to test, without claiming they are supported yet. The [product scope](../../../PRODUCT.md) records the confirmed boundary.

Our broader ambition remains the operational foundation for a world where agents build and run software.

We believe agents will take on more of the work of creating and operating software. That software will need a dependable place to run, data that survives failures, and someone responsible for keeping it healthy.

**Server Guy should be the infrastructure those agents can depend on.**

An agent should be able to bring an application to Server Guy and ask: “Deploy this. Keep it healthy. Help it recover when things fail.” Server Guy should carry that work forward after the conversation ends, preserving the application's history and making its condition understandable to whoever comes next.

Our ambition is to make deployment, updates, backups, and recovery dependable capabilities that people and agents can use without rebuilding an operational setup for every project. That includes the applications they create and the self-hosted open-source tools they rely on.

Coolify is our explicit feature-parity benchmark for self-hosted deployment and operations. We aim to match the useful operational capabilities while moving setup, investigation and routine care into work the agent carries out and verifies. The [product requirements](../../../PRODUCT.md#supported-scope) and [capability inventory](../../specs/self-hosting-capabilities.md) keep this target concrete, including gaps and intentional deferrals.

**Owning infrastructure should not require becoming an infrastructure specialist.** A person should be able to say, “Keep this application running on my server. Back it up. Tell me when you need me.” Server Guy should take responsibility for the routine work and make the decisions that need the owner's judgment clear.

Useful diagnostics, health checks, and recovery should come with that capability. People should not have to assemble and learn an observability stack before they can trust their application to run. Server Guy should use the tools and evidence it needs behind the scenes, explain what it knows and what remains uncertain, and make the underlying evidence available when someone wants to investigate. More specialized integrations can follow the needs of the application.

The people behind those applications should retain ownership of their infrastructure, control over what happens, and evidence they can inspect. They should be free to change agents while their applications keep running and their operational history stays with them.

## Earn the advantage through experience and execution

Capable general-purpose agents can build deployment and operations infrastructure too. Server Guy's value is providing and maintaining those capabilities as one coherent product: clear UX and dependable orchestration of deployment, updates, backups, approvals, and recovery.

UX means people can understand what is happening, inspect the evidence, and make the decisions that need their judgment. Orchestration means accepted work continues across waiting, failures, and restarts, with its outcome verified and recorded. Both must work together for people to trust the product.

We should expect others to copy features, interfaces, and workflows. Our ambition is to lead through the judgment behind them: operating real applications, learning from failures and user feedback, and turning those lessons into better behavior and simpler experiences. That accumulated understanding and earned trust are harder to reproduce than a feature list, but they remain an advantage only if we keep improving.

The founder's engineering judgment, product taste, and ability to explain and teach the work should grow alongside Server Guy. Each verified result should strengthen both the product and the expertise behind it. Being difficult to copy is something to earn through continued work, not something to assume about ourselves.

## Start with people. Grow to serve their agents.

First, build a server operator that people want to rely on directly. Make its assistant and interface useful. Get real applications live, keep them healthy, and earn trust through updates and failures.

Then make that same operational capability available to their preferred agents. The application owner remains the customer; agents become another way to put Server Guy to work.

Today's work follows the [development roadmap](../../../ROADMAP.md). Detailed agent integration design can wait until there is a concrete need. Build the human product well, and let the foundation earn its broader role.

*Broader ambition agreed on 2026-09-05; self-hosted positioning and initial repository-to-server scope confirmed on 2026-09-08. These are goals, not shipped-capability claims.*

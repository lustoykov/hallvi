# Plugins are an optional later extension

Status: deferred, 9 September 2026. Supersedes the 8 September instruction to build the plugin runtime as a core requirement.

The accepted experience uses stable application views and reusable interactive operation receipts. Core deployment, care and observability must work without generating UI code or installing a plugin.

If extensibility is revisited, **Plugin** is the single term for an extension that may include UI, fetching/processing, authorized actions, configuration and state. Do not build a separate “artifact” runtime first. Isolation, revisioning, import/export and recovery need design when a concrete plugin use case is scheduled; a marketplace is not required.

See [Product](../../PRODUCT.md#experience) and [Roadmap](../../ROADMAP.md#later-and-excluded). Earlier [extension research](../research/agent-configuration-and-generated-views.md) is background, not an implementation commitment.

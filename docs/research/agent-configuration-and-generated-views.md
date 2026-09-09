# Agent configuration and generated views

> Dated research/reference, not an active requirement or implementation plan. Current scope is in [Product](../../PRODUCT.md) and delivery is in [Roadmap](../../ROADMAP.md). Recheck version-sensitive facts before use.

Research date: 2026-09-08. Primary documentation checked live; no product installed or executed. These are moving documentation pages, not a claim about every released version. The requested `badlogic/pi-mono` GitHub URLs currently redirect to `earendil-works/pi`; links below use the redirected repository. This research note does not establish Server Guy implementation state.

## Verified mechanisms

### Pi: files, executable extensions, and terminal UI

Pi reads global `~/.pi/agent/settings.json` and project `.pi/settings.json`; project settings override global settings, with nested objects merged. Settings can be edited directly or through `/settings`. Settings identify extension, skill, prompt, theme, and package resources. Project trust controls loading project resources and executing extensions. [Pi settings](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/settings.md)

Pi explicitly invites users to ask the agent to create TypeScript extensions. Extensions can register tools and commands, react to lifecycle events, alter tool behavior, and supply interactive terminal components through `ctx.ui.custom()`. Global/project extension directories support `/reload`. Extensions run with the user's full system permissions. `pi.appendEntry()` persists extension data in the session without adding it to model context; `registerEntryRenderer()` can render those entries in the transcript. The custom component API is terminal UI: RPC mode does not provide the same rendering and `custom()` returns undefined there. This is evidence of an agent extending its host through a documented API, not evidence of a ready-made React dashboard host. [Pi extensions](https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/docs/extensions.md)

Pi packages bundle extensions, skills, prompts, and themes for distribution through npm or Git. Resources can be declared in `package.json` under `pi` or conventional directories. The documentation explicitly suggests asking Pi to bundle these resources. Git references can be pinned to tags or commits. A shared package therefore carries reusable behavior/resources; it should not be confused with a complete user-state backup. The reviewed Pi pages do not establish an integrated backup/restore command. [Pi packages](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md)

### OpenClaw: validated configuration and explicit UI extension contracts

OpenClaw supports directly editing `~/.openclaw/openclaw.json`; its Gateway watches changes. The Control UI generates settings forms from the live schema, including plugin/channel schemas, and also offers raw JSON editing. Validation is strict. Tooling can inspect a schema subtree, read a configuration snapshot/hash, submit a partial `config.patch`, or replace the whole config with `config.apply`. This demonstrates a useful separation between agent-friendly mutation and a human-readable editor over the same configuration. [OpenClaw configuration](https://docs.openclaw.ai/gateway/configuration)

Plugins can be installed from package registries, Git, or local code and configured under `plugins.entries.<id>.config`. In default hybrid reload mode, ordinary plugin configuration and enable/disable changes hot-reload for new turns unless a plugin declares a restart-triggering prefix. Installing/updating/removing plugin code requires a Gateway restart, which a managed Gateway can trigger automatically. CLI runtime inspection loads the plugin in the CLI process; it does not prove the running Gateway loaded it. The docs require an actual effect to verify that runtime. [OpenClaw plugins](https://docs.openclaw.ai/tools/plugin)

OpenClaw has two relevant browser extension mechanisms. `controlUi` declares compiled JavaScript/CSS for a native browser entry. User-installed native UI requires an experimental setting, disabled by default; assets use immutable revisions and an explicit UI reload flow. Native UI runs with the application's browser trust. Separately, `dashboard.dataBindings` and `dashboard.actionVerbs` expose plugin Gateway RPCs to granted widgets. Data methods must belong to that plugin and carry `operator.read`; action methods require `operator.write`. Optional JSON Schema validates action parameters. The same manifest supports `backupResources`: plugin-owned paths marked `include` or `regenerable`, resolved under state/agent roots without executing plugin runtime. [OpenClaw host surface fields](https://docs.openclaw.ai/plugins/manifest/surfaces)

### OpenClaw: export settings versus recover an installation

OpenClaw documents authoritative SQLite state in a shared database and one database per agent. Its full archive covers state, configuration, credentials, configured agent directories, and by default workspaces. Supported backups capture owned SQLite databases using the online backup API, rather than copying live database files. Options include full archives, per-database snapshots, Git dumps, and incremental replication. Full archives copy all included data each run. Git dumps preserve deterministic table data; replication protects database bytes and still needs a separate path for configuration and workspace files. [OpenClaw backups](https://docs.openclaw.ai/install/backups)

`openclaw backup create --only-config` saves only the active JSON configuration. A full archive has a versioned manifest and can be verified. `openclaw backup restore <archive> --target <fresh-directory>` verifies and stages recovery into an empty/fresh directory; activation is a separate offline step. Plugin `node_modules` are omitted and must be reinstalled. Restoring rolls back approvals and delivery state as well as conversations; some channel credentials may need relinking. This is recovery, not merely importing preferences. [OpenClaw backup CLI](https://docs.openclaw.ai/cli/backup)

## Recommendations for Server Guy — proposed, not competitor facts

Confirmed direction update: **Plugin** is the single extension concept, with **Add UI Plugin** as the user-facing entry point. Plugins include UI plus supporting logic and can expose data sources or operational actions. The [current architecture](../architecture/agent-directed-operations.md#plugins) builds a small plugin system directly. This supersedes both the earlier Artifact naming and the recommendation below to defer executable extensions behind a view-only implementation. The remaining recommendations below are research history where they differ; verified competitor mechanisms are evidence, not a selected Server Guy runtime.

The useful opportunity is a stable host whose agent can save and revise user-specific views through a small documented contract. A new dashboard does not inherently require a new plugin. Three changes have different requirements:

| Request | Smallest sufficient change |
| --- | --- |
| “Show remaining disk in GB instead of percent.” | Save a display preference over existing byte measurements. |
| “Give me disk, backup freshness, and application errors together.” | Save a view definition binding existing measurements to host components. |
| “Measure a provider-specific storage quota we do not collect.” | Add a collector/integration and its data contract; then bind a view. |

For the disk example, keep the underlying byte measurement, source, and observation time independent of display settings. Decimal GB divides bytes by 1,000,000,000; GiB divides by 1,073,741,824. Changing the unit must not fabricate a new observation. Show stale/unavailable data explicitly. A new view can combine a card, chart, and table without shipping arbitrary application code.

Start with saved view definitions rendered by existing components, optionally alongside generated HTML artifacts for unusual one-off explanations. Introduce executable plugins or a native custom-UI host only when a concrete view cannot fit those options. Pi proves executable customization is feasible; OpenClaw demonstrates the additional contracts for browser trust, read/write bindings, activation, and backup ownership. Neither proves Server Guy needs their entire extension machinery for a disk card.

Keep two user-facing operations distinct:

- **Export setup / import setup:** versioned view definitions, preferences, reusable rules, and pinned extension references. Exclude credentials and resource-instance identities by default. Import validates the version, shows changes, and asks for missing data-source mappings. A view can import successfully while remaining unconnected; show that state.
- **Back up / restore workspace:** durable application records, user configuration, custom source/assets, relevant history, and explicit credential recovery handling. Include a manifest and checksums, create a consistent database snapshot, restore to a staging location, then verify data-source connections and runtime behavior. Re-fetch measurements after activation instead of treating old observations as current truth.

Do not make generated files the sole storage location by accident. A durable configured view needs an owner, saved revision, referenced data sources, and an export representation. Whether the primary record is JSON on disk or a database row is an implementation choice; a stable export format can support either. Keep compiled dependencies and caches regenerable, while backing up custom source and non-reproducible data. This provides user ownership and recoverability without requiring a public plugin ecosystem first.

## Concrete fit for the current Server Guy worktree

Verified against the prototype worktree on the research date:

- `src/components/server-guy/prototype-adaptive/observability.tsx` already separates `ObservationData` from `ObservationView`. The latter contains a version, name, block order and error filter. `proposeObservationView` is a deterministic text matcher, not a model call.
- `experience.tsx` stores accepted and proposed views in React state. Acceptance changes the visible view, but these customizations do not survive reload. This is an interaction prototype, not durable configuration.
- `src/server/db.ts` uses SQLite through Drizzle. Use this existing store for accepted application configuration rather than introducing a second authoritative file tree for dashboard settings.
- `src/server/pi.ts` disables ambient Pi extensions, skills and project context, and supplies Server Guy-owned tools. Enabling arbitrary Pi extensions would be a deliberate change in execution authority, not something necessary to support generated dashboard definitions.

### Provider recommendations

The subsequently confirmed positioning is **Server Guy — the agent for self-hosted software**, initially deploying applications from the user's repository to servers they control: their own machine or home server, a rented VPS, or a raw cloud instance such as EC2. Physical hardware ownership is not required. This narrows the earlier exploration of arbitrary hosting destinations; managed application platforms such as Vercel and Railway are outside the initial scope. Supporting DNS/CDN services remain applicable. Subsequent clarification brings packaged tools into requirements testing now; see the [compatibility cases](../testing/self-hosted-compatibility.md). A first repository-to-server implementation does not make repositories mandatory for all supported software. See [Product](../../PRODUCT.md) for the confirmed product boundary.

Revised after user feedback: a fixed provider catalogue is too restrictive. Let the agent investigate and recommend deployment paths using repository evidence, current provider documentation, available tools and account access. Existing integrations advertise known capabilities and useful defaults; their absence does not automatically exclude a provider. General execution mechanisms such as SSH, scoped API calls or a CLI can support a newly investigated path without a bespoke provider adapter. Compute, DNS, domain registration and CDN remain distinct choices.

Present one recommendation with a short reason and a way to discuss or change it. A hypothetical example is: “Use your existing server and DNS account; this API does not currently need a CDN.” Ask only about facts that change the recommendation. Model confidence alone does not establish operational support: establish access, runtime compatibility, intended effects, cost constraints, observable success and recovery limitations. Exploration can begin with read-only inspection; actual changes stay within the user's execution authority. Record created resources and verify outcomes even when the execution path was discovered during the task. Show missing access or uncertain lifecycle support honestly.

Use a few thoroughly exercised server deployment paths as initial defaults and evaluation cases, rather than encoding them as a permanent provider allowlist. The agent can investigate another provider within the user-controlled-server scope; the absence of a dedicated adapter alone does not disqualify it. Exploring alternatives in a separate conversation should reference the same saved application decision and not silently change it. The scope identifies infrastructure Server Guy operates, not where its control plane must run.

### Design for extensions from the start

Reserve explicit extension boundaries now for collectors/data sources, operational tools and custom UI renderers. A built-in component catalogue is the initial implementation, not a permanent limit on what the agent may create. Ordinary view composition remains declarative; an unusual interface may use a generated custom renderer with an explicit data/action interface. Generated browser code should not receive provider credentials or unrestricted control-plane execution.

Before executable extensions ship, define their stable identity/version, declared inputs and permissions, owned configuration/state, activation/disable behavior and backup/export representation. Save custom source and pinned dependencies alongside the extension's configuration so it can be reproduced or restored. An extension introduces a mechanism; it does not grant itself authority for operational actions. This is an architectural seam to preserve now, not a requirement to build a marketplace or complete plugin SDK in v1.

### Agent introspection and saved views

Expose tools to inspect installed capabilities, current connections, available measurements, configuration schemas and the current saved revision. Let the agent propose validated changes against that revision; reject stale writes if another conversation has changed it. This gives “self-aware” a concrete meaning: the agent can read what this installation can do and what is configured.

For “show disk usage in GB,” resolve the application host and relevant filesystem, read a real used/total byte observation, and propose a storage card bound to that source. Show its observation time. If collection is absent, explain the missing capability instead of producing synthetic values. A usage history requires retained measurements; one current reading cannot supply a historical chart.

The user sees a preview, can ask for changes, and can keep it on their dashboard. Acceptance saves a revision in the existing store; undo restores the previous view definition. Core runtime health, urgent issues and backup status remain reliably accessible as custom views evolve. An export file contains the portable definition, schema version and dependency references; importing validates it and resolves host/source bindings for the destination installation. A full Server Guy backup also includes its configuration/history and any custom extension source/assets. Application database backups and telemetry retention remain separate responsibilities.

This proposal adds no runtime code and makes no claim that provider integrations, persistence, collectors or plugin loading have been implemented by the prototype.

# Adaptive agent experience

> Archived reference, 9 September 2026. Preserved for evidence and migration; instructions and unchecked lists below are historical, not the current product plan. See [Product](../../../../../PRODUCT.md) and [Roadmap](../../../../../ROADMAP.md).

Prototype evidence imported from `codex/railway-experience`; its code and screenshot files remain in that prototype worktree until integration. This document records that experiment, not verification of PR #21 or this integration branch.

September 8, 2026. Extends the conversation/live-application prototype at `/prototype/railway`. The previous version remains at `/prototype/railway/previous`; it retains the earlier release/recovery walkthroughs.

## Product direction

**Server Guy is the agent for self-hosted software:** deploy applications, keep them healthy, and protect their data on servers the user controls. The first journey is an application from the user's repository running on their own machine, home server, rented VPS, or raw cloud instance. Managed application platforms are outside the initial hosting scope; DNS and CDN services can still support these deployments. Installing and maintaining existing packaged software is a later expansion. See [Product](../../../../../PRODUCT.md) for the confirmed scope and operating boundary.

The user asks for repository-aware agent planning and composition, a vertical evolving progress view, and inline requests for the access or decisions needed to continue. The agent investigates deployment options within the server scope, recommends a minimal path with its reason, reuses suitable existing infrastructure, and allows discussion or override. The prototype's small provider choice set demonstrates this interaction; it is not a permanent provider allowlist or mandatory CDN. The initial implementation scope remains deliberately small.

Design extension boundaries for data sources, operational tools, and custom UI components now. The built-in component vocabulary is a starting point; generated custom renderers can extend it through explicit data/action interfaces, with versioned configuration and backup/import/export support. The current prototype implements neither executable extensions nor durable customizations; the proposed architecture is recorded in [Agent configuration and generated views](../../../../research/agent-configuration-and-generated-views.md).

The normal flow is an accepted goal followed by autonomous work. The displayed plan is an explanation of that work, not a set of stages the user must navigate. A provider request appears only when required. An input answer starts a connection check; it does not establish successful access by itself.

## Implemented experiment

`prototype-adaptive/model.ts` contains **synthetic** repository evidence, agent plans/compositions, and executor observations. `experience.tsx` renders a shared component vocabulary without framework-specific JSX branches. Three demonstration repositories produce different plans and component orders:

- Python web application: application and PostgreSQL; discovers migration configuration and inserts a schema compatibility check after build.
- JavaScript static site: build logs become prominent; no database; public page and asset verification.
- Python background worker: worker, persistent output storage, and logs; no website, database, DNS connection, or HTTP health check; verifies a sample job and output.

These are examples demonstrating the contract, not a framework catalogue or real repository inspection. This experiment does not prove support for arbitrary Python/JavaScript applications. It makes no model calls or provider writes.

The shared vocabulary includes application previews, resources, variables, logs, evolving progress, inline access requests and a setup recommendation with an override. The plan controls what is present and its order; trusted components control rendering and interactions. Unknown resource types and unsupported deployments would require further work, not fabricated success.

The first provider pool is intentionally limited: an existing Hetzner server, plus Hetzner DNS or Cloudflare DNS. The agent proposes reuse, with a DNS override in the suggestion or the inline domain question. Selecting Cloudflare does **not** claim a CDN has been configured. No new paid resources, registrar transfer, replacement of existing records, or automatic provider signup is simulated.

First-time setup pauses for SSH access and, for web applications, the existing domain's DNS provider. Instructions are inline. No private keys or API tokens are collected. A protected connection mechanism, scoped credentials and actual provider checks remain production work.

## Agent/executor boundary

The rendering contract is data, not arbitrary generated JSX or executable HTML:

- Agent proposal: action IDs, labels, purpose, referenced resources, component kinds and order; reason for revising a plan.
- Executor observation: a result tied to the active action ID. This controls completion and verified state.
- User input: answers or connection choices tied to the outstanding request. It cannot directly mark an action complete.

A revised plan keeps completed evidence and stable action IDs. The demo inserts a newly discovered action without rewriting already completed work. The eventual agent integration must validate generated component arguments and supported provider operations, keep credentials outside transcript data, and evaluate model changes against successful deployment/recovery outcomes. Better model capabilities are an opportunity for better decisions, not automatic proof of improved behavior.

## Sources

- Hetzner supports domain registration: https://docs.hetzner.com/robot/domain-registration-robot/getting-started/ . DNS can be managed through the console/API: https://www.hetzner.com/dns/ . Domain registration, DNS, hosting, and a CDN are separate responsibilities even when supplied by one company.
- Adding an SSH key to a Hetzner project does not install it on an existing server: https://docs.hetzner.com/cloud/servers/how-to-rescue/change-ssh-key/ . This is why the inline guidance distinguishes server authorization from project key storage.
- Cloudflare tokens can be scoped for the intended zone: https://developers.cloudflare.com/fundamentals/api/get-started/create-token/ . Cloudflare can proxy traffic and provide CDN/security services: https://developers.cloudflare.com/fundamentals/concepts/how-cloudflare-works/ . Static assets are cacheable by default; dynamic HTML is not cached by default: https://developers.cloudflare.com/cache/get-started/ . A DNS-only connection is not a CDN setup.
- Sutton's Bitter Lesson argues for general methods that can exploit increasing computation. The product inference here is to put repository interpretation, planning, and presentation selection behind an agent contract instead of accumulating framework-specific wizards. It is not a claim that stable UI components, execution tools, or outcome evaluation should disappear.

## Verification

`node --import tsx --test tests/prototype-adaptive/model.test.ts` covers out-of-order completion, access gating, plan revision with preserved evidence, worker-specific verification, and composition changes between repositories. The current suite has ten passing tests, including dashboard proposal versioning, filter preservation, chart visibility, setup choices, and failed/stale release verification. TypeScript, scoped ESLint, and `git diff --check` pass. Browser checks and finish review are recorded below.

## Architecture direction

The user explicitly preferred the earlier connected diagrams. Architecture therefore uses the main Dashboard area as a graph canvas, with domain/service/data connections from the repository model. Selecting a node opens details on the right. Node placement is derived from topology; the renderer does not have framework-specific diagrams. Resource arrivals use staggered movement, connections animate during work, and verified connections settle. Reduced-motion preferences disable these transitions. The graph is an inspection surface, not the deployment progress timeline.

## Agent-composed observability views

The Dashboard has an Observability surface composed from a metric chart and an application log table. The web application and static site show request traffic; the worker shows completed jobs. Each block names its source, time window, and units, and distinguishes unavailable observations from zero activity. All values and log entries are demonstration fixtures.

From the conversation, “Show me what’s happening” proposes a view. A user can preview it, keep the current version, accept the proposal, or ask for changes in chat. The demonstration recognizes log ordering, warning/error filtering, and requests to hide the chart. Previewing never replaces the saved view; accepting advances its version. The proposed presentation does not alter instrumentation or deployment. Views and versions currently live only in local React state; reload resets them. Automatic suggestions over time, arbitrary queries, instrumentation, live sources, persistence, and a real model are future integration work.


## Earlier browser verification — September 8

Checked in a separate hidden review tab on port 3240, preserving the user’s active tab. Actual viewport was 1163 × 654 CSS pixels. This earlier pass covered the desktop prototype only. Later Chrome desktop/mobile captures and the responsive correction are recorded in the follow-up below.

- Web application: SSH request, connection check, plan revision, Cloudflare DNS override, external verification fixture, completed application/database view.
- Worker: SSH request, sample job/output verification, worker logs, job-rate chart, no domain request or invented HTTP traffic.
- Static site: no-provider-input path, page and asset verification, no database.
- Historical environment switch: this earlier build had independent Preview/Production runs; the follow-up removes the environment model and selector.
- Architecture: connected domain/application/database diagram, selected-node detail pane, all dashboard tabs reachable at the actual viewport.
- Observability: preview leaves v1 intact, keep preserves v1, acceptance saves v2, a logs-only v3 preserves the current warning/error filter, and declining v3 retains v2.
- Browser error log was empty for the walkthrough.

Evidence is in `.impeccable/review/adaptive/`: `ssh-request.png`, `domain-request.png`, `web-complete.png`, `static-site-complete.png`, `worker-complete.png`, `worker-observability.png`, `architecture.png`, `architecture-details.png`, `observability-current.png`, `observability-proposal.png`, and `observability-accepted.png`. Observability proposal capture shows v3; accepted capture shows saved v2. These are viewport captures of independently scrolling app regions, not full-page exports.

The one detector run returned no findings before Architecture and Observability were added. The finish reviewer also receives those later surfaces for manual inspection. Independent finish review found no additional material visual corrections within the supplied desktop scope and one documentation ownership mismatch. The required documenter corrected the earlier route ownership and added adaptive DESIGN.md plus its sidecar. The reviewer scored that documentation fix resolved and returned `disposition: ship`. The verdict pass covers the listed documentation correction; animation smoothness remained unverified, and that earlier verdict did not cover larger/mobile layouts. The follow-up below records later verification.

## Scope clarification from the user

The product is an operational agent with an interface assembled around the user's needs. Its core goals are to deploy the application and give the owner enough observability to understand its health and care. User-authored requests can shape views; the agent can suggest useful additions and revisions. The subsequent clarification below establishes the v1 operating boundary; it is not a claim that all of those operational capabilities are implemented in this prototype.

Confirmed boundary: **Server Guy changes what surrounds the application, never what is inside it, except through a PR the owner merges.** Its application-code proposals are limited to small operability changes.

- **Around the application, it acts:** Dockerfile, process definitions, environment and secrets, running existing migrations, domain, TLS, backups, restarts, rollbacks. Actions remain tied to the accepted goal and permissions.
- **Inside the application, it hands off:** exceptions, incorrect behavior, or a migration failing because of code. Produce the diagnosis card structure from M — where, impact, cause with evidence, next — plus a copyable packet for a coding agent. Include the affected revision, relevant log excerpts, observed behavior, and the verification that failed; separate observed facts from suspected causes. Do not include secrets in the packet.
- **Operability code is the narrow exception:** propose a health endpoint, environment-driven port, or application start entrypoint as one small PR. The owner merges it before deployment. Server Guy does not write business-logic fixes. Running an existing migration is operational; changing migration logic stays with the coding agent.

The handoff loop closes when the coding-agent fix comes back as a new revision: Server Guy deploys and verifies it through routine release. The diagnosis packet, operability PR flow, and cross-agent handoff remain future implementation work. Earlier N/M behavior is user-provided precedent, not evidence that the adaptive route has those integrations.

A stable summary should keep service reachability, latest successful backup, and items needing attention legible even as optional views evolve. Backup success and restore verification are distinct facts; neither should be implied by a connected database. The current demonstration correctly says backups are not configured. Actual backup execution, scheduling, restoration checks, and error handoff bundles are not implemented in this prototype.

## September 8 follow-up: conversations, setup, releases, and naming

This section supersedes the earlier fixed provider pool, two-environment demo, and progress-first working composition.

- Dashboard is above a conversation list. New conversations have independent messages and drafts; application deployment, configuration, dashboard, and release state are shared. The launch transcript stays with the conversation that initiated it. Switching conversations does not restart work.
- Stable application/resource information precedes the growing progress block. The embedded application display reserves the same minimum height before/after verification. Demo controls are tucked into a disclosure.
- There is one application, with an editable name and a connected repository. The Production label and Preview environment selector are removed. A second deployment of the same repo would be another application with its own name/address; creating that second application is not implemented here. The embedded synthetic application display is not a deployment-preview environment.
- After repository inspection, the agent recommendation can reuse Hetzner, Hostinger VPS, Amazon EC2, or the user's own Linux/home server. DNS is selected separately: Hetzner, Cloudflare, Hostinger, or Route 53. New cloud-server creation is a user/provider-console prerequisite with provider-side pricing, never a simulated automatic purchase.
- Public delivery follows workload and existing accounts: direct HTTPS by default; Cloudflare static-asset CDN when suitable; a home website can use an outbound Cloudflare Tunnel. Workers get no DNS or CDN steps. A Cloudflare path explicitly requires domain activation there if DNS currently lives elsewhere, while keeping registration and unrelated records intact. Provider-specific connection instructions replace the previous fixed SSH/DNS text.
- CDN/Tunnel steps are inserted before publishing/verifying the public address. Access answers start checks; only executor observations complete the steps. Tunnel verification does not imply cache verification. These decisions are deterministic fixtures standing in for an agent, not a live model.
- A simulated GitHub push on main surfaces an exact candidate revision. The user clicks Deploy revision or asks to deploy it in chat. Build/check success promotes the candidate; failure keeps the prior revision current. The demo includes failure and retry controls. No deployment-preview environments or automatic-on-push mode are implemented.

Sources checked for setup realism: [Hostinger VPS SSH](https://www.hostinger.com/support/5723772-how-to-connect-to-your-vps-via-ssh-at-hostinger/), [EC2 access prerequisites](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-instance-connect-tutorial.html), [Cloudflare caching defaults](https://developers.cloudflare.com/cache/get-started/), and [Tunnel setup](https://developers.cloudflare.com/tunnel/setup/). Cloudflare's standard public-hostname setup requires a domain activated in Cloudflare; outbound Tunnel connectivity does not itself grant Server Guy administrative SSH access.

All connections, account state, repository events, commands, and outcomes remain synthetic. Names, conversations, and saved views reset on reload. Ten behavior tests cover executor gating, setup composition, worker exclusions, recommendation choices, and failed/stale release verification. TypeScript and scoped ESLint pass. Follow-up browser review is recorded separately from the earlier verdict above.

Navigation follow-up: Dashboard has one persistent sidebar entry. Generic Dashboard buttons in the conversation header and live pane were removed. Contextual deep links still open a specific revision, observation proposal, or resource.

Follow-up checks ran in an isolated browser tab at 1163 × 654, without driving the user's active tab. Verified editable application name, independent conversation messages/drafts, no environment selector, exactly one generic Dashboard button, home-server SSH/Tunnel flow, EC2-specific instructions, Hostinger + Cloudflare CDN flow, and candidate failure/retry/promotion. No browser runtime errors were reported. Additional actual Chrome captures cover 1450 × 1231 and 390 × 844 CSS pixels. The mobile correction adds a Menu drawer and an Application status toggle at widths up to 760px, keeps the primary chat/composer full width, and presents contextual details as a workspace overlay. Desktop composition remains unchanged. Evidence: `.impeccable/review/providers/user-1450.png`, `.impeccable/review/mobile.png`, `.impeccable/review/providers/mobile-menu.png`, and `.impeccable/review/providers/mobile-status.png`; the in-app browser follow-up captures use the `final-*` filenames in the providers review directory. These establish the captured layouts and menu/status controls. Mobile setup selection, its action, menu switching, and resource detail opening were also checked; no comprehensive mobile accessibility certification is claimed. The single detector run returned 65 advisory design-system metadata mismatches (39 font-size, 23 color, 3 radius), predominantly incumbent values; no non-advisory findings. These go to the finish reviewer without an unsolicited theme rewrite.


Final follow-up review: `disposition: ship`. The reviewer scored both listed fixes resolved: usable mobile composition and accurate documentation. That verdict covers the correction list, not comprehensive whole-product certification. Further evidence: `providers/mobile-setup.png`, `providers/mobile-details.png`, and `providers/desktop-recheck.png`. Chrome viewport overrides were reset after testing.

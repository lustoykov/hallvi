# Changelog

What changed in each Hallvi release, newest first. An installed Hallvi shows this under **What's new**, from its version at the bottom of the sidebar, and each release's page on GitHub carries the same notes.

A release's notes are written in the pull request that raises its version, as a `## <version> — <date>` section at the top. [Publishing a Hallvi release](docs/releases.md) describes the rest.

## 0.1.1-alpha.14 — 1 October 2026

Keep completed replies visible, choose the right application and stop interrupted work even when the model connection needs renewing.

- **Distinct application names.** The application switcher shows each saved name, so two deployments of the same repository stay distinguishable. Switching and reloading keep each conversation's draft with its own application.
- **Stop without signing in again.** After a worker restart, Stop can cancel interrupted work and unread queued messages even if the model login has expired. It does not start model calls or server commands.
- **Replies stay complete.** A delayed page response can no longer replace a completed live reply with an older partial reply or leave the conversation looking busy.
- **Forgotten traffic stays forgotten on screen.** Forget clears the page's saved chart as well as the stored totals, so restarting collection cannot bring deleted figures back when the next read fails.
- **Overview starts with visitors.** Deployed applications show recorded visitor traffic first, followed by response time, server errors, server load and the running release. Unknown facts remain explicit.

## 0.1.1-alpha.13 — 1 October 2026

Install the traffic script reliably, use it without a mandatory banner, and keep Hallvi's operator and plugin easier to follow.

- **Working traffic-script installation.** The installer now puts the script where the operator reads it. Native clean-install and upgrade checks exercise that installed path, so a running service alone cannot hide a missing asset.
- **Script-only browser measurement.** The plain include measures immediately, without a banner or mandatory grant callback. It uses no cookies, browser storage or persistent visitor identifier. Existing site controls can still explicitly disable and re-enable measurement. This is no claim of consent exemption or legal compliance.
- **Correct browser routes and proxy setup.** Applications can explicitly count hash routes, and Traefik setup uses stable names for each application's router and service. Traffic storage, log rotation and repeated live reads handle contention and cleanup more consistently. Goals still require the owner's own instrumentation.
- **Updated operator and models.** Pi uses its current published runtime; OpenRouter choices use the current catalog. Existing accounts and chosen models remain retained, and completed host setup closes obsolete requests.
- **Clearer settings and plugin updates.** Settings separates connections and model choices, the compact plugin exposes the operator and current work, and the plugin updater explains how to recover an already-rendered panel. Native ChatGPT rendering remains unverified.

## 0.1.1-alpha.12 — 30 September 2026

Ask the existing Hallvi operator from Codex, understand Traffic setup, and find Hallvi settings and updates in one menu.

- **Codex and ChatGPT plugin proof of concept.** A separately built adapter can list existing applications, read the main conversation and recorded evidence, send work to Pi, and follow the result. Its compact operator panel keeps approvals, missing input, Continue and Stop in Hallvi. Native Codex use has been observed; native ChatGPT rendering and the updated panel over SSH remain unverified. See the [plugin setup and limits](https://github.com/lustoykov/hallvi/blob/v0.1.1-alpha.12/docs/hallvi-plugin.md).
- **Traffic history starts with the access log.** History collection is on by default once Hallvi has a recorded access log. Stop keeps saved totals; Forget removes them. The Traffic page explains what the optional browser script adds and keeps its installation checklist easy to find.
- **More accurate page counts.** Static assets no longer count as page visits, and query-routed applications retain their configured page routes.
- **One Hallvi menu.** Open the Hallvi row at the bottom of the sidebar for Settings, What's new and Check for updates, with update status shown there too.
- **Deployment file timestamps.** Transferred repository files keep the selected commit's modification time instead of the deployment time.
- **Clearer open setup requests.** Pi can withdraw an obsolete host or domain setup card after verifying work completed in conversation. The plugin shows when open requests were asked without presenting an older card as the operator's current blocking state.
- **Patched dependencies.** Update the WebSocket runtime and development brace-expansion dependencies within their supported major versions to address published security advisories. Pi's shrinkwrapped runtime copy of brace-expansion remains an upstream dependency limitation.

**Known Traffic limits:** hash-based application routes are counted as one page, the supplied Traefik script labels need unique names when used for several applications, and Traffic database contention and live country-cache retention remain recorded follow-ups. See the [merge audit](https://github.com/lustoykov/hallvi/pull/292) for the reproductions and scope.

## 0.1.1-alpha.11 — 30 September 2026

Find the newest signed release even when GitHub lists older releases first, and keep traffic observations clearer.

- **Reliable release discovery.** Hallvi checks newer version tags before reusing a previously verified release. The normal installer follows GitHub’s latest published release; signature and archive checks still apply. Older installed versions affected by release ordering can recover by running the official installer again.
- **More accurate traffic observations.** Traffic retains partial-count labels, validates query-routed page values, and handles log rotation, catch-up and closing browser views more consistently.
- **Cloudflare cache rules.** Pi can inspect cache rules and maintain Hallvi’s own rule for a hostname while preserving existing owner rules.

## 0.1.1-alpha.10 — 29 September 2026

See application traffic, follow long conversations with less repeated loading, and hand a diagnosed code problem to a coding agent.

- **Traffic in Hallvi.** See recorded visits, pages, sources, errors and response times from supported server access logs. History collection is optional; Stop keeps saved totals and Forget removes them. An optional site script adds navigation and engagement observations.
- **Lighter live conversations.** Open chats receive changed records instead of repeatedly downloading their entire history. Reconnecting still restores the full conversation. Opening a conversation also does less startup work, and simultaneous readers of one chat share pending history reads.
- **Clearer interruption evidence.** Recovery names the latest recorded tool result and unresolved action, and shows waiting follow-ups. Stop does not claim that a remote command stopped or that nothing ran.
- **A complete coding-agent handoff.** Ask Hallvi to save a standalone problem packet with the observed revision, reproduction, evidence, uncertainty and an acceptance check. Copy reply carries the complete packet to your coding agent.
- **Clearer saved checks.** Record instructions distinguish an observed check, a reported fact and a planned check, with useful guidance when an invalid value is rejected.
- **Consistent Overview checks.** An application failure no longer marks passing server checks as failed. Failed or informational timeline groups do not claim their checks passed.
- **Deploy public repositories manually.** Choose “Only when I ask” and a public repository branch without connecting GitHub. Automatic deployment and private repositories still require a GitHub connection.
- **Load the updated interface.** After this page observes an update finish, Reload page explicitly loads the new interface. The confirmation asks you to preserve attached images and unsaved settings first; existing text-draft recovery remains. Older pages without this action still need a normal browser reload.

## 0.1.1-alpha.9 — 29 September 2026

Reconnect a saved private address and get clearer information when a conversation loses its connection or ends early.

- **Reconnect private access.** An established private route has a Reconnect action that asks Pi to restore that saved route through the main conversation, under your existing permissions.
- **Know what was checked.** Private access distinguishes a recorded address from an observed connection, keeps checks tied to their route, and shows when the result was observed.
- **Recover without a stale error.** A temporary settings-read failure clears after a successful refresh. Failed or uncertain saves remain visible.
- **Understand an early failure.** When Pi records a useful failure reason, the conversation and terminal result show a bounded, redacted diagnostic. Missing evidence stays unknown.

## 0.1.1-alpha.8 — 29 September 2026

Hallvi does less repeated work in long conversations and keeps its interface responsive while storage is busy.

- **Lighter chat updates.** Unchanged execution history is reused, idle conversations wait for changes, and database work runs outside the main JavaScript thread. The layout and controls stay the same.
- **Restarts with open chats.** Stopping or restarting Hallvi finishes even while conversation pages remain open.
- **Clearer work in progress.** The conversation names the action and its target while Pi works, and elapsed time stays readable on narrow screens.
- **Requests from a terminal.** Use `hallvi apps`, `exec`, `wait` and `inspect` to send work to a named local controller and read the recorded result. Existing permissions still apply; approvals stay in the browser.
- **Images in conversations.** Attach, paste or drop up to four images into a message as context for Pi. Sent images remain available after reloading the conversation.
- **Clearer Deployment and Jobs pages.** Deployment leads with the running release and access status. Jobs lists recorded schedules, recent runs and failures together.
- **Know which computer is running Hallvi.** The top bar names the controller's computer, including when you connect through an SSH tunnel.
- **Keep deployment fixes in the repository.** Pi is instructed to offer a pull request when deployment needs a repository change, so later deployments can reuse it. Publishing still requires agreement; Pi does not merge it.

## 0.1.1-alpha.7 — 24 September 2026

Hallvi now tells you what changed when it updates.

- **What's new.** Every release's notes are one click from the version at the bottom of the sidebar, and from the notice after an update finishes. They come with the version you installed, so they read the same with or without a connection.

## 0.1.1-alpha.6 — 24 September 2026

Hallvi now starts on GPT-6 Sol, and an application's pages tell one consistent story about what was actually observed.

- **GPT-6 Sol by default.** New setups start on GPT-6 Sol with high reasoning, on Pi 0.87.1. A model you already chose stays chosen; change it in Settings.
- **One Access page.** Domains and Security are now one page: what a visitor sees at each address, which ports are open to whom and whether that was tested from outside, and the path a visitor takes to reach the application. Publishing at your own name, and making the application private again, start here.
- **Backups tells the backup story.** Backups opens on four figures: how much of your data is in a copy, how old the newest copy is, whether a restore was tried, and what the plan says. Storage and Database each keep one line that links there.
- **Known instead of blanks.** Processes and Database replace columns that were mostly empty with one Known column, such as "4 of 7 facts". Opening a row names what nobody has checked yet and offers to check it.
- **The sidebar grows with the application.** A page is listed when something on record gives it content. The rest wait under **Show more**, each with a short reason.
- **Commands say what they are for.** Every command carries a short intent, such as "Check the database answers", and that is its title in the conversation, approvals, Overview, History and Deployment. The exact command stays visible, and the command is what you approve.
- **Pages agree with each other.** Overview and History use one rule for what needs you. Hallvi's own access checks no longer count as visitors. A published address counts as answering only when a check saw it answer. Storage and Backups use the same volume names as Architecture. The permission mode "Pi decides" is now "Hallvi decides".
- **One top bar.** Settings, setup and Add application use the same light top bar as the rest of Hallvi, and the browser tab shows the Hallvi mascot.

## 0.1.1-alpha.4 — 22 September 2026

Hallvi can now deploy an application automatically when its tracked GitHub branch changes.

- **Deploy from pushes to main.** Choose automatic or manual deployment during setup, or change it on the Deployment page. Hallvi checks the selected branch about once a minute using the existing GitHub App connection, then asks Pi to deploy and verify the exact commit. No webhook, extra token or GitHub workflow is needed.
- **Deployment controls and history.** Pause or resume automatic deployments, change the tracked branch, deploy the latest commit, and retry a failed attempt. The page distinguishes the latest attempt from the last verified release.
- **Clearer application cards.** Click a card to open its application. Attention states explain the current issue and next step instead of treating every recommendation as a problem.
- **Visible Hallvi update progress.** Download, verification, installation and reconnection stay visible on desktop and mobile. Losing the connection preserves the last reported progress.
- **Shared account connections.** GitHub, Hetzner and Cloudflare connections live beside the model account, so every Hallvi on the machine uses the same logins.

Automatic deployment is opt-in and begins after the first verified release. Hallvi must be running to notice changes. Your permission mode still applies, and a failed commit waits for Retry or a newer commit rather than retrying on its own.

## 0.1.1-alpha.3 — 21 September 2026

- **Check for updates in the sidebar.** A **Check for updates** button sits below the version at the bottom of the sidebar. It checks at once and shows the result; installing stays a separate **Update**.

## 0.1.1-alpha.2 — 21 September 2026

- **Private repositories deploy through your GitHub connection.** Hallvi transfers the exact commit of a private repository to its server using the GitHub App you already connected, and fetches the branch again for later deployments, without asking for a separate repository token.
- **Deployment, Processes and Database as registers.** Each is one table whose rows open in place. An opened release shows its steps beside one terminal.
- **Architecture draws the recorded route.** Ports, gateways and the path in, such as Internet → Caddy on 443 → the application, are drawn as recorded. Connection checks are listed apart, successful ones first.

## 0.1.1-alpha.1 — 21 September 2026

The first signed alpha release.

- **One-line installation** on Apple-silicon macOS or Ubuntu 24.04 x64. No repository clone or Node.js installation is needed, and Hallvi runs as a background service.
- **Signed updates.** Hallvi looks for new alpha releases once an hour and installs one only when you press **Update**, after checking it against a signed manifest.
- **From another computer.** On a Mac mini or a headless Ubuntu machine, choose **From another computer** and follow the printed SSH instructions.

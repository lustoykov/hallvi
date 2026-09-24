# Changelog

What changed in each Hallvi release, newest first. An installed Hallvi shows this under **What's new**, from its version at the bottom of the sidebar, and each release's page on GitHub carries the same notes.

A release's notes are written in the pull request that raises its version, as a `## <version> — <date>` section at the top. [Publishing a Hallvi release](docs/releases.md) describes the rest.

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

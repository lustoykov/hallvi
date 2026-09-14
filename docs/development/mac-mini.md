# Mac Mini development

Use the owner's Mac Mini for remote agents. Managed Codex cloud setup scripts,
credential persistence helpers and SSH experiments have been retired.

## Native connection

The registered SSH host is `mac-mini`; the Server Guy checkout is
`/Users/lyubomirstoykov/projects/server-guy`. Select that remote project in the
local desktop app. Each task should use a worktree to preserve concurrent work.

For the smallest remote footprint, the local desktop app can start the Mini's
Codex backend over SSH. For desktop browser tools, Computer Use and independent
remote access from other devices, keep the desktop app on the Mini. These are
separate capabilities; SSH alone does not establish desktop-tool parity.
See [OpenAI remote connections](https://learn.chatgpt.com/docs/remote-connections).

On 14 September 2026, SSH and Codex login were verified. The Mini has 16 GB RAM,
Codex CLI `0.154.0-alpha.6.2`, and a desktop app already running. Its CLI launcher
uses the binary bundled in that app. Sleep is disabled on AC power. No running
tasks or desktop processes were stopped. Node was not on the tested SSH login
shell's PATH; application tests and deployment were not verified by this setup.

## Personal skills

An hourly Codex automation on the main computer runs the sync and stays quiet
on success. The computer and Codex must be available for scheduled execution.
For an immediate sync after editing standalone skills, run:

```sh
~/.local/bin/sync-codex-skills-to-mini
```

This one-way, on-demand sync copies skill directories from `~/.codex/skills` and
`~/.agents/skills` to their corresponding Mini paths. It excludes system skills,
plugin caches, credentials and session history. Replaced files are backed up
under `~/.codex/skill-sync-backups` on the Mini; remote-only files are retained.
It creates no resident sync service. Start a new remote task to refresh discovery.

Twenty-two standalone skills were copied on 14 September. Some skills reference
projects or tooling specific to the main computer; their files being present
is not proof that those dependencies exist on the Mini. Install plugins through
Codex on the Mini and authenticate their integrations there as needed.

## Resources and evidence

Keep the existing Default Hetzner project. Credential access during beta remains
trusted; do not print secrets or commit local configuration. Verify outbound SSH,
provider APIs, model calls and browser access separately on the Mini before
claiming deployment coverage. Avoid leaving unused dev servers, browser sessions
or Docker stacks running; do not stop processes belonging to active tasks.

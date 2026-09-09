# Journey 3: Investigate and recover

Status: confirmed operating boundary, 2026-09-08; live incident detection and remote recovery remain implementation work.

The user needs to know what is wrong, who or what is affected, and what is being done. Server Guy assembles a diagnosis with **where, impact, cause with evidence, and next action**. Observed facts remain distinct from a suspected cause.

Within authority, Server Guy changes what surrounds the application: configuration, secrets, process definitions, restarts, rollbacks and related operations. It runs existing migrations; it does not rewrite migration logic as an operational fix. Application errors and incorrect business behavior go to a coding agent through a copyable packet containing the revision, relevant redacted logs, impact, observations and failed checks. Small operability changes follow the owner-merged PR exception in [Product](../../PRODUCT.md).

Recovery is an observed outcome, not a successful command or an asserted fix. Record what is actually serving, its checks and timestamps, and any remaining uncertainty. Check data compatibility before rollback; never imply that a previous image reverses a database migration. A returned coding-agent fix becomes an ordinary [release](05-routine-release.md), closing the loop without making Server Guy a general application coding agent.

Health, current issues, backup status and restore-test evidence stay discoverable even when the agent or user changes optional dashboard views.

## Broken-update scenario and acceptance

“Something broke after the update” is a required core journey. Correlate the exact release with logs and behavior checks, identify the observed impact, and explain whether the evidence supports an operational correction, compatible rollback or coding-agent handoff. Avoid claiming a causal relationship merely because an error followed a release. Preserve the previous working release when feasible; do not guess that a schema-changing release is reversible.

Prove a failed-update investigation with cited evidence, the relevant authority boundary, and fresh verification after recovery. If recovery is blocked, preserve what is serving and provide the concrete next action or handoff instead of presenting a false success.

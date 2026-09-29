# Coding-agent handoff

Pi needs to leave a useful problem report when an investigation reaches an application-code defect outside its operability scope. The owner can then copy the report to the coding agent they choose.

## Selected implementation

Use the existing saved-information record and **Copy reply** action. Pi writes one concise standalone Markdown packet, saves it as ordinary application knowledge, and returns the saved body as its final reply. No packet schema or dedicated card is necessary for this workflow.

The packet includes application and repository identity, impact, reproduction prerequisites and steps, expected and actual behavior, a few relevant redacted evidence excerpts, attempts, uncertainty, and an observable acceptance check for the original failure. It states the observed running revision or explicitly says it is unknown. A repository tip does not establish what runs. Pi distinguishes its own observations from owner reports and hypothetical examples. Missing evidence remains explicit.

Saved prose is cleaned before persistence and before the save result returns to Pi: application-held secret values use their existing placeholders, and recognized credential patterns use the existing redactor. This applies to ordinary record titles and bodies on both creation and update. It does not establish that arbitrary private user data can be identified automatically; Pi must omit that data. Existing record size limits still apply after cleaning.

Pi returns the tool result's saved body, without a second independently drafted report. That lets the existing copy control copy the retained packet. If saving fails, Pi must not present its unsaved draft as the retained report.

## Boundary

The owner chooses where to paste the packet. Pi does not message another agent, open a business-logic repair PR, or perform the repair. A later owner-merged repair returns through ordinary authorized release verification, using the packet's acceptance check when applicable. A merge or a completed answer alone is not evidence that the original failure was fixed.

There is no automatic issue state, repair watcher, release linkage, closure workflow, or new History action in this change. Those mechanisms would need a concrete additional requirement.

## Verification

A focused integration check establishes that creation and update return and persist the cleaned prose, scoped to the application. A browser fixture establishes that the existing copy control copies the complete saved Markdown and still does so after refresh. A bounded real Pi request on disposable local state checks the native request, save, and reply path using explicitly synthetic observations and no host operations.

These checks establish handoff creation and copying. They do not establish a real application's diagnosis, another coding agent's adoption of the packet, or successful repair and deployment.

# Operator execution checkpoint — 12 September 2026

The first implementation slice replaces workflow handoffs with main-conversation execution. It does not complete the new deployment journey.

Verified locally:

- 36 focused tests passed across operator execution, Pi tool wiring, conversation runs and repository workspace source. They cover all three permission modes, approval/decline, cancellation, stopped turns, read-only side tools and the existing native-session lifecycle.
- A temporary loopback OpenSSH server used disposable keys and a verified known-hosts entry. An execution waited for approval in the actual Safari UI. Clicking Approve ran `printf "Server execution verified\n"; uname -s` through the production SSH executor. Chat and its execution card showed success, output and exit code 0.
- A live Pi turn then requested the exact harmless test command through `server_bash`, waited for approval and completed with exit code 0. Its final reply reported `Live Pi execution verified` and `Darwin`. The turn used two model calls.
- TypeScript and focused lint checks passed for the changed runtime/UI code.

The first UI check used a deterministic fixture turn. After the ChatGPT connection became available, the second check used the real Pi runtime and configured model. These are execution checks, not evidence of a Linux application deployment or application health. The temporary loopback SSH server was stopped and its saved connection removed after verification.

This checkpoint keeps existing-host SSH setup explicit. Provider provisioning, private input injection, native queue/steer, concurrent side conversations and shared knowledge presentation remain for later slices. Remaining legacy modules/tables have not all been removed.


Before pushing the checkpoint to main, the full application suite passed (775 tests, two opt-in tests skipped), along with the production build and full lint/format checks. All four current browser smoke journeys were verified: three passed in the suite, and the revised application-creation journey passed on its targeted rerun. Lint retains one existing prototype hook warning. Retired deployment approval/browser tests and staged-Decision crash tests were removed. The workspace transport fixture was corrected to consume the HTTP upgrade request body before parsing tool input.

The local “Operator checkpoint” application uses the synthetic repository `test/operator-check`. A repository-access warning on that record is expected even with a working GitHub login. Its temporary SSH test connection was removed. “Connect existing server” attaches an existing SSH host; provider provisioning is the next deployment increment.


Follow-up: removed the standalone SSH form and duplicate conversation headings after reviewing the intended deployment journey. Host setup belongs with Hetzner/BYOM onboarding. The execution backend remains available for that integration. A Safari reload also exposed differing Node/browser UTC date formats; the initial timestamp now uses deterministic ISO text before switching to local time.

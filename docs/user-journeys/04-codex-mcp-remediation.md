# Journey 4: Hand application errors to a coding agent

Status: v1 uses a copyable evidence packet; integrated MCP or other agent transport is later work.

Server Guy diagnoses the operational impact and prepares a packet a coding agent or engineer can consume: application and revision, where the error occurs, affected behavior, relevant timestamped and redacted evidence, suspected cause distinguished from facts, and the check that should pass after a fix. The interface offers a copy action; credentials are not part of the packet.

The coding agent investigates and changes application code in its own environment. The owner reviews and merges the fix. Server Guy observes or selects the resulting revision and deploys and verifies it through the [routine release journey](05-routine-release.md).

Server Guy itself may propose only small operability application-code changes in an owner-merged PR. It does not become a general coding agent. Integrated agent access can later use the same evidence and authority boundaries; an MCP connection is not a prerequisite for this first handoff.

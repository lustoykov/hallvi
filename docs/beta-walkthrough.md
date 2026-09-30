# First beta walkthrough

Use the candidate archive and checksum supplied together. Record the revision
from `hallvi status`, your OS and Docker version. The owner runs this beta,
with agent-assisted end-to-end verification where useful. Use normal product
screens and record which steps were performed by the owner, exercised by an
agent against real services, or simulated. Reused accounts and developer
assistance must be named; they do not establish fresh external onboarding.

The owner authorized publication on 29 September 2026 once the final integrated
candidate has strong end-to-end evidence and no material unresolved release
defect. A separate external tester is not required. Keep untested onboarding
and platform boundaries explicit in the release evidence.

1. Follow [Installing Hallvi](installation.md) from an empty installation.
   Open the address it prints. Leave **Settings → Workspace** on its default
   **On this computer** setting for a machine without local Docker. If you
   deliberately choose **In Docker**, start the local Docker Engine before
   inspecting a repository.
2. Add a public repository for an app you want to try. Connect ChatGPT (or
   OpenRouter) when Hallvi asks, then choose **Read repository**. Confirm that the explanation
   matches the app and gives you a clear next step. Stop here if it cannot
   inspect the source or asks you to repair development tooling.
3. Choose a dedicated test server: either a new server in a separate Hetzner
   project or an existing machine with no valuable data. Read the contextual
   access explanation and choose the permission mode you want. The
   [beta precautions](beta-safety.md) explain the current limits. For an
   owner/agent rehearsal, the registered development host may be reused with
   a separately named fixture, isolated ports and storage, and preservation of
   every existing application. Check its identity, ownership and capacity
   before deploying.
4. Let Hallvi deploy it and open the private application link. Do something
   meaningful in the app: for example, save a bookmark in a bookmark manager.
   Record enough non-sensitive detail to recognize that exact item later.
5. Refresh Hallvi, leave the conversation and return. Check that its summary,
   saved deployment and access status agree with what you can actually open.
6. Run `hallvi restart`. The saved conversation and app data should remain.
   If private access has closed, Hallvi should say so and help you reopen
   it. Open the same app and verify your saved item is still there.
7. Report where you hesitated, anything you could not understand, and any
   failure. Include the revision and relevant screenshot or exact error;
   exclude tokens, passwords and private data. Avoid repairing the experience
   with developer-only commands during this walkthrough.

This is successful when the tested candidate can be installed, its access
explanation is reviewed, and a useful application result survives return and
restart. Name the tester and any developer assistance rather than implying
that a new external user completed the journey. A successful installation
or an HTTP response alone is insufficient. Public publishing, custom domains
and complex application stacks are follow-up checks, not extra requirements
for this first private deployment.

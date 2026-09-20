# Leaving a conversation to connect, and coming back to it

**Superseded for ChatGPT and GitHub (20 September 2026).** Both sign-ins now
happen in the conversation itself, so there is no trip and nothing to return
from: see [onboarding](../design/onboarding.md). What remains here is the
contract for the pages that are still a detour — model preferences, the
workspace choice, a provider token — and it is unchanged.

The composer used to say "Connect ChatGPT to chat" and point at Settings.
Before that it pointed nowhere in particular: the whole composer was dead, so
the question could not even be written down, and setup ended on the
applications list with no idea which application the reader had come from.

```mermaid
flowchart LR
  D[Draft typed in the composer] --> K[Kept per conversation in this tab]
  C[Open Settings] --> I[application id + chat id in the link]
  I --> V{Both found, and the chat is that application's?}
  V -- no --> A[Setup with no return: All applications]
  V -- yes --> R[Setup with Back to the conversation]
  R --> S[Sign-in saved] --> B[That conversation, composer enabled]
  R --> X[Cancelled or retried] --> B
  K --> B
  B --> M[Message sent] --> F[Draft forgotten]
```

Two things stay out of the link. The **draft** never travels: it is held in
this browser under the conversation it belongs to, and dropped the moment the
message is sent. The **destination** is never a URL: the link carries two
record ids, both looked up on the server, with the chat required to belong to
the application — so nothing typed into that query string can send a reader
off this controller.

Writing and sending are now separate. A reader can put their question into
words before the connection exists; only Send waits. If the connection is made
in another tab, the composer enables when this one is looked at again, without
a reload.

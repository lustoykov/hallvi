---
name: operate
description: Use Hallvi to inspect or operate an existing self-hosted application, including deployment checks, diagnosis, updates and server operations. Use when the user asks to use Hallvi; not for developing Hallvi itself.
---

Use the Hallvi MCP tools. The controller and its Pi operator own application
work, permissions, history and execution evidence.

1. Call `hallvi_apps`, identify the intended application, then `hallvi_inspect`.
   Confirm its identity, host, main conversation and permission mode. Existing
   interrupted work or an unavailable worker requires attention in Hallvi.
2. For a new request, call `hallvi_exec` with a fresh lowercase UUID
   `request_key` and the user's bounded application request. Never send this
   skill, contributor instructions, credentials or a broader operating scope.
3. Keep the returned handle. `accepted: true` is acceptance, not success.
   If acceptance is unknown, follow the handle or retry the exact message with
   the same key. Never invent a new key to get past a failed connection.
4. Call `hallvi_wait` on that handle. Waits stop observing after at most twenty
   seconds and do not stop work. Approval/input waits and interrupted work
   carry a Hallvi page; the owner approves, supplies input, continues or stops
   there. Never bypass the wait or change the permission mode.
5. Report the answer and execution evidence. Completed means Pi finished its
   reply, not that the deployment or repair worked. Inspect a specific
   execution when an excerpt is insufficient; report omitted or unknown facts.

`hallvi_open` shows a read-only application panel where supported. Tools also
work without UI. A remote controller's loopback handle belongs to that server;
pass it to `hallvi_wait`, never fetch it from the user's laptop. The configured
page URL is for the user's browser, often through an SSH local forward.

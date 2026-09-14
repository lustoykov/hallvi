# SSH from managed Codex cloud

Research date: 2026-09-14. This note concerns OpenAI-hosted Codex cloud containers,
not the desktop app or a CLI running on an owner-controlled machine.

## Finding

The owner wants a native managed-cloud setting for outbound SSH, without extra
tunnels or application code. No such setting was found in the official docs.
Do not introduce a tunnel to satisfy a requirement that explicitly excludes one.

OpenAI documents an HTTP/HTTPS outbound proxy and controls for domains and HTTP
methods. The reviewed docs do not list a port-opening control or promise arbitrary
TCP, HTTP CONNECT to port 22, or WebSocket support. The absence of those promises
does not establish that every proxied SSH route is impossible.
([Environments](https://developers.openai.com/codex/cloud/environments),
[internet access](https://developers.openai.com/codex/cloud/internet-access))

## Existing proxy evidence

The coordinating task tested direct TCP to the owner's development server on
port 22: it failed with `Network is unreachable`. A subsequent standard proxy
CONNECT probe received a successful CONNECT response, then the stream closed
without an SSH greeting (`recv` returned zero bytes). This is not proof of a usable
SSH connection. An HTTPS-style curl probe received CONNECT success but failed TLS
certificate-purpose validation; TLS verification was not disabled. These are
setup-container observations, not authenticated agent-phase deployment proof.

HTTP CONNECT asks a proxy to open a connection to a destination host and port. An
accepted tunnel can carry another protocol. The HTTP specification permits proxies
to restrict destinations and ports; a successful HTTPS CONNECT to 443 does not
establish permission for port 22.
([RFC 9110, CONNECT](https://www.rfc-editor.org/rfc/rfc9110.html#name-connect))

OpenSSH supports a `ProxyCommand` that supplies its byte stream. OpenBSD netcat
supports HTTP CONNECT using `-X connect` and `-x proxy:port`. These are standard
client capabilities, not proof that OpenAI's managed proxy accepts the requested
SSH destination. A bounded, unauthenticated CONNECT probe to the owner's existing
server can distinguish a supported route from an explicit denial. Stop if denied;
do not disguise traffic or try to evade policy.
([OpenSSH](https://man.openbsd.org/ssh_config#ProxyCommand),
[netcat](https://man.openbsd.org/nc#X))

## Investigated alternative, excluded by owner preference: Cloudflare Access

Cloudflare supports this transport, but compatibility with Codex cloud is unverified
and it does not meet the owner's request for native outbound SSH.

```text
Codex cloud: OpenSSH → cloudflared client
  → configured outbound proxy → HTTPS/WebSocket → Cloudflare Access
  → Cloudflare Tunnel connector on the server → sshd on localhost:22
```

Cloudflare's published SSH route uses `ssh://localhost:22`; the client uses
`cloudflared access ssh` as OpenSSH's `ProxyCommand`. The SSH protocol still runs
end to end, while the cloud container's external connection is HTTPS/WebSocket.
Cloudflare recommends its Client-to-Tunnel alternative for long-lived sessions,
so long operations and reconnect behavior need testing.
([Routing](https://developers.cloudflare.com/tunnel/concepts/routing/),
[SSH client setup](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/use-cases/ssh/ssh-cloudflared-authentication/))

Headless authentication is possible: Access service tokens supply a Client ID and
Client Secret, authorized by the Access application's policy. They are separate
from a Cloudflare management API token and from the SSH private key.
([Service tokens](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/))

Source inspected at cloudflared commit
`f11dea9cb7079e90a982c1a2d5548ab40847fdcf`:

- The access command accepts `TUNNEL_SERVICE_TOKEN_ID` and
  `TUNNEL_SERVICE_TOKEN_SECRET`; `ssh` is an alias of the TCP access command.
  [Command source](https://github.com/cloudflare/cloudflared/blob/f11dea9cb7079e90a982c1a2d5548ab40847fdcf/cmd/cloudflared/access/cmd.go#L133-L176)
- Its WebSocket dialer sets `Proxy: http.ProxyFromEnvironment`, so the client is
  designed to use an environment-configured forward proxy.
  [Dialer source](https://github.com/cloudflare/cloudflared/blob/f11dea9cb7079e90a982c1a2d5548ab40847fdcf/carrier/websocket.go#L43-L62)

Remaining unknowns: Codex proxy policy for this use, WebSocket upgrade/streaming
support, proxy trust certificates in cloudflared, agent-phase allowlisting, and
session duration. Do not infer these from ordinary HTTPS API success. Do not
deploy a relay to work around an explicit platform denial; establish permission
for the transport first.

## Application implications

If an alternative were reconsidered, these details would matter:

- `runHostCommand` in `src/server/operator-execution.ts` and the terminal in
  `src/server/terminal-session.ts` use `ssh -F /dev/null`, intentionally ignoring
  `~/.ssh/config`. A ProxyCommand configuration alone would not affect them.
- `scanHostKey` in `src/server/server-access.ts` calls `ssh-keyscan` directly;
  it would need a supported route and verified host-key handling too.
- Review `src/server/private-access.ts` for the same transport, including app
  preview forwarding. Preserve pinned host keys and strict host-key checking.

Cloudflared also supports a loopback TCP listener through
`cloudflared access tcp --hostname ssh.example.com --url 127.0.0.1:2222`.
The command's `--url` branch calls the TCP forwarder
([source](https://github.com/cloudflare/cloudflared/blob/f11dea9cb7079e90a982c1a2d5548ab40847fdcf/cmd/cloudflared/access/carrier.go#L108-L121)).
In principle the manual-host path could use that address and port without changing
`ssh-keyscan` or adding ProxyCommand. It still needs the SSH key and a trusted host
fingerprint. Supplying `serverId` instead resolves the Hetzner public IP, so it
would not automatically route a newly provisioned server through the listener.
This is an untested alternative, not an implementation recommendation.

No application implementation or provider changes were made by this research.
The remaining useful step for the stated requirement is to ask OpenAI whether
native outbound TCP/SSH can be enabled for managed cloud environments. Until that
is confirmed, this environment cannot be claimed to meet the full deployment
testing requirement. No network workaround is recommended here.

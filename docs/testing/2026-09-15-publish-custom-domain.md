# Publishing an application at the owner's own domain

15 September 2026. Branch `claude/publish-custom-domain-fcec37`, implementation
at `3381f34` plus the four defect fixes described below. Controller run from the
worktree on `127.0.0.1:3510` with its own empty schema-15 database, the shared
Pi account, the existing Hetzner connection and the existing Cloudflare token.
No GitHub connection: the target repository is public.

Everything below is a real run. The model was the configured Pi, the provider
was real Hetzner, the DNS provider was real Cloudflare, the certificate was a
real Let's Encrypt certificate, and every external reading was taken from the
MacBook rather than from the server it is about.

## What was authorized

The owner authorized exactly one hostname —
`sg-publish-test.accountant-agent.com` — in the `accountant-agent.com` zone, and
one small Hetzner server for a few hours, to be deleted at the end. Both are
recorded in the durable inventory under owner UUID
`d6bbf454-0d68-4a12-a8b0-536960fecfff`. Nothing else in that zone was touched;
see the withdrawal check below.

## The application

[TryGhost/ghost-docker](https://github.com/TryGhost/ghost-docker) at revision
`baba392`: Ghost 6.63.0 with MySQL 8.0.44, chosen because it has the four things
this milestone needs to exercise — an unclaimed first-run setup page, an
application URL that must match the public hostname, uploads, and a database
that must stay private. The repository also ships its own Caddy edge, so
"reuse an existing appropriate proxy" is a real decision rather than a
hypothetical one.

Server: Hetzner CX23 in Nuremberg, `2.28.78.41`, €5.99/month including IPv4.

## Private deployment first

Asked as an owner would ask: *"I want to run my blog on this… Keep access
private to this machine for now; I will give you a domain later."*

Pi read `compose.yml`, **dropped the repository's Caddy service and its public
ports**, bound Ghost to `127.0.0.1:2368`, kept MySQL on the Compose network
only, and set the provider firewall to SSH alone. It said so before doing it:
*"Caddy and public web ports will remain disabled until you provide a domain."*
Deployment, verification and a local backup schedule took about ten minutes.

## Publishing

Started from the product's own affordance: **Domains → "Publish at a domain…"**,
which drafts `Publish Quokka Notes at my own domain name. The hostname is: ` in
the composer with the caret at the end. The hostname was typed there. Permission
mode was **Pi decides** for the whole publishing run.

**The unclaimed setup page was caught before anything became public.** Ghost's
`/ghost/api/admin/authentication/setup/` reported `{"setup":[{"status":false}]}`,
and Pi stopped:

> The first Ghost owner account is still unclaimed. It must be created before
> public ingress is enabled so a visitor cannot claim it.
>
> I'm waiting for these values; no public firewall or DNS changes have been made
> yet.

It asked for the display name and email in chat and for the password through the
masked private-input field (`GHOST_OWNER_PASSWORD`), which is the existing
mechanism. The password was a synthetic value generated for this fixture.

The plan it stated before acting was the intended one:

- reuse the repository's own Caddy service, which "automatically obtains and
  renews HTTPS certificates, reaches Ghost by its Compose service name, and
  already has persistent named volumes for `/data` and `/config`";
- keep Ghost on `127.0.0.1:2368` and MySQL private;
- update Ghost's canonical URL;
- add an **unproxied** A record to `2.28.78.41`;
- open only 80 and 443 alongside SSH.

One approval was requested and granted during the run — disabling Ghost's staff
device verification, because SMTP is not configured and new-device email codes
would otherwise lock the owner out of a working password login. Pi read Ghost's
own running code to establish that, offered the two options, and named SMTP as
the better long-term answer.

## What was verified, and from where

Every reading in this section was taken from the MacBook with `dig`, `curl`,
`openssl` and a raw TCP probe — a second vantage point, independent of the
product's own `check_public_access`.

| Check | Result |
| --- | --- |
| Public DNS (1.1.1.1) | `A → 2.28.78.41`. **No AAAA**, and Pi recorded that absence explicitly (`records = A 2.28.78.41; no AAAA or CNAME`). |
| HTTPS by name | `200`, `remote_ip 2.28.78.41` — the origin itself answered, not an edge. |
| Certificate | Let's Encrypt, `CN=sg-publish-test.accountant-agent.com`, serial `05F314839BB064C5EF8234DC79714E35DE33`, valid 15 Sep – 14 Dec 2026, chain trusted (`ssl_verify_result=0`). |
| Plain HTTP | `308 → https://sg-publish-test.accountant-agent.com/`. |
| Sign-in through the public URL | `POST /ghost/api/admin/session/` → `201`; `GET /users/me/` → `200`, Owner "Quokka Editor". |
| Upload through the public URL | A 4.6 MB PNG accepted (`201`), returned at its **public** URL — Ghost's canonical URL was correctly set. |
| Derived processing | `/content/images/size/w600/…` served an 857 KB variant of the 4.6 MB original: the sizing pipeline really ran. |
| Published content | A post with the image returned `200` at the public URL with a full responsive `srcset`. |
| Ports from the internet | 22, 80, 443 open. **2368 (Ghost) and 3306 (MySQL) dropped**, as was an unused port. |

Direct-origin versus edge is established, not assumed: the record is unproxied,
and the address that completed the TLS handshake and served the certificate is
the server's own address.

## Identity, data and credentials survived

Read over SSH after publishing:

- `quokka-notes-db-1` was **created at 12:07:42**, before publishing, and never
  recreated — the database container from the private deployment is the one
  serving the published site. MySQL's data is a host bind mount at
  `/var/lib/quokka-notes/mysql`; Ghost's content at `/var/lib/quokka-notes/ghost`.
- Ghost was restarted in place (12:27:05) because its `url` changed. Caddy was
  added (12:21:56). No second deployment, no new volumes, no reset.
- `ss -lntp` on the host: `127.0.0.1:2368` for Ghost, `0.0.0.0:80/443` and
  `[::]:80/443` for Caddy, `0.0.0.0:22` for SSH. Nothing else.
- Generated database credentials were untouched and still listed on Environment
  Variables, by name only.

## The public path does not need the owner's Mac

This task's controller (`next dev`, pid 40996), its worker and its SSH tunnel
were identified by exact worktree path and stopped. Two other sessions' servers
and tunnels on this machine were left running and verified still running.

With nothing of ours alive — `127.0.0.1:3510` and `127.0.0.1:2368` both refusing
— the site returned `200`, the post returned `200` and the image returned `200`,
all from `2.28.78.41`.

## Restart, and what renewal actually rests on

`docker compose down && docker compose up -d` destroyed and recreated all three
containers. Afterwards the certificate served was **byte-identical** — same
serial, same SHA-256 fingerprint, same dates — so it was loaded from the
`quokka-notes_caddy_data` named volume rather than re-issued. The ACME account
and certificate files were confirmed on that volume. The site, the post and both
images were unchanged.

**Limit, stated plainly: no renewal was observed.** What is verified is the
configuration and the persistence that a renewal depends on — Caddy's automatic
ACME management and certificate state on a volume that survives replacement.
The certificate expires on 14 December 2026, so an actual renewal could only be
watched in mid-November. Nothing in this report claims otherwise, and the
product's guidance refuses to claim it either.

## A real failure, and the page that had to tell the truth

Ghost was stopped by hand over SSH. The name still resolved and still served a
valid certificate; the origin returned **502**. This is the exact case that
would otherwise read as a working site.

Asked only *"my blog looks broken"*, Pi checked from outside first and recorded:

> **The hostname resolves but currently serves a Caddy error** —
> `configured=passed  resolves=passed  serves=failed`

The Domains page changed accordingly, without being told what to say: the
headline tag became "sg-publish-test.accountant-agent.com **does not answer**",
the visitor's window read "This page isn't working — The name resolved and the
connection was made. Nothing came back from the application", and the page's
action changed from "Make it private again" to "Finish publishing it".

Pi then named the cause correctly — Ghost manually stopped — restarted it,
confirmed all 97 tables, the published post and the claimed owner intact, and
listed SMTP, off-site backups and uptime monitoring as outstanding. Verified
here afterwards: site, post and image all `200`.

## Making it private again

Started from **Domains → "Make it private again"**, which drafts a request that
also says what not to touch: *"leave SSH and anything you did not create alone"*.

Verified from the MacBook afterwards:

- `sg-publish-test.accountant-agent.com` no longer resolves at 1.1.1.1 or 8.8.8.8.
- `https://2.28.78.41/` and `http://2.28.78.41/` no longer connect at all.
- `http://127.0.0.1:2368` returns `200` — the private way in is back.
- **The zone's nine other records are exactly as they were**, each keeping its
  own owner comment. Only the record this application created was removed, and
  the remove call requires the address it expects to find.

The Domains page returned to "Only one kind of visitor reaches Quokka Notes
today", "No name, no certificate", and offers "Publish at a domain…" again.

## Four defects this run found, and their fixes

Each was found by looking at the product's own pages during the run, and each is
fixed with a regression test.

1. **A published address claimed to answer because it was public.** The access
   endpoint reported any non-private mode as reachable without asking anything.
   It now makes a real request to the recorded public URL, the same way the
   private side asks the tunnel.
2. **The access row contradicted the name's own row.** With `serves=failed`
   recorded, Domains still showed "It answers on the internet · A check proved
   this". The access record says *where* the application is reached and is not
   rewritten when it falls over, so a failing `serves` check on that same
   hostname now governs the row.
3. **A withdrawn name was still drawn as a way in.** After withdrawal the page
   correctly said "No name, no certificate" and still showed a window reading
   "The name reaches this application", built from checks recorded while the
   name existed. An established absence now removes the row.
4. **An absence carried passing checks.** Pi wrote the withdrawal as
   `states: domain absent` with `configured/resolves/serves = passed`, which is
   what produced defect 3's records. The save-time contract now refuses a
   passing check about a subject the same record says is not there, and tells
   Pi to write the withdrawal as its own event instead.

## Limitations

- **No renewal was observed.** See above.
- **Duplicate doors.** Pi used different subject ids for the same ports across
  turns (`port TCP 3306` at 15:08, `port 3306/TCP` at 15:45), so the page counted
  seven ways to knock where there were five. Both records are true; neither can
  supersede the other, because a different id is a different subject. The
  guidance now says a door keeps the id it was given. Records already written
  keep both entries.
- **One application, one provider.** Cloudflare DNS, Hetzner, Caddy, Ghost. The
  DNS write path is Cloudflare-only, because that is the provider the controller
  has. Nothing here establishes another registrar or another proxy.
- **No IPv6 AAAA was published.** Caddy does listen on `[::]:80/443`, so an AAAA
  is possible; it was not added, and no visitor path over IPv6 was proved.
- **SMTP is unconfigured** on the fixture, so Ghost's staff device verification
  was disabled by owner approval. That is a property of this test deployment.
- **The probes are one vantage point.** `check_public_access` and the checks
  above both run from one machine on one network with its own resolvers. They
  do not establish what the whole internet sees.
- **Stale public evidence** is handled by the existing projection and its unit
  tests rather than by waiting out a freshness horizon in this run.

## Cleanup

Every resource created for this run is recorded under owner UUID
`d6bbf454-0d68-4a12-a8b0-536960fecfff` in the local inventory at
`~/Library/Application Support/Server Guy/development-cleanup/`, with the
`sg-*` development labels applied to each Hetzner resource. See the PR
description for the disposition recorded at the end of the task.

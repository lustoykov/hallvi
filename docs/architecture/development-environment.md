# The persistent development environment

Four stores, and who owns each. Losing any one of them loses something the
others cannot bring back: rows without conversations are records nobody can
read, and conversations without the applications' own data describe a host that
no longer holds what they describe.

```mermaid
flowchart LR
    subgraph mac["Owner's MacBook"]
        subgraph installed["The owner's installation — not this"]
            svc["com.hallvi on 4747\n~/.local/share/hallvi"]
        end
        subgraph env["~/.local/share/hallvi-dev"]
            prog["program/\na checkout pinned to a revision"]
            state["state/\ncontroller database\nconversations\ncredentials"]
            back["backups/\nverified copies"]
            claims["claims.json\nwho is changing what"]
        end
        ctl["Controller and Pi worker\n127.0.0.1:5147"]
    end
    subgraph host["Hetzner cx23 166459264 — 46.62.253.6"]
        caddy["Caddy on 80/443"]
        who["whoami\nno state at all"]
        kuma["Uptime Kuma\nits own SQLite"]
        mini["Miniflux\nits own PostgreSQL"]
        paper["Paperless\nPostgreSQL, Redis,\nworkers, documents"]
    end

    prog --> ctl
    state --> ctl
    ctl -->|"managed SSH key"| caddy
    caddy --> who
    caddy --> kuma
    caddy --> mini
    caddy --> paper
    kuma -.->|"watches"| who
    kuma -.->|"watches"| mini
    state -.->|"before any upgrade"| back
    claims -.->|"read before changing anything"| ctl
```

The controller is an ordinary background process, not a service. The service
manager knows one Hallvi per user — launchd's `com.hallvi` — and that one is
the owner's installation; a second copy that started or stopped "its" service
would replace it.

Owned by [the development environment](../development-environment.md).

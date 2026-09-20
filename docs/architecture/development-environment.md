# Where the records live, and which of them travel

Four kinds of state, and only one of them ever leaves this machine. The thing
worth holding in mind is that a release carries **code**: it never carries
records, and it never fetches them. An installed user's records are made on
their own machine the first time they run Hallvi, and are only ever changed
there.

```mermaid
flowchart LR
    subgraph mac["Owner's MacBook"]
        subgraph src["Source"]
            designated["the designated checkout<br/>npm run dev · .env.local"]
            worktree["a task worktree<br/>npm run dev · its own .hallvi"]
        end
        subgraph kept["~/.local/share/hallvi-dev"]
            state["state/<br/>database · conversations<br/>credentials · connections"]
            backups["backups/<br/>and migration copies"]
        end
        installed["the owner's own installation<br/>com.hallvi on 4747<br/>~/.local/share/hallvi"]
    end
    subgraph host["Hetzner cx23 — 46.62.253.6"]
        apps["whoami · Uptime Kuma<br/>Miniflux · Paperless<br/>and their own databases"]
    end
    subgraph release["A release"]
        archive["hallvi-&lt;version&gt;-&lt;platform&gt;.tgz<br/>program, Node.js, schema<br/>signed manifest"]
    end
    subgraph user["Somebody else's machine"]
        theirs["their installation<br/>and their own records,<br/>made there, never sent"]
    end

    designated -->|"opens, on 5147"| state
    worktree -.->|"never"| state
    state -->|"managed SSH key"| apps
    state -.->|"before any upgrade"| backups
    designated ==>|"npm run package<br/>code only"| archive
    archive ==>|"install-hallvi.sh"| theirs
    archive -.->|"never carries"| state
    installed -.->|"untouched by development"| designated
```

The dotted edges are the ones to remember.

**A task worktree does not reach the retained state.** It has no `.env.local`,
so it keeps a throwaway database beside its own source. Attaching every
checkout by default is how four live applications would acquire a second
writer nobody meant to start.

**A release carries no records.** `scripts/package.mjs` copies an explicit
list of paths; `.hallvi`, the state directory, backups, secrets and every
database are unreachable by it. An installed user's records are created by
their own first run and migrated in place on their own machine — publishing a
release migrates nobody.

**The owner's own installation is not this.** It is a normal installed Hallvi
on port 4747, with its own records under `~/.local/share/hallvi`, and
development never starts, stops or upgrades it.

Owned by [the development environment](../development-environment.md) and
[Installing Hallvi](../installation.md).

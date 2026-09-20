# Upgrading records, and getting them back

Two ways of upgrading, one list of migrations, and one order of operations.
The order is the safety: everything that can refuse does so while the old
program is still in place and still serving.

```mermaid
flowchart TD
    ask{"Does the program's schema<br/>match the records?"}
    ask -->|"yes"| swap
    ask -->|"no"| known{"Is this transition in<br/>scripts/migrations.mjs?"}
    known -->|"no"| refuse["Refused, naming both schemas.<br/>Nothing downloaded, nothing changed."]
    known -->|"yes"| hold["Pi stops taking work.<br/>Work in progress stops the update instead."]
    hold --> stop["The service stops.<br/>Nothing is writing."]
    stop --> copy["Copy exactly the stores this<br/>transition rewrites, and verify it"]
    copy -->|"does not verify"| refuse
    copy --> migrate["Migrate, with the old program still in place"]
    migrate -->|"fails"| back
    migrate --> swap["Replace the program and start it"]
    swap --> well{"Interface reports the new revision<br/>and the worker answers?"}
    well -->|"no"| back["Put the records back from the copy,<br/>then the program back from the one kept.<br/>Start it again."]
    well -->|"yes"| done["Done. The copy is kept:<br/>it is the only way back."]
```

The last edge is the one worth stating on its own. **Restoring the old program
is not a rollback once its database has been migrated under it**: it would meet
a schema it does not know and refuse to open it, correctly. So the records go
back first, from a copy made before anything was touched, and the recovery is a
file copy that needs no program to be intact.

A transition declares which stores it rewrites, and only those are copied.
Nothing so far touches Pi's conversation histories, recorded evidence, sealed
credentials or the deployed applications' own data — an unchanged file needs no
rollback, and copying credentials nothing is going to write would only be a
second place for them to leak from.

Owned by [Installing Hallvi](../installation.md#update); the list itself is
[scripts/migrations.mjs](../../scripts/migrations.mjs).

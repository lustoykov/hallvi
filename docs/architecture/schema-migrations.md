# Upgrading records, and getting them back

Two ways of upgrading, one list of migrations, and one order of operations.
The order is the safety: everything that can refuse does so while the old
program is still in place and still serving.

```mermaid
flowchart TD
    ask{"Does the release's schema<br/>match the records?"}
    ask -->|"yes"| swap
    ask -->|"no"| known{"Does the signed manifest's<br/>migratesFrom name this schema?"}
    known -->|"no"| refuse["Refused, naming both schemas.<br/>Nothing downloaded, nothing changed."]
    known -->|"yes"| hold["Pi stops taking work.<br/>Work in progress stops the update instead."]
    hold --> stop["The service stops.<br/>Nothing is writing."]
    stop --> again{"Does the archive's own<br/>migrations.mjs agree?"}
    again -->|"no"| refuse
    again -->|"yes"| copy["Copy exactly the stores this<br/>transition rewrites, and verify it"]
    copy -->|"does not verify"| refuse
    copy --> migrate["Migrate, with the old program still in place"]
    migrate -->|"fails"| back
    migrate --> swap["Replace the program and start it"]
    swap --> well{"Interface reports the new revision<br/>and the worker answers?"}
    well -->|"no"| back["Stop, and wait for the service manager to agree.<br/>Then the records back from the copy,<br/>then the program back from the one kept.<br/>Start it again."]
    well -->|"yes"| done["Done. The copy is kept:<br/>it is the only way back."]
```

Two edges are worth stating on their own.

**The question is asked of the release, not of the program reading it.** A
migration from one schema to the next is written in the version that
introduces the new schema, so the installation deciding whether to download it
is by definition too old to know the migration exists. The claim is signed
with the rest of the manifest and checked again, from the unpacked archive's
own list, once it is on the machine.

**Restoring the old program is not a rollback once its database has been
migrated under it**: it would meet
a schema it does not know and refuse to open it, correctly. So the service is stopped
and confirmed gone first — a start that failed can leave one loaded and being
retried — then the records go back from a copy made before anything was
touched, and then the program. The recovery is a file copy that needs no
program to be intact.

A transition declares which stores it rewrites, and only those are copied.
Nothing so far touches Pi's conversation histories, recorded evidence, sealed
credentials or the deployed applications' own data — an unchanged file needs no
rollback, and copying credentials nothing is going to write would only be a
second place for them to leak from.

Owned by [Installing Hallvi](../installation.md#update); the list itself is
[scripts/migrations.mjs](../../scripts/migrations.mjs).

# What a Connections row does

Every row on Settings › Connections used to link to `/applications` whatever
its button said, so "Connect" for Hetzner reached the applications list, and
`hetzner.ts` told the reader to connect Hetzner in Settings — the page they
had just left. Each row now leads to the one place that can do the thing it
names.

```mermaid
flowchart TD
  R[Connection row] --> C{Credential connected?}
  C -- no --> F[Form on this page] --> P[POST /api/setup/...] --> V{Provider accepts?}
  V -- yes --> S[Saved on the controller, inventory refreshed]
  V -- no --> E[The provider's own words, token kept in the field]
  C -- yes --> A{How many applications?}
  A -- none --> N[Say so, offer Add application]
  A -- one --> O[Open that application, named on the link]
  A -- several --> L[Offer the list, the choice stays the reader's]
```

Three credentials, three rows, because they are obtained separately: the
Hetzner Cloud API token, the Cloudflare **management** token (zones, DNS, and
listing or creating R2 buckets), and an **S3 access key pair** that can write
a backup object into a bucket. A working management token is not a working
backup destination. The Backup storage row opens the same
`BackupStorageForm` the application's Backups page uses, posting to the same
route; it needs no application, so it is offered here directly.

A token is typed into a password field and posted in a same-origin JSON body.
It is never put in a URL, a query string, a chat message or a log, and nothing
about it is returned to the browser beyond what the provider established. It
is saved as a plaintext file, mode 0600, in the controller's config directory,
and travels inside Hallvi's encrypted self-backup once backup storage is
connected. Connecting an account changes nothing by itself; what happens next
follows the application's [permission mode](../../PRODUCT.md#permission-modes),
and only Always ask guarantees a prompt.

When a conversation needs a server or a domain, the credential is taken there
instead, by the [onboarding cards](../design/onboarding.md); this page remains
the inventory for deliberate management.
